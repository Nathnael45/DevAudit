import Anthropic from '@anthropic-ai/sdk';
import { cloneRepo, cleanupRepo } from '../scanner/gitClone';
import { runSemgrep } from '../scanner/semgrep';
import { runBandit } from '../scanner/bandit';
import { runGitleaks } from '../scanner/gitleaks';
import { updateAuditStatus, saveEvent, saveFinding } from '../utils/db';
import { emit } from '../utils/broadcaster';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runAudit({ auditId, repoUrl }: { auditId: string; repoUrl: string }) {
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
    const repoPath = await cloneRepo(auditId, repoUrl);
    await thought(`Repository cloned. Starting static analysis...`);

    // 2. Static analysis (parallel)
    await thought(`Running Semgrep (auto config) across all files...`);
    await thought(`Running Bandit (Python security linter)...`);
    await thought(`Running Gitleaks (secrets scanner)...`);

    const [semgrepFindings, banditFindings, gitleaksFindings] = await Promise.all([
      runSemgrep(repoPath),
      runBandit(repoPath),
      runGitleaks(repoPath),
    ]);

    await thought(`Semgrep found ${semgrepFindings.length} potential issues.`);
    await thought(`Bandit found ${banditFindings.length} potential issues.`);
    await thought(`Gitleaks found ${gitleaksFindings.length} potential secrets.`);
    await thought(`Passing findings to AI for deep analysis...`);

    // 3. Build context for Claude
    const semgrepSummary = semgrepFindings.slice(0, 30).map(f =>
      `[${f.check_id}] ${f.path}:${f.start.line} — ${f.extra.message} (${f.extra.severity})`
    ).join('\n');

    const banditSummary = banditFindings.slice(0, 30).map(f =>
      `[${f.test_id}/${f.test_name}] ${f.filename}:${f.line_number} — ${f.issue_text} (severity: ${f.issue_severity}, confidence: ${f.issue_confidence})`
    ).join('\n');

    const gitleaksSummary = gitleaksFindings.slice(0, 20).map(f =>
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

    let fullText = '';

    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      thinking: { type: 'adaptive' } as any,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          // Stream thinking tokens live to frontend
          emit(auditId, 'thinking_delta', { delta: event.delta.thinking });
        } else if (event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          emit(auditId, 'text_delta', { delta: event.delta.text });
        }
      }
    }

    // 5. Parse findings from Claude's response
    const findingsMatch = fullText.match(/<findings>([\s\S]*?)<\/findings>/);
    let parsedFindings: any[] = [];

    if (findingsMatch) {
      try {
        parsedFindings = JSON.parse(findingsMatch[1].trim());
      } catch {
        await thought('Warning: could not parse structured findings from AI response.');
      }
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
    await updateAuditStatus(auditId, 'done');
    await cleanupRepo(auditId);
    emit(auditId, 'status', { status: 'done' });
    await thought(`Audit complete. Found ${parsedFindings.length} vulnerabilities.`);

  } catch (err: any) {
    console.error(`[agent][${auditId}] fatal error:`, err);
    await saveEvent(auditId, 'error', err.message ?? 'Unknown error');
    await updateAuditStatus(auditId, 'failed');
    emit(auditId, 'status', { status: 'failed', error: err.message });
    await cleanupRepo(auditId);
    throw err;
  }
}
