import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function hasValidBearerAuthorization(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  if (!supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expectedSecret));
}

