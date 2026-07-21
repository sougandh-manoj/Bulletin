import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const environmentFile = path.join(appRoot, ".env.local");
const secretName = /(SECRET|SERVICE_ROLE|PASSWORD|TOKEN|API_KEY|ENCRYPTION_KEY|REFRESH_TOKEN|CLIENT_SECRET)/;
const secrets = existsSync(environmentFile)
  ? readFileSync(environmentFile, "utf8").split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || !secretName.test(match[1])) return [];
      const value = match[2].replace(/^['"]|['"]$/g, "");
      return value.length >= 8 ? [{ name: match[1], value }] : [];
    })
  : [];

const roots = [path.join(appRoot, ".next/static"), path.join(appRoot, "public")];
const files = [];
function visit(target) {
  if (!existsSync(target)) return;
  const info = statSync(target);
  if (info.isDirectory()) {
    for (const entry of readdirSync(target)) visit(path.join(target, entry));
  } else if (info.size <= 20 * 1024 * 1024) files.push(target);
}
for (const root of roots) visit(root);

const findings = [];
for (const file of files) {
  const content = readFileSync(file);
  for (const secret of secrets) {
    if (content.includes(Buffer.from(secret.value))) findings.push({ file: path.relative(appRoot, file), name: secret.name });
  }
}
if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, findings })}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, filesScanned: files.length, secretValuesChecked: secrets.length })}\n`);
}
