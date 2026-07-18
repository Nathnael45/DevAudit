import Anthropic from '@anthropic-ai/sdk';
import { cloneRepo, cleanupRepo } from '../scanner/gitClone';
import { runSemgrep } from '../scanner/semgrep';
import { runBandit } from '../scanner/bandit';
import { runGitleaks } from '../scanner/gitleaks';
import { updateAuditStatus, updateAuditTimings, saveEvent, saveFinding } from '../utils/db';
import { emit } from '../utils/broadcaster';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

export async function runAudit({ auditId, repoUrl }: { auditId: string; repoUrl: string }) {
  const timings: Record<string, number> = {};

  async function thought(msg: string) {
    await saveEvent(auditId, 'thought', msg);
    emit(auditId, 'thought', { content: msg });
    console.log(`[agent][${auditId}] ${msg}`);
  }

  try {
    await updateAuditStatus(auditId, 'running');
    emit(auditId, 'status', { status: 'running' });

    // 1. Clone
    await thought(`Cloning repository: ${repoUrl}`);
    const [repoPath, cloneMs] = await timed(() => cloneRepo(auditId, repoUrl));
    timings.cloneMs = cloneMs;
    await thought(`Repository cloned. Starting static analysis...`);

    // 2. Static analysis (parallel)
    await thought(`Running Semgrep (auto config) across all files...`);
    await thought(`Running Bandit (Python security linter)...`);
    await thought(`Running Gitleaks (secrets scanner)...`);

    const scanWallStart = Date.now();
    const [
      [semgrepFindings, semgrepMs],
      [banditFindings, banditMs],
      [gitleaksFindings, gitleaksMs],
    ] = await Promise.all([
      timed(() => runSemgrep(repoPath)),
      timed(() => runBandit(repoPath)),
      timed(() => runGitleaks(repoPath)),
    ]);
    timings.scanWallMs = Date.now() - scanWallStart;
    timings.semgrepMs = semgrepMs;
    timings.banditMs = banditMs;
    timings.gitleaksMs = gitleaksMs;

    const SEMGREP_LIMIT = 30;
    const BANDIT_LIMIT = 30;
    const GITLEAKS_LIMIT = 20;

    const sortedSemgrep = sortBySeverityRank(semgrepFindings, f => f.extra.severity, SEMGREP_SEVERITY_RANK);
    const sortedBandit = sortBySeverityRank(banditFindings, f => f.issue_severity, BANDIT_SEVERITY_RANK);

    await thought(foundMessage('Semgrep', semgrepFindings.length, SEMGREP_LIMIT, 'issues'));
    await thought(foundMessage('Bandit', banditFindings.length, BANDIT_LIMIT, 'issues'));
    await thought(foundMessage('Gitleaks', gitleaksFindings.length, GITLEAKS_LIMIT, 'secrets'));
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
${semgrepSummary || 'No findings.'}

## Bandit Findings (${banditFindings.length} total, showing first 30):
${banditSummary || 'No findings.'}

## Gitleaks Findings — Exposed Secrets (${gitleaksFindings.length} total, showing first 20):
${gitleaksSummary || 'No secrets found.'}

Please analyze these findings, think through each one carefully, identify real vulnerabilities, and produce your security report.`;

    // 4. Stream Claude's reasoning
    await thought(`AI analysis started. Streaming reasoning...`);
    const aiStart = Date.now();

    let fullText = '';
    let textBuffer = '';
    let lastFlush = Date.now();

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
          max_tokens: 8000,
          thinking: { type: 'adaptive' } as any,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        for await (const event of stream) {
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
    const summaryText = fullText.replace(/<findings>[\s\S]*?<\/findings>/, '').trim();
    await saveEvent(auditId, 'summary', summaryText);
    emit(auditId, 'summary', { content: summaryText });

    // 8. Done
    await updateAuditTimings(auditId, timings);
    await updateAuditStatus(auditId, 'done');
    await cleanupRepo(auditId);
    emit(auditId, 'status', { status: 'done' });
    await thought(`Audit complete. Found ${parsedFindings.length} vulnerabilities.`);

  } catch (err: any) {
    console.error(`[agent][${auditId}] fatal error:`, err);
    await updateAuditTimings(auditId, timings); // persist whatever phases completed before the failure
    await saveEvent(auditId, 'error', err.message ?? 'Unknown error');
    await updateAuditStatus(auditId, 'failed');
    emit(auditId, 'status', { status: 'failed', error: err.message });
    await cleanupRepo(auditId);
    throw err;
  }
}
