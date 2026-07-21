import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";

export function privateJson(
  body: Record<string, unknown>,
  init?: { status?: number; headers?: HeadersInit },
) {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: { ...PRIVATE_RESPONSE_HEADERS, ...init?.headers },
  });
}

export function invalidRequest(message = "Check the information and try again.") {
  return privateJson({ ok: false, message }, { status: 400 });
}

export function unavailable() {
  return privateJson(
    {
      ok: false,
      message:
        "We couldn’t complete that securely just now. Your choices are unchanged—please try again.",
    },
    { status: 503 },
  );
}

export function rateLimited() {
  return privateJson(
    {
      ok: false,
      message: "Please wait a little before requesting another email.",
    },
    { status: 429, headers: { "Retry-After": "900" } },
  );
}
