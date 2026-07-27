import { decodeManagementTicket } from "@/lib/security/crypto";

import { exchangeManagementLink, invalidDestination } from "../exchange";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const requestUrl = new URL(request.url);
  const { ticket } = await params;
  const claims = decodeManagementTicket(ticket);
  if (!claims) return Response.redirect(invalidDestination(requestUrl.origin, "invalid"), 303);

  return exchangeManagementLink(request, claims);
}
