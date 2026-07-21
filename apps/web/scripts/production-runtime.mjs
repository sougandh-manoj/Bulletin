import { spawn } from "node:child_process";

if (process.env.APP_ENV !== "production") throw new Error("APP_ENV=production is required");
const port = String(process.env.PORT ?? "3000");
const workerBaseUrl = `http://127.0.0.1:${port}`;

function start(command, args, extraEnvironment = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnvironment },
  });
}

const web = start("npm", ["run", "start", "--workspace", "@bulletin/web", "--", "--hostname", "0.0.0.0", "--port", port]);
let worker = null;
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  worker?.kill(signal);
  web.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

async function waitUntilReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !stopping) {
    if (web.exitCode !== null) throw new Error(`web-exited-${web.exitCode}`);
    try {
      const response = await fetch(`${workerBaseUrl}/api/health/ready`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("production-readiness-timeout");
}

try {
  await waitUntilReady();
  worker = start(process.execPath, ["apps/web/scripts/local-worker-runner.mjs"], {
    WORKER_BASE_URL: workerBaseUrl,
  });
  const result = await Promise.race([
    new Promise((resolve) => web.once("exit", (code, signal) => resolve({ process: "web", code, signal }))),
    new Promise((resolve) => worker.once("exit", (code, signal) => resolve({ process: "worker", code, signal }))),
  ]);
  if (!stopping) process.stderr.write(`${JSON.stringify({ event: "runtime-child-exited", ...result })}\n`);
  stop();
  process.exitCode = stopping ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "runtime-start-failed", errorType: error instanceof Error ? error.name : "unknown" })}\n`);
  stop();
  process.exitCode = 1;
}
