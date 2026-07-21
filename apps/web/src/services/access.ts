import "server-only";

import {
  findSubscriberByEmail,
  invalidateVerificationToken,
  issueVerificationToken,
  type SubscriberDataError,
} from "@/data/subscribers";
import { getSecureAccessEnvironment } from "@/env/server";
import {
  sendManagementEmail,
  sendVerificationEmail,
} from "@/lib/email/mailer";
import {
  buildManagementUrl,
  createOpaqueToken,
  hashValue,
  toPostgresBytea,
} from "@/lib/security/crypto";
import { MANAGEMENT_LINK_TTL_SECONDS } from "@/lib/security/constants";

export async function issueVerificationEmailForSubscriber(input: {
  subscriberId: string;
  email: string;
}) {
  const environment = getSecureAccessEnvironment();
  const rawToken = createOpaqueToken();
  const issued = await issueVerificationToken(
    input.subscriberId,
    toPostgresBytea(hashValue(rawToken)),
  );
  const url = new URL("/access/verify", environment.APP_BASE_URL);
  url.searchParams.set("t", rawToken);

  try {
    await sendVerificationEmail(input.email, url.toString());
  } catch (error) {
    await invalidateVerificationToken(issued.token_id).catch(() => undefined);
    throw error;
  }
  return { expiresAt: issued.expires_at };
}

export async function issueManagementEmail(input: {
  email: string;
  publicReference: string;
  tokenVersion: number;
}) {
  const environment = getSecureAccessEnvironment();
  const expiresAt = Math.floor(Date.now() / 1000) + MANAGEMENT_LINK_TTL_SECONDS;
  const url = buildManagementUrl(
    environment.APP_BASE_URL,
    {
      publicReference: input.publicReference,
      tokenVersion: input.tokenVersion,
      expiresAt,
    },
    environment.MANAGEMENT_LINK_SIGNING_SECRET,
  );
  await sendManagementEmail(input.email, url);
}

export async function resendForEmail(email: string) {
  const subscriber = await findSubscriberByEmail(email);
  if (!subscriber) return { state: "new" as const };

  const expired =
    subscriber.status === "pending" &&
    new Date(subscriber.unverified_expires_at).getTime() <= Date.now();
  if (expired) return { state: "expired" as const };

  if (subscriber.status === "pending") {
    await issueVerificationEmailForSubscriber({
      subscriberId: subscriber.id,
      email,
    });
    return { state: "pending" as const };
  }

  await issueManagementEmail({
    email,
    publicReference: subscriber.public_reference,
    tokenVersion: subscriber.token_version,
  });
  return { state: "verified" as const };
}

export function isVersionConflict(error: unknown) {
  return (error as SubscriberDataError | undefined)?.code === "40001";
}
