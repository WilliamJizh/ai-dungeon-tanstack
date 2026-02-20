const REDACT_PATTERNS = [
  /api[_-]?key/i,
  /authorization/i,
  /token/i,
  /password/i,
  /secret/i,
  /cookie/i,
];

const MAX_STRING_LENGTH = 8000;
const MAX_ARRAY_LENGTH = 200;
const MAX_OBJECT_KEYS = 200;
const MAX_DEPTH = 8;

function shouldRedact(key: string): boolean {
  return REDACT_PATTERNS.some((p) => p.test(key));
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function sanitizeInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return '[Function]';
  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeInner(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_LENGTH) {
      limited.push(`[+${value.length - MAX_ARRAY_LENGTH} items truncated]`);
    }
    return limited;
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);

    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries.slice(0, MAX_OBJECT_KEYS);
    const output: Record<string, unknown> = {};

    for (const [key, inner] of limitedEntries) {
      if (shouldRedact(key)) {
        output[key] = '[REDACTED]';
        continue;
      }
      output[key] = sanitizeInner(inner, depth + 1, seen);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }

    return output;
  }

  return String(value);
}

export function sanitizeForTrace(value: unknown): unknown {
  return sanitizeInner(value, 0, new WeakSet<object>());
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(sanitizeForTrace(value));
  } catch {
    return JSON.stringify({ error: 'failed-to-stringify' });
  }
}

