import { hmacHashValue, toPostgresBytea } from "@/lib/security/crypto";

export function getRequestSubject(
  request: Request,
  discriminator: string,
  secret: string,
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return toPostgresBytea(
    hmacHashValue(`${discriminator}:${address}`, secret),
  );
}

export function hasValidSameOrigin(request: Request, baseUrl: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const allowed = new Set([
      new URL(baseUrl).origin,
      new URL(request.url).origin,
    ]);
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export async function readJsonBody(request: Request, maximumBytes = 24_000) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("request-too-large");
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new Error("request-too-large");
  }
  return JSON.parse(text) as unknown;
}
