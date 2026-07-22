import "server-only";

import {
  PRODUCT,
  type BriefingTheme,
  type DeliveryFrequency,
  type NewsCategory,
  type SupportedLanguage,
  type Weekday,
} from "@/config/product";
import type { SubscriberPreferences } from "@/lib/validation/subscriber";
import { getTrustedSupabase } from "@/lib/supabase/server";

type SubscriberStatus = "pending" | "active" | "paused";

type SubscriberLookup = {
  id: string;
  public_reference: string;
  status: SubscriberStatus;
  token_version: number;
  unverified_expires_at: string;
};

type SessionValidation = {
  session_id: string;
  subscriber_id: string;
  subscriber_public_reference: string;
  subscriber_status: SubscriberStatus;
  token_version: number;
  expires_at: string;
};

export type SubscriberManagementDTO = {
  subscriberId: string;
  publicReference: string;
  name: string;
  status: Exclude<SubscriberStatus, "pending">;
  tokenVersion: number;
  preferenceVersion: number;
  countryCode: string;
  stateRegion: string;
  city: string;
  language: SupportedLanguage;
  categories: NewsCategory[];
  customTopics: string[];
  excludedTopics: string[];
  storyCount: number;
  theme: BriefingTheme;
  frequency: DeliveryFrequency;
  weeklyDay?: Weekday;
  deliveryTime: string;
  timezone: string;
  nextDeliveryAt: string | null;
};

export class SubscriberDataError extends Error {
  constructor(
    public readonly code: string,
    message = "Subscriber data operation failed",
  ) {
    super(message);
    this.name = "SubscriberDataError";
  }
}

function dataError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  throw new SubscriberDataError(error.code ?? "database-error", error.message);
}

function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function findSubscriberByEmail(email: string) {
  const database = getTrustedSupabase();
  const { data, error } = await database
    .from("subscribers")
    .select("id, public_reference, status, token_version, unverified_expires_at")
    .eq("email", email)
    .maybeSingle<SubscriberLookup>();
  dataError(error);
  return data;
}

export async function findSubscriberForManagement(
  publicReference: string,
): Promise<SubscriberLookup | null> {
  const database = getTrustedSupabase();
  const { data, error } = await database
    .from("subscribers")
    .select("id, public_reference, status, token_version, unverified_expires_at")
    .eq("public_reference", publicReference)
    .maybeSingle<SubscriberLookup>();
  dataError(error);
  return data;
}

export async function createPendingSubscriber(preferences: SubscriberPreferences) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("create_pending_subscriber", {
    p_email: preferences.email,
    p_name: preferences.name,
    p_country_code: preferences.countryCode,
    p_state_region: preferences.stateRegion,
    p_city: preferences.city || null,
    p_language: preferences.language,
    p_categories: preferences.categories,
    p_custom_topics: preferences.customTopics,
    p_excluded_topics: preferences.excludedTopics,
    p_story_count: preferences.storyCount,
    p_theme: preferences.theme,
    p_frequency: preferences.frequency,
    p_weekly_day: preferences.weeklyDay ?? null,
    p_local_delivery_time: preferences.deliveryTime,
    p_timezone: preferences.timezone,
    p_consent_at: new Date().toISOString(),
    p_consent_version: PRODUCT.consentVersion,
  });
  dataError(error);
  const row = firstRow<{ subscriber_id: string; outcome: string }>(data);
  if (!row) throw new SubscriberDataError("empty-result");
  return row;
}

export async function issueVerificationToken(
  subscriberId: string,
  tokenHash: string,
) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("issue_verification_token", {
    p_subscriber_id: subscriberId,
    p_token_hash: tokenHash,
  });
  dataError(error);
  const row = firstRow<{ token_id: string; generation: number; expires_at: string }>(
    data,
  );
  if (!row) throw new SubscriberDataError("empty-result");
  return row;
}

export async function invalidateVerificationToken(tokenId: string) {
  const database = getTrustedSupabase();
  const { error } = await database
    .from("email_verification_tokens")
    .update({ status: "invalidated", invalidated_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("status", "active");
  dataError(error);
}

export async function inspectVerificationToken(tokenHash: string) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("inspect_verification_token", {
    p_token_hash: tokenHash,
  });
  dataError(error);
  return firstRow<{
    is_valid: boolean;
    subscriber_public_reference: string;
    expires_at: string;
  }>(data);
}

export async function consumeVerificationToken(
  tokenHash: string,
  theme: BriefingTheme,
) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("consume_verification_token_with_theme", {
    p_token_hash: tokenHash,
    p_theme: theme,
  });
  dataError(error);
  const row = firstRow<{
    subscriber_public_reference: string;
    next_delivery_at: string;
  }>(data);
  if (!row) throw new SubscriberDataError("invalid-token");
  return row;
}

export async function createSubscriberSession(input: {
  subscriberId: string;
  tokenVersion: number;
  sessionHash: string;
  csrfHash: string;
  expiresAt: string;
}) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("create_subscriber_session", {
    p_subscriber_id: input.subscriberId,
    p_session_hash: input.sessionHash,
    p_csrf_hash: input.csrfHash,
    p_expected_token_version: input.tokenVersion,
    p_expires_at: input.expiresAt,
  });
  dataError(error);
  const row = firstRow<{ session_id: string; expires_at: string }>(data);
  if (!row) throw new SubscriberDataError("session-not-created");
  return row;
}

export async function validateSubscriberSession(
  sessionHash: string,
  csrfHash?: string,
) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("validate_subscriber_session", {
    p_session_hash: sessionHash,
    p_csrf_hash: csrfHash ?? null,
  });
  dataError(error);
  return firstRow<SessionValidation>(data);
}

export async function revokeSubscriberSession(sessionHash: string) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("revoke_subscriber_session", {
    p_session_hash: sessionHash,
  });
  dataError(error);
  return Boolean(data);
}

export async function loadSubscriberManagementDTO(
  subscriberId: string,
): Promise<SubscriberManagementDTO | null> {
  const database = getTrustedSupabase();
  const { data, error } = await database
    .from("subscribers")
    .select(`
      id,
      public_reference,
      name,
      status,
      token_version,
      subscriber_preferences (
        country_code,
        state_region,
        city,
        language,
        categories,
        custom_topics,
        excluded_topics,
        story_count,
        theme,
        version
      ),
      subscriber_schedules (
        frequency,
        weekly_day,
        local_delivery_time,
        timezone,
        next_delivery_at
      )
    `)
    .eq("id", subscriberId)
    .maybeSingle();
  dataError(error);
  if (!data || data.status === "pending") return null;

  const preference = Array.isArray(data.subscriber_preferences)
    ? data.subscriber_preferences[0]
    : data.subscriber_preferences;
  const schedule = Array.isArray(data.subscriber_schedules)
    ? data.subscriber_schedules[0]
    : data.subscriber_schedules;
  if (!preference || !schedule) return null;

  return {
    subscriberId: data.id as string,
    publicReference: data.public_reference as string,
    name: data.name as string,
    status: data.status as "active" | "paused",
    tokenVersion: Number(data.token_version),
    preferenceVersion: Number(preference.version),
    countryCode: preference.country_code as string,
    stateRegion: preference.state_region as string,
    city: (preference.city as string | null) ?? "",
    language: preference.language as SupportedLanguage,
    categories: preference.categories as NewsCategory[],
    customTopics: preference.custom_topics as string[],
    excludedTopics: preference.excluded_topics as string[],
    storyCount: Number(preference.story_count),
    theme: preference.theme as BriefingTheme,
    frequency: schedule.frequency as DeliveryFrequency,
    weeklyDay: (schedule.weekly_day as Weekday | null) ?? undefined,
    deliveryTime: String(schedule.local_delivery_time).slice(0, 5),
    timezone: schedule.timezone as string,
    nextDeliveryAt: (schedule.next_delivery_at as string | null) ?? null,
  };
}

export async function saveSubscriberPreferences(input: {
  subscriberId: string;
  expectedVersion: number;
  preferences: Omit<SubscriberPreferences, "email" | "consent">;
}) {
  const database = getTrustedSupabase();
  const p = input.preferences;
  const { data, error } = await database.rpc("save_subscriber_preferences", {
    p_subscriber_id: input.subscriberId,
    p_expected_version: input.expectedVersion,
    p_name: p.name,
    p_country_code: p.countryCode,
    p_state_region: p.stateRegion,
    p_city: p.city || null,
    p_language: p.language,
    p_categories: p.categories,
    p_custom_topics: p.customTopics,
    p_excluded_topics: p.excludedTopics,
    p_story_count: p.storyCount,
    p_theme: p.theme,
    p_frequency: p.frequency,
    p_weekly_day: p.weeklyDay ?? null,
    p_local_delivery_time: p.deliveryTime,
    p_timezone: p.timezone,
  });
  dataError(error);

  const { data: schedule, error: scheduleError } = await database
    .from("subscriber_schedules")
    .select("next_delivery_at")
    .eq("subscriber_id", input.subscriberId)
    .single<{ next_delivery_at: string | null }>();
  dataError(scheduleError);
  if (!schedule) throw new SubscriberDataError("empty-schedule-result");

  return {
    version: Number(data),
    nextDeliveryAt: schedule.next_delivery_at,
  };
}

export async function saveSubscriberTheme(input: {
  subscriberId: string;
  expectedVersion: number;
  theme: BriefingTheme;
}) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("save_subscriber_theme", {
    p_subscriber_id: input.subscriberId,
    p_expected_version: input.expectedVersion,
    p_theme: input.theme,
  });
  dataError(error);
  return Number(data);
}

export async function pauseSubscriber(subscriberId: string) {
  const database = getTrustedSupabase();
  const { error } = await database.rpc("pause_subscriber", {
    p_subscriber_id: subscriberId,
  });
  dataError(error);
}

export async function resumeSubscriber(subscriberId: string) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("resume_subscriber", {
    p_subscriber_id: subscriberId,
  });
  dataError(error);
  return String(data);
}

export async function deleteSubscriber(subscriberId: string) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("delete_subscriber", {
    p_subscriber_id: subscriberId,
  });
  dataError(error);
  return Boolean(data);
}

export async function consumeRateLimit(input: {
  scope:
    | "email-check"
    | "verification-request"
    | "management-request"
    | "token-validation"
    | "admin-access";
  subjectHash: string;
  windowStartedAt: string;
  expiresAt: string;
  limit: number;
}) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("consume_rate_limit", {
    p_scope: input.scope,
    p_subject_hash: input.subjectHash,
    p_window_started_at: input.windowStartedAt,
    p_expires_at: input.expiresAt,
    p_limit: input.limit,
  });
  dataError(error);
  return Boolean(data);
}
