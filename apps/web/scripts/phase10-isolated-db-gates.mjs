import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workspace = path.resolve(import.meta.dirname, "../../..");
const container = "supabase_db_news_agent";
const database = "bulletin_phase10_gate";

function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], {
    cwd: workspace,
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`isolated-database-command-failed-${result.status}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function psql(sql) {
  return docker(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
}

function runTest(file) {
  const output = psql(readFileSync(file, "utf8"));
  process.stdout.write(`${path.basename(file)}\n${output}`);
  if (/^not ok\b/m.test(output) || /# Failed test/m.test(output)) {
    throw new Error(`database-test-failed-${path.basename(file)}`);
  }
}

try {
  docker(["dropdb", "-U", "postgres", "--if-exists", database]);
  docker(["createdb", "-U", "postgres", database]);
  const migrations = readdirSync(path.join(workspace, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    psql(readFileSync(path.join(workspace, "supabase/migrations", migration), "utf8"));
  }
  psql(readFileSync(path.join(workspace, "supabase/seed.sql"), "utf8"));

  const testsDirectory = path.join(workspace, "supabase/tests/database");
  runTest(path.join(testsDirectory, "phase_10_launch_readiness.test.sql"));
  psql(`update public.system_controls set
    email_delivery_enabled = true,
    delivery_worker_paused = false,
    personalization_worker_paused = false,
    ingestion_worker_paused = false,
    intelligence_worker_paused = false
    where singleton;`);
  for (const name of readdirSync(testsDirectory).filter((name) => name.endsWith(".sql") && !name.startsWith("phase_10_")).sort()) {
    runTest(path.join(testsDirectory, name));
  }
  process.stdout.write(JSON.stringify({ ok: true, migrations: migrations.length, database }) + "\n");
} finally {
  docker(["dropdb", "-U", "postgres", "--if-exists", database]);
}
