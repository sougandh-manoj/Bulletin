import { privateJson } from "@/lib/security/api";

export const runtime = "nodejs";

export function GET() {
  return privateJson({ ok: true, service: "bulletin" });
}
