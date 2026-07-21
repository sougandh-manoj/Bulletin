import "server-only";

import { getServerEnvironment } from "@/env/server";
import { sanitizeLogValue } from "@/lib/logging/sanitize";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;

const priority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldWrite(level: LogLevel): boolean {
  return priority[level] >= priority[getServerEnvironment().LOG_LEVEL];
}

function writeLog(
  scope: string,
  level: LogLevel,
  message: string,
  metadata?: LogMetadata,
): void {
  if (!shouldWrite(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message: sanitizeLogValue(message),
    ...(metadata ? { metadata: sanitizeLogValue(metadata) } : {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, metadata?: LogMetadata) =>
      writeLog(scope, "debug", message, metadata),
    info: (message: string, metadata?: LogMetadata) =>
      writeLog(scope, "info", message, metadata),
    warn: (message: string, metadata?: LogMetadata) =>
      writeLog(scope, "warn", message, metadata),
    error: (message: string, metadata?: LogMetadata) =>
      writeLog(scope, "error", message, metadata),
  } as const;
}
