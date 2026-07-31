import { loadLatestDeliveredBriefing } from "@/data/delivery";
import { getSecureAccessEnvironment } from "@/env/server";
import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";
import { buildDeliveryEmailFromContext } from "@/services/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export async function GET(request: Request) {
  const authenticated = await getAuthenticatedBulletinSubscriber();
  if (!authenticated) {
    return Response.redirect(new URL("/sign-in?intent=manage", request.url), 303);
  }
  if (!authenticated.subscriber) {
    return Response.redirect(new URL("/onboarding", request.url), 303);
  }

  const subscriber = authenticated.subscriber;
  const briefing = await loadLatestDeliveredBriefing({
    owner: {
      subscriberId: subscriber.subscriberId,
      subscriberName: subscriber.name,
      timezone: subscriber.timezone,
    },
  });
  if (!briefing) {
    return Response.redirect(new URL("/manage", request.url), 303);
  }

  const environment = getSecureAccessEnvironment();
  const email = buildDeliveryEmailFromContext(
    briefing,
    new URL("/manage", environment.APP_BASE_URL).toString(),
  );
  return new Response(email.html, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
