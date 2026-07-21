import { getProductionEnvironment, getServerEnvironment } from "@/env/server";
import { privateJson } from "@/lib/security/api";
import { getTrustedSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  try {
    const environment = getServerEnvironment();
    if (environment.APP_ENV === "production") getProductionEnvironment();
    const { error } = await getTrustedSupabase()
      .from("system_controls")
      .select("updated_at")
      .eq("singleton", true)
      .single();
    if (error) throw new Error("database-not-ready");
    return privateJson({ ok: true, service: "bulletin" });
  } catch {
    return privateJson({ ok: false, service: "bulletin" }, { status: 503 });
  }
}
