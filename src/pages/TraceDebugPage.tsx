import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearch } from '@tanstack/react-router';

type TraceStatus = 'running' | 'success' | 'error' | string;

interface TraceSummary {
  id: string;
  createdAt: string;
  requestId: string | null;
  sessionId: string | null;
  pipeline: string;
  agentId: string;
  modelProvider: string;
  modelId: string;
  status: TraceStatus;
  durationMs: number | null;
}

interface TraceStep {
  stepIndex: number;
  finishReason: string | null;
  rawFinishReason: string | null;
  usage: unknown;
  request: unknown;
  response: unknown;
  toolCalls: unknown;
  toolResults: unknown;
  content: unknown;
}

interface TraceDetail extends TraceSummary {
  input: unknown;
  output: unknown;
  error: unknown;
  meta: unknown;
  steps: TraceStep[];
}

interface TraceSummaryResponse {
  traces: TraceSummary[];
}

interface TraceSummaryReport {
  traceCount: number;
  findings: string[];
  recommendations: string[];
  timeline: Array<{
    traceId: string;
    createdAt: string;
    pipeline: string;
    agentId: string;
    status: string;
    durationMs: number | null;
    stepCount: number;
    toolNames: string[];
    anomalyCount: number;
  }>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function fmtDuration(ms: number | null): string {
  if (typeof ms !== 'number') return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractToolNames(step: TraceStep): string[] {
  return getArray(step.toolCalls)
    .map((call) => (typeof call === 'object' && call !== null ? (call as Record<string, unknown>).toolName : undefined))
    .filter((name): name is string => typeof name === 'string');
}

function countMissingToolOutputs(step: TraceStep): number {
  let count = 0;
  for (const result of getArray(step.toolResults)) {
    if (typeof result !== 'object' || result === null) continue;
    if (!('output' in result)) count += 1;
  }
  return count;
}

export function TraceDebugPage() {
  const search = useSearch({ strict: false }) as Record<string, string>;

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TraceSummaryReport | null>(null);

  const [sessionId, setSessionId] = useState(search.sessionId ?? '');
  const [requestId, setRequestId] = useState(search.requestId ?? '');
  const [pipeline, setPipeline] = useState(search.pipeline ?? '');
  const [agentId, setAgentId] = useState(search.agentId ?? '');
  const [status, setStatus] = useState(search.status ?? '');

  const filters = useMemo(
    () => ({ sessionId: sessionId.trim(), requestId: requestId.trim(), pipeline: pipeline.trim(), agentId: agentId.trim(), status }),
    [sessionId, requestId, pipeline, agentId, status],
  );

  const loadTraces = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.sessionId) params.set('sessionId', filters.sessionId);
      if (filters.requestId) params.set('requestId', filters.requestId);
      if (filters.pipeline) params.set('pipeline', filters.pipeline);
      if (filters.agentId) params.set('agentId', filters.agentId);
      if (filters.status) params.set('status', filters.status);
      params.set('limit', '100');

      const res = await fetch(`/api/debug/traces?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load traces: ${res.status}`);
      const data = await res.json() as TraceSummaryResponse;
      setTraces(data.traces ?? []);
      if (data.traces?.length) {
        const hasSelected = selectedId ? data.traces.some((trace) => trace.id === selectedId) : false;
        setSelectedId(hasSelected ? selectedId : data.traces[0].id);
      } else {
        setSelectedId(null);
        setSelectedTrace(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load traces');
    } finally {
      setIsLoadingList(false);
    }
  }, [filters.sessionId, filters.requestId, filters.pipeline, filters.agentId, filters.status, selectedId]);

  const loadTraceById = useCallback(async (traceId: string) => {
    setIsLoadingTrace(true);
    setError(null);
    try {
      const res = await fetch(`/api/debug/traces/${traceId}`);
      if (!res.ok) throw new Error(`Failed to load trace: ${res.status}`);
      const data = await res.json() as TraceDetail;
      setSelectedTrace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trace');
      setSelectedTrace(null);
    } finally {
      setIsLoadingTrace(false);
    }
  }, []);

  const summarize = useCallback(async () => {
    setIsSummarizing(true);
    setError(null);
    try {
      const body = selectedId
        ? { traceId: selectedId }
        : filters.sessionId
          ? { sessionId: filters.sessionId, maxTraces: 10 }
          : {};
      const res = await fetch('/api/debug/traces/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to summarize traces: ${res.status}`);
      setSummary(await res.json() as TraceSummaryReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize traces');
    } finally {
      setIsSummarizing(false);
    }
  }, [selectedId, filters.sessionId]);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  useEffect(() => {
    if (!selectedId) return;
    void loadTraceById(selectedId);
  }, [selectedId, loadTraceById]);

  const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  const statusColor = (value: TraceStatus) => {
    if (value === 'success') return '#16a34a';
    if (value === 'error') return '#dc2626';
    if (value === 'running') return '#d97706';
    return '#64748b';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b1020', color: '#e5e7eb', fontFamily: mono, padding: 16 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>AI Trace Debug</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
          <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="sessionId" style={{ ...inputStyle, gridColumn: 'span 2' }} />
          <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="requestId" style={{ ...inputStyle, gridColumn: 'span 2' }} />
          <input value={pipeline} onChange={(e) => setPipeline(e.target.value)} placeholder="pipeline" style={inputStyle} />
          <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agentId" style={inputStyle} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">status: any</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="error">error</option>
          </select>
          <button type="button" onClick={() => void loadTraces()} style={buttonStyle} disabled={isLoadingList}>
            {isLoadingList ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={() => void summarize()} style={buttonStyle} disabled={isSummarizing}>
            {isSummarizing ? 'Summarizing...' : 'Summarize'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', padding: 10, borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12, minHeight: 540 }}>
          <div style={{ border: '1px solid #334155', borderRadius: 8, overflow: 'auto', background: '#0f172a' }}>
            {traces.length === 0 && <div style={{ padding: 12, color: '#94a3b8' }}>No traces found.</div>}
            {traces.map((trace) => {
              const selected = trace.id === selectedId;
              return (
                <button
                  key={trace.id}
                  type="button"
                  onClick={() => setSelectedId(trace.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: '1px solid #1e293b',
                    padding: 10,
                    background: selected ? '#1e293b' : 'transparent',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontFamily: mono,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: 12 }}>{trace.pipeline}</strong>
                    <span style={{ color: statusColor(trace.status), fontSize: 12 }}>{trace.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{trace.agentId} · {trace.modelId}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{fmtDate(trace.createdAt)}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>duration: {fmtDuration(trace.durationMs)}</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4, wordBreak: 'break-all' }}>{trace.id}</div>
                </button>
              );
            })}
          </div>

          <div style={{ border: '1px solid #334155', borderRadius: 8, background: '#0f172a', overflow: 'auto' }}>
            {!selectedId && <div style={{ padding: 12, color: '#94a3b8' }}>Select a trace.</div>}
            {selectedId && isLoadingTrace && <div style={{ padding: 12, color: '#94a3b8' }}>Loading trace...</div>}
            {selectedId && selectedTrace && (
              <div style={{ padding: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  <InfoCard label="Trace ID" value={selectedTrace.id} />
                  <InfoCard label="Status" value={selectedTrace.status} />
                  <InfoCard label="Duration" value={fmtDuration(selectedTrace.durationMs)} />
                  <InfoCard label="Steps" value={String(selectedTrace.steps.length)} />
                  <InfoCard label="Session" value={selectedTrace.sessionId ?? '-'} />
                  <InfoCard label="Request" value={selectedTrace.requestId ?? '-'} />
                  <InfoCard label="Pipeline" value={selectedTrace.pipeline} />
                  <InfoCard label="Agent" value={`${selectedTrace.agentId} (${selectedTrace.modelId})`} />
                </div>

                <details style={detailsStyle}>
                  <summary>Input</summary>
                  <pre style={preStyle}>{pretty(selectedTrace.input)}</pre>
                </details>

                <details style={detailsStyle}>
                  <summary>Output</summary>
                  <pre style={preStyle}>{pretty(selectedTrace.output)}</pre>
                </details>

                {selectedTrace.error != null && (
                  <details style={detailsStyle} open>
                    <summary>Error</summary>
                    <pre style={preStyle}>{pretty(selectedTrace.error)}</pre>
                  </details>
                )}

                <h2 style={{ margin: 0, fontSize: 16 }}>Steps</h2>
                {selectedTrace.steps.map((step) => {
                  const toolNames = extractToolNames(step);
                  const missingOutputs = countMissingToolOutputs(step);
                  return (
                    <div key={step.stepIndex} style={{ border: '1px solid #334155', borderRadius: 6, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <strong style={{ fontSize: 13 }}>Step {step.stepIndex}</strong>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {step.finishReason ?? 'unknown'} / {step.rawFinishReason ?? 'n/a'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                        tools: {toolNames.length > 0 ? toolNames.join(', ') : 'none'} · missing tool outputs: {missingOutputs}
                      </div>
                      <details style={detailsStyle}>
                        <summary>Tool Calls</summary>
                        <pre style={preStyle}>{pretty(step.toolCalls)}</pre>
                      </details>
                      <details style={detailsStyle}>
                        <summary>Tool Results</summary>
                        <pre style={preStyle}>{pretty(step.toolResults)}</pre>
                      </details>
                      <details style={detailsStyle}>
                        <summary>Content/Usage</summary>
                        <pre style={preStyle}>{pretty({ content: step.content, usage: step.usage })}</pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {summary && (
          <div style={{ border: '1px solid #334155', borderRadius: 8, background: '#0f172a', padding: 12, display: 'grid', gap: 10 }}>
            <strong>Summary ({summary.traceCount} trace{summary.traceCount === 1 ? '' : 's'})</strong>
            <div>
              <div style={{ color: '#93c5fd', marginBottom: 4 }}>Findings</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.findings.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ color: '#86efac', marginBottom: 4 }}>Recommendations</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.recommendations.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#e2e8f0', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: '#020617',
  color: '#e5e7eb',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 10px',
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
};

const buttonStyle: CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 10px',
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
  cursor: 'pointer',
};

const detailsStyle: CSSProperties = {
  border: '1px solid #1e293b',
  borderRadius: 6,
  padding: 8,
  background: '#020617',
};

const preStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11,
  lineHeight: 1.4,
  color: '#cbd5e1',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
