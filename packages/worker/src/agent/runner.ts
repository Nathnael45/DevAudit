import Anthropic from '@anthropic-ai/sdk';
import { cloneRepo, cleanupRepo } from '../scanner/gitClone';
import { runSemgrep } from '../scanner/semgrep';
import { runBandit } from '../scanner/bandit';
import { runGitleaks } from '../scanner/gitleaks';
import { ScanResult } from '../scanner/scanResult';
import { claimAuditForRun, finishAudit, isAuditStillRunning, updateAuditTimings, saveEvent, saveFinding } from '../utils/db';
import { emit } from '../utils/broadcaster';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How often the Claude stream re-checks for a cancel. The stream is the long,
// paid part of an audit, so it's worth stopping early — but not worth a DB
// round-trip on every token delta.
const CANCEL_CHECK_INTERVAL_MS = 5000;

export class AuditCancelledError extends Error {
  constructor() {
    super('Audit was cancelled');
  }
}

// Runs fn, reporting how long it took alongside its result — used so the three
// scanners can be timed individually while still running concurrently, which is
// what lets you honestly compare parallel wall-clock time against the sum of
// serial durations (the actual payoff of running them in parallel at all).
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}

// Claude's response ends with a <findings>[...]</findings> block containing the
// structured JSON array; everything before it is the narrated analysis/summary.
export function extractFindings(fullText: string): { findings: any[]; parseFailed: boolean } {
  const findingsMatch = fullText.match(/<findings>([\s\S]*?)<\/findings>/);
  if (!findingsMatch) return { findings: [], parseFailed: false };

  try {
    return { findings: JSON.parse(findingsMatch[1].trim()), parseFailed: false };
  } catch {
    return { findings: [], parseFailed: true };
  }
}

export function isOverloadedError(err: any): boolean {
  return Boolean(err?.error?.error?.type === 'overloaded_error' || err?.message?.includes('overloaded'));
}

// Noisy real-world repos can return thousands of raw findings (a large Python
// codebase can easily produce several thousand Bandit hits), so only a bounded
// slice gets forwarded to the AI to keep the prompt focused and cost
// predictable. Sorting by severity first means that slice is the most
// important findings rather than whatever order the tool happened to emit
// them in (typically file order).
export const SEMGREP_SEVERITY_RANK: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
export const BANDIT_SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function sortBySeverityRank<T>(findings: T[], severityOf: (f: T) => string, rank: Record<string, number>): T[] {
  return [...findings].sort((a, b) => (rank[severityOf(a)] ?? 99) - (rank[severityOf(b)] ?? 99));
}

// Makes truncation visible to whoever's watching the live thought stream,
// instead of silently reviewing an arbitrary subset of the raw findings.
export function foundMessage(tool: string, count: number, limit: number, unit: string): string {
  return count > limit
    ? `${tool} found ${count} potential ${unit} — reviewing the ${limit} highest-severity for deep analysis.`
    : `${tool} found ${count} potential ${unit}.`;
}

// A scanner that timed out or crashed returns no findings, which on its own
// would read as "nothing found". These make the gap visible in the prompt and
// in the saved report.
export function scanSection(tool: string, result: ScanResult<unknown>, body: string, emptyText: string): string {
  if (result.error) {
    return `SCAN INCOMPLETE — ${tool} ${result.error}. Its results are missing; do not treat the absence of ${tool} findings as evidence the code is clean.`;
  }
  return body || emptyText;
}

export function coverageNote(scanErrors: string[]): string {
  if (scanErrors.length === 0) return '';
  return `> **Incomplete scan:** ${scanErrors.join('; ')}. Findings from ${scanErrors.length === 1 ? 'that tool are' : 'those tools are'} missing from this report.\n\n`;
}

export async function runAudit({ auditId, repoUrl }: { auditId: string; repoUrl: string }) {
  const timings: Record<string, number> = {};

  async function thought(msg: string) {
    await saveEvent(auditId, 'thought', msg);
    emit(auditId, 'thought', { content: msg });
    console.log(`[agent][${auditId}] ${msg}`);
  }

  // Scanner subprocesses can't be interrupted cleanly, so cancellation is
  // checked between phases (and periodically during the Claude stream).
  async function throwIfCancelled() {
    if (!(await isAuditStillRunning(auditId))) throw new AuditCancelledError();
  }

  if (!(await claimAuditForRun(auditId))) {
    console.log(`[agent][${auditId}] skipped — cancelled or deleted before it started`);
    return;
  }

  try {
    emit(auditId, 'status', { status: 'running' });

    // 1. Clone
    await thought(`Cloning repository: ${repoUrl}`);
    const [repoPath, cloneMs] = await timed(() => cloneRepo(auditId, repoUrl));
    timings.cloneMs = cloneMs;
    await throwIfCancelled();
    await thought(`Repository cloned. Starting static analysis...`);

    // 2. Static analysis (parallel)
    await thought(`Running Semgrep (auto config) across all files...`);
    await thought(`Running Bandit (Python security linter)...`);
    await thought(`Running Gitleaks (secrets scanner)...`);

    const scanWallStart = Date.now();
    const [
      [semgrepResult, semgrepMs],
      [banditResult, banditMs],
      [gitleaksResult, gitleaksMs],
    ] = await Promise.all([
      timed(() => runSemgrep(repoPath)),
      timed(() => runBandit(repoPath)),
      timed(() => runGitleaks(repoPath)),
    ]);
    timings.scanWallMs = Date.now() - scanWallStart;
    timings.semgrepMs = semgrepMs;
    timings.banditMs = banditMs;
    timings.gitleaksMs = gitleaksMs;
    await throwIfCancelled();

    const semgrepFindings = semgrepResult.findings;
    const banditFindings = banditResult.findings;
    const gitleaksFindings = gitleaksResult.findings;
    const scanErrors = ([['Semgrep', semgrepResult], ['Bandit', banditResult], ['Gitleaks', gitleaksResult]] as const)
      .filter(([, r]) => r.error)
      .map(([tool, r]) => `${tool} ${r.error}`);

    const SEMGREP_LIMIT = 30;
    const BANDIT_LIMIT = 30;
    const GITLEAKS_LIMIT = 20;

    const sortedSemgrep = sortBySeverityRank(semgrepFindings, f => f.extra.severity, SEMGREP_SEVERITY_RANK);
    const sortedBandit = sortBySeverityRank(banditFindings, f => f.issue_severity, BANDIT_SEVERITY_RANK);

    const scanReports = [
      ['Semgrep', semgrepResult, SEMGREP_LIMIT, 'issues'],
      ['Bandit', banditResult, BANDIT_LIMIT, 'issues'],
      ['Gitleaks', gitleaksResult, GITLEAKS_LIMIT, 'secrets'],
    ] as const;
    for (const [tool, result, limit, unit] of scanReports) {
      await thought(result.error
        ? `Warning: ${tool} ${result.error} — its results will be missing from this audit.`
        : foundMessage(tool, result.findings.length, limit, unit));
    }
    await thought(`Passing findings to AI for deep analysis...`);

    // 3. Build context for Claude
    const semgrepSummary = sortedSemgrep.slice(0, SEMGREP_LIMIT).map(f =>
      `[${f.check_id}] ${f.path}:${f.start.line} — ${f.extra.message} (${f.extra.severity})`
    ).join('\n');

    const banditSummary = sortedBandit.slice(0, BANDIT_LIMIT).map(f =>
      `[${f.test_id}/${f.test_name}] ${f.filename}:${f.line_number} — ${f.issue_text} (severity: ${f.issue_severity}, confidence: ${f.issue_confidence})`
    ).join('\n');

    const gitleaksSummary = gitleaksFindings.slice(0, GITLEAKS_LIMIT).map(f =>
      `[${f.RuleID}] ${f.File}:${f.StartLine} — ${f.Description} (match: ${f.Match.slice(0, 40)}...)`
    ).join('\n');

    const systemPrompt = `You are DevAudit, an expert security engineer conducting a thorough code security audit.
You have been given the output of automated static analysis tools on a GitHub repository.
Your job is to:
1. Reason through each finding — think out loud about whether it's a real vulnerability or a false positive
2. Classify each real finding by severity: critical, high, medium, low, or info
3. For each confirmed vulnerability, provide: a clear title, description of the risk, and a concrete fix recommendation
4. Produce a final executive summary

As you work, narrate your thinking process. This stream is displayed live to the user.
Format your final findings as a JSON array at the end inside <findings></findings> tags.

Finding schema:
{
  "filePath": string,
  "lineStart": number,
  "lineEnd": number,
  "severity": "critical"|"high"|"medium"|"low"|"info",
  "category": string,
  "title": string,
  "description": string,
  "recommendation": string
}`;

    const userMessage = `Repository: ${repoUrl}

## Semgrep Findings (${semgrepFindings.length} total, showing first 30):
${scanSection('Semgrep', semgrepResult, semgrepSummary, 'No findings.')}

## Bandit Findings (${banditFindings.length} total, showing first 30):
${scanSection('Bandit', banditResult, banditSummary, 'No findings.')}

## Gitleaks Findings — Exposed Secrets (${gitleaksFindings.length} total, showing first 20):
${scanSection('Gitleaks', gitleaksResult, gitleaksSummary, 'No secrets found.')}

Please analyze these findings, think through each one carefully, identify real vulnerabilities, and produce your security report.`;

    // 4. Stream Claude's reasoning
    await thought(`AI analysis started. Streaming reasoning...`);
    const aiStart = Date.now();

    let fullText = '';
    let textBuffer = '';
    let lastFlush = Date.now();
    let lastCancelCheck = Date.now();

    const flushBuffer = () => {
      if (!textBuffer) return;
      emit(auditId, 'text_delta', { delta: textBuffer });
      textBuffer = '';
      lastFlush = Date.now();
    };

    // Retry up to 3 times on overloaded_error with exponential backoff
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-5',
          // 8000 was silently truncating full findings JSON on noisy repos —
          // e.g. mitmproxy's response was cut off mid-<findings> block with
          // zero findings saved despite genuine analysis underway (narration
          // alone reasoning through ~80 candidate findings can run well past
          // 8000 tokens). Sonnet 5 supports up to 128K output with streaming
          // (already the case here via .stream()); 32000 gives real headroom
          // without leaving the ceiling unbounded.
          max_tokens: 32000,
          thinking: { type: 'adaptive' } as any,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        for await (const event of stream) {
          if (Date.now() - lastCancelCheck > CANCEL_CHECK_INTERVAL_MS) {
            lastCancelCheck = Date.now();
            if (!(await isAuditStillRunning(auditId))) {
              stream.abort();
              throw new AuditCancelledError();
            }
          }
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta') {
              // skip thinking deltas — too noisy over HTTP
            } else if (event.delta.type === 'text_delta') {
              fullText += event.delta.text;
              textBuffer += event.delta.text;
              // Flush every 300ms or every 200 chars
              if (Date.now() - lastFlush > 300 || textBuffer.length > 200) {
                flushBuffer();
              }
            }
          }
        }
        break; // success — exit retry loop
      } catch (err: any) {
        if (isOverloadedError(err) && attempt < MAX_RETRIES) {
          const waitMs = (attempt + 1) * 15000; // 15s, 30s, 45s
          await thought(`API overloaded. Retrying in ${waitMs / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(res => setTimeout(res, waitMs));
          fullText = ''; // reset buffer on retry
          textBuffer = '';
        } else {
          throw err;
        }
      }
    }
    flushBuffer(); // flush remainder
    timings.aiMs = Date.now() - aiStart;

    // 5. Parse findings from Claude's response
    const { findings: parsedFindings, parseFailed } = extractFindings(fullText);
    if (parseFailed) {
      await thought('Warning: could not parse structured findings from AI response.');
    }

    await throwIfCancelled();
    await thought(`AI analysis complete. Saving ${parsedFindings.length} confirmed findings...`);

    // 6. Persist findings
    for (const f of parsedFindings) {
      await saveFinding(auditId, {
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
      });
      emit(auditId, 'finding', { finding: f });
    }

    // 7. Extract and save summary (text before <findings>)
    const summaryText = coverageNote(scanErrors) + fullText.replace(/<findings>[\s\S]*?<\/findings>/, '').trim();
    await saveEvent(auditId, 'summary', summaryText);
    emit(auditId, 'summary', { content: summaryText });

    // 8. Done
    await updateAuditTimings(auditId, timings);
    const finished = await finishAudit(auditId, 'done');
    await safeCleanup(auditId);
    if (!finished) {
      // Cancelled in the narrow window after the last check — the cancel wins.
      console.log(`[agent][${auditId}] cancelled just before completion; leaving status as-is`);
      return;
    }
    emit(auditId, 'status', { status: 'done' });
    await thought(`Audit complete. Found ${parsedFindings.length} vulnerabilities.`);

  } catch (err: any) {
    await updateAuditTimings(auditId, timings); // persist whatever phases completed before the stop

    if (err instanceof AuditCancelledError) {
      // Not a failure of the job itself — the API already set the status, so
      // just record why it stopped and let BullMQ mark the job completed.
      console.log(`[agent][${auditId}] cancelled by owner; stopping`);
      // Best-effort: if the audit was deleted rather than cancelled, the row
      // this event would reference is already gone.
      await saveEvent(auditId, 'thought', 'Audit cancelled.').catch(() => {});
      await safeCleanup(auditId);
      return;
    }

    console.error(`[agent][${auditId}] fatal error:`, err);
    await saveEvent(auditId, 'error', err.message ?? 'Unknown error');
    await finishAudit(auditId, 'failed');
    emit(auditId, 'status', { status: 'failed', error: err.message });
    await safeCleanup(auditId);
    throw err;
  }
}

// Disk cleanup is best-effort — a leftover clone directory costs disk space,
// but letting its failure propagate would overwrite a status we already
// committed (e.g. turning a completed 'done' audit into a false 'failed').
async function safeCleanup(auditId: string) {
  try {
    await cleanupRepo(auditId);
  } catch (err) {
    console.error(`[agent][${auditId}] cleanup failed (non-fatal):`, err);
  }
}
