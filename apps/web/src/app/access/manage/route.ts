import { exchangeManagementLink, invalidDestination } from "./exchange";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicReference = requestUrl.searchParams.get("r") ?? "";
  const signature = requestUrl.searchParams.get("s") ?? "";
  const tokenVersion = Number(requestUrl.searchParams.get("v"));
  const expiresAt = Number(requestUrl.searchParams.get("e"));

  if (!publicReference || !signature || !tokenVersion || !expiresAt) {
    return Response.redirect(invalidDestination(requestUrl.origin, "invalid"), 303);
  }

  return exchangeManagementLink(request, {
    publicReference,
    tokenVersion,
    expiresAt,
    signature,
  });
}
