import "server-only";

import { findAuthenticatedSubscriber, loadSubscriberManagementDTO } from "@/data/subscribers";
import { getSupabaseAuthUser } from "@/lib/supabase/auth";

function normalizeAuthEmail(email?: string) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export async function getAuthenticatedAuthUser() {
  const user = await getSupabaseAuthUser();
  const email = normalizeAuthEmail(user?.email);
  if (!user || !email) return null;
  return { user, email };
}

export async function getAuthenticatedBulletinSubscriber() {
  const authenticated = await getAuthenticatedAuthUser();
  if (!authenticated) return null;

  const linked = await findAuthenticatedSubscriber({
    authUserId: authenticated.user.id,
    email: authenticated.email,
  });
  if (!linked || linked.outcome === "email-claimed" || linked.outcome === "pending") {
    return { ...authenticated, subscriber: null, state: linked?.outcome ?? "not-found" };
  }

  const subscriber = await loadSubscriberManagementDTO(linked.subscriber_id);
  if (!subscriber) return { ...authenticated, subscriber: null, state: "not-found" };
  return { ...authenticated, subscriber, state: linked.outcome };
}
