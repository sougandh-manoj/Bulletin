import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { getTrustedDatabaseEnvironment } from "@/env/server";

type SupabaseOptions = NonNullable<Parameters<typeof createClient>[2]>;
type RealtimeTransport = NonNullable<SupabaseOptions["realtime"]>["transport"];

// `ws` accepts the runtime contract used by Realtime. Its wider overload set is
// not structurally compatible with the library's intentionally minimal type.
const ServerWebSocket = WebSocket as unknown as NonNullable<RealtimeTransport>;

let cachedClient: SupabaseClient | undefined;

export function getTrustedSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const environment = getTrustedDatabaseEnvironment();
  cachedClient = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: { "X-Client-Info": "bulletin-secure-access/1" },
      },
      realtime: { transport: ServerWebSocket },
    },
  );
  return cachedClient;
}
