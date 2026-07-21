const REDACTED = "[redacted]";
const SENSITIVE_KEY =
  /(authorization|cookie|email|password|secret|signature|token|credential|api[-_]?key)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_VALUE = /https?:\/\/[^\s]+/gi;

function sanitizeString(value: string): string {
  return value
    .replace(EMAIL_VALUE, "[redacted-email]")
    .replace(URL_VALUE, (candidate) => {
      try {
        const url = new URL(candidate);
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[redacted-url]";
      }
    });
}

export function sanitizeLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    };
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitizeLogValue(item, seen),
    ]),
  );
}
