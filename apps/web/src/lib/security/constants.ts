export const ADMIN_SESSION_COOKIE_NAME = "__Host-bulletin_owner";

export const ADMIN_ACCESS_TTL_SECONDS = 15 * 60;
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60;

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;
