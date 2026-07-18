'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiUrl, getWsUrl } from '@/lib/apiUrl';

export type EventType = 'thought' | 'thinking_delta' | 'text_delta' | 'finding' | 'summary' | 'status' | 'error';

export interface StreamEvent {
  type: EventType;
  content?: string;
  delta?: string;
  status?: string;
  finding?: Finding;
  error?: string;
  ts: number;
}

export interface Finding {
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
}

export type AuditStatus = 'connecting' | 'queued' | 'running' | 'done' | 'failed' | 'disconnected';

export function useAuditStream(auditId: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<AuditStatus>('connecting');
  const [thinkingText, setThinkingText] = useState('');
  const [analysisText, setAnalysisText] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const wsConnected = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addEvent = useCallback((ev: Omit<StreamEvent, 'ts'>) => {
    setEvents((prev) => [...prev, { ...ev, ts: Date.now() }]);
  }, []);

  // Poll the REST API as a reliable fallback
  const pollAudit = useCallback(() => {
    fetch(`${getApiUrl()}/api/audits/${auditId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.audit) return;

        setStatus(data.audit.status as AuditStatus);
        if (data.audit.repo_url) setRepoUrl(data.audit.repo_url);

        if (data.events?.length) {
          setEvents(data.events.map((e: any) => ({
            type: e.type as EventType,
            content: e.content,
            ts: new Date(e.created_at).getTime(),
          })));
        }

        if (data.findings?.length) {
          setFindings(data.findings.map((f: any) => ({
            filePath: f.file_path,
            lineStart: f.line_start,
            lineEnd: f.line_end,
            severity: f.severity,
            category: f.category,
            title: f.title,
            description: f.description,
            recommendation: f.recommendation,
          })));
        }

        // Stop polling once terminal state reached
        if (data.audit.status === 'done' || data.audit.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      })
      .catch(() => {});
  }, [auditId]);

  // Always poll — WS is a bonus on top
  useEffect(() => {
    if (!auditId || auditId === ':id') return;
    pollAudit(); // immediate first fetch
    pollRef.current = setInterval(pollAudit, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollAudit, auditId]);

  // WebSocket for live deltas (thinking/text streaming)
  useEffect(() => {
    const wsUrl = `${getWsUrl()}/ws?auditId=${auditId}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }

    ws.onopen = () => {
      wsConnected.current = true;
      console.log('[ws] connected');
    };

    ws.onmessage = (msg) => {
      let data: any;
      try { data = JSON.parse(msg.data); } catch { return; }

      switch (data.type) {
        case 'status':
          setStatus(data.status);
          break;
        case 'thought':
          addEvent({ type: 'thought', content: data.content });
          break;
        case 'thinking_delta':
          setThinkingText((prev) => prev + (data.delta ?? ''));
          break;
        case 'text_delta':
          setAnalysisText((prev) => prev + (data.delta ?? ''));
          break;
        case 'finding':
          setFindings((prev) => [...prev, data.finding]);
          addEvent({ type: 'finding', finding: data.finding });
          break;
        case 'summary':
          addEvent({ type: 'summary', content: data.content });
          break;
        case 'error':
          addEvent({ type: 'error', content: data.error });
          break;
      }
    };

    ws.onerror = () => console.warn('[ws] could not connect, using poll fallback');
    ws.onclose = () => { wsConnected.current = false; };

    return () => ws.close();
  }, [auditId, addEvent]);

  return { events, findings, status, thinkingText, analysisText, repoUrl };
}
