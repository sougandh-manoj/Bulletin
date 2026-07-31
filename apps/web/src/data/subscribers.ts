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

export type SubscriberManagementDTO = {
  subscriberId: string;
  publicReference: string;
  name: string;
  status: Exclude<SubscriberStatus, "pending">;
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

export function isSubscriberVersionConflict(error: unknown) {
  return (error as SubscriberDataError | undefined)?.code === "40001";
}

function dataError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  throw new SubscriberDataError(error.code ?? "database-error", error.message);
}

function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function findAuthenticatedSubscriber(input: {
  authUserId: string;
  email: string;
}) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("find_authenticated_subscriber", {
    p_auth_user_id: input.authUserId,
    p_email: input.email,
  });
  dataError(error);
  return firstRow<{ subscriber_id: string; outcome: string }>(data);
}

export async function createAuthenticatedSubscriber(input: {
  authUserId: string;
  preferences: SubscriberPreferences;
}) {
  const database = getTrustedSupabase();
  const { data, error } = await database.rpc("create_authenticated_subscriber", {
    p_auth_user_id: input.authUserId,
    p_email: input.preferences.email,
    p_name: input.preferences.name,
    p_country_code: input.preferences.countryCode,
    p_state_region: input.preferences.stateRegion,
    p_city: input.preferences.city || null,
    p_language: input.preferences.language,
    p_categories: input.preferences.categories,
    p_custom_topics: input.preferences.customTopics,
    p_excluded_topics: input.preferences.excludedTopics,
    p_story_count: input.preferences.storyCount,
    p_theme: input.preferences.theme,
    p_frequency: input.preferences.frequency,
    p_weekly_day: input.preferences.weeklyDay ?? null,
    p_local_delivery_time: input.preferences.deliveryTime,
    p_timezone: input.preferences.timezone,
    p_consent_at: new Date().toISOString(),
    p_consent_version: PRODUCT.consentVersion,
  });
  dataError(error);
  const row = firstRow<{
    subscriber_id: string;
    outcome: "created" | "existing" | "email-claimed";
    next_delivery_at: string | null;
  }>(data);
  if (!row) throw new SubscriberDataError("empty-result");
  return row;
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
  scope: "admin-access";
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
