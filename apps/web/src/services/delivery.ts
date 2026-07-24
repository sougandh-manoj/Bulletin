import "server-only";

import { randomUUID } from "node:crypto";

import {
  beginDeliverySend,
  claimDeliveries,
  completeDeliverySend,
  DeliveryDataError,
  failDelivery,
  loadDeliveryRenderContext,
  markDeliveryRendered,
  recordDeliveryAlert,
  recordDeliveryHeartbeat,
  resolveDeliveryAlert,
  recoverExpiredDeliveryLeases,
  type DeliveryClaim,
  type DeliveryRenderContext,
} from "@/data/delivery";
import { getSecureAccessEnvironment } from "@/env/server";
import {
  buildStoredBriefingEmail,
  type StoredBriefingStory,
} from "@/lib/email/briefing";
import {
  BriefingDeliveryError,
  sendBriefingEmail,
} from "@/lib/email/mailer";
import { createLogger } from "@/lib/logging/logger";
import { buildManagementUrl } from "@/lib/security/crypto";
import { recordAndNotifyOperationalAlert } from "@/services/alerts";

const logger = createLogger("briefing-delivery");

const RETRY_DELAYS_MS = [5, 15, 60].map((minutes) => minutes * 60_000);

type DeliveryDependencies = {
  recover: typeof recoverExpiredDeliveryLeases;
  claim: typeof claimDeliveries;
  load: typeof loadDeliveryRenderContext;
  markRendered: typeof markDeliveryRendered;
  beginSend: typeof beginDeliverySend;
  send: typeof sendBriefingEmail;
  complete: typeof completeDeliverySend;
  fail: typeof failDelivery;
  heartbeat: typeof recordDeliveryHeartbeat;
  alert: typeof recordDeliveryAlert;
  resolveAlert: typeof resolveDeliveryAlert;
};

const defaultDependencies: DeliveryDependencies = {
  recover: recoverExpiredDeliveryLeases,
  claim: claimDeliveries,
  load: loadDeliveryRenderContext,
  markRendered: markDeliveryRendered,
  beginSend: beginDeliverySend,
  send: sendBriefingEmail,
  complete: completeDeliverySend,
  fail: failDelivery,
  heartbeat: recordDeliveryHeartbeat,
  alert: recordAndNotifyOperationalAlert,
  resolveAlert: resolveDeliveryAlert,
};

export type DeliveryBatchResult = {
  workerId: string;
  recovered: number;
  ambiguousRecovered: number;
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  gated: number;
  ambiguous: number;
};

function assertSafeContext(context: DeliveryRenderContext) {
  if (!Number.isInteger(context.actualStoryCount)
      || context.actualStoryCount < 0
      || context.actualStoryCount > 48
      || context.stories.length !== context.actualStoryCount) {
    throw new DeliveryDataError("delivery-story-count-mismatch");
  }
  context.stories.forEach((story, index) => {
    if (story.position !== index + 1) {
      throw new DeliveryDataError("delivery-story-order-invalid");
    }
    if (!story.headline.trim() || !story.summary.trim() || !story.whyItMatters.trim()) {
      throw new DeliveryDataError("delivery-summary-content-missing");
    }
    if (story.sources.length === 0 || story.sources.some((source) => {
      try {
        const url = new URL(source.url);
        return !source.name.trim() || !["http:", "https:"].includes(url.protocol);
      } catch {
        return true;
      }
    })) {
      throw new DeliveryDataError("delivery-source-attribution-invalid");
    }
  });
}

function render(context: DeliveryRenderContext, now: Date) {
  assertSafeContext(context);
  const environment = getSecureAccessEnvironment();
  const manageUrl = buildManagementUrl(
    environment.APP_BASE_URL,
    {
      publicReference: context.subscriberPublicReference,
      tokenVersion: context.subscriberTokenVersion,
      expiresAt: Math.floor(now.getTime() / 1000) + 15 * 60,
    },
    environment.MANAGEMENT_LINK_SIGNING_SECRET,
  );
  const stories: StoredBriefingStory[] = context.stories.map((story) => ({
    position: story.position,
    category: story.category,
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.whyItMatters,
    isUpdate: story.isUpdate,
    sources: story.sources.map((source) => ({
      name: source.name,
      url: source.url,
      ...(source.iconUrl ? { iconUrl: source.iconUrl } : {}),
    })),
  }));
  return buildStoredBriefingEmail({
    language: context.language,
    theme: context.theme,
    scheduledFor: context.scheduledFor,
    timezone: context.timezone,
    subscriberName: context.subscriberName,
    manageUrl,
    stories,
  });
}

function failureDetails(error: unknown, attemptCount: number, now: Date) {
  if (error instanceof BriefingDeliveryError) {
    const exhausted = !error.permanent && attemptCount >= 4;
    return {
      permanent: error.permanent || exhausted,
      code: error.code,
      failureClass: exhausted ? "smtp-temporary-exhausted" : error.permanent ? "smtp-permanent" : "smtp-temporary",
      retryAt: error.permanent || exhausted
        ? null
        : new Date(now.getTime() + RETRY_DELAYS_MS[Math.min(attemptCount - 1, 2)]),
    };
  }
  if (error instanceof DeliveryDataError) {
    const integrityFailure = /evidence|story|summary|source|context|render-claim/.test(error.code);
    return {
      permanent: integrityFailure,
      code: error.code,
      failureClass: integrityFailure ? "rendering-integrity" : "transient-infrastructure",
      retryAt: integrityFailure ? null : new Date(now.getTime() + 5 * 60_000),
    };
  }
  return {
    permanent: false,
    code: "unexpected-delivery-error",
    failureClass: "transient-infrastructure",
    retryAt: new Date(now.getTime() + 5 * 60_000),
  };
}

async function processClaim(input: {
  claim: DeliveryClaim;
  dependencies: DeliveryDependencies;
  now: () => Date;
}): Promise<"sent" | "retrying" | "failed" | "gated" | "ambiguous"> {
  let context: DeliveryRenderContext | null = null;
  let smtpAccepted = false;
  try {
    context = await input.dependencies.load({ claim: input.claim });
    const email = render(context, input.now());
    const marked = await input.dependencies.markRendered({
      claim: input.claim,
      storyCount: context.actualStoryCount,
      now: input.now(),
    });
    if (!marked) throw new DeliveryDataError("delivery-render-lease-lost");

    // This is deliberately the last database operation before SMTP.
    const allowed = await input.dependencies.beginSend({
      claim: input.claim,
      now: input.now(),
    });
    if (!allowed) return "gated";

    const receipt = await input.dependencies.send({
      recipient: context.recipient,
      ...email,
    });
    smtpAccepted = true;
    const completed = await input.dependencies.complete({
      claim: input.claim,
      providerMessageId: receipt.messageId,
      now: input.now(),
    });
    if (!completed) {
      await input.dependencies.alert({
        key: "smtp-accepted-completion-lost",
        severity: "critical",
        title: "SMTP accepted a briefing but completion was not recorded",
        details: { deliveryId: input.claim.deliveryId },
        now: input.now(),
      });
      return "ambiguous";
    }
    return "sent";
  } catch (error) {
    if (smtpAccepted) {
      logger.error("SMTP acceptance has an ambiguous database outcome", {
        deliveryId: input.claim.deliveryId,
        errorCode: "smtp-accepted-completion-lost",
      });
      return "ambiguous";
    }
    const at = input.now();
    const details = failureDetails(error, context?.attemptCount ?? input.claim.attemptCount, at);
    try {
      const finalized = await input.dependencies.fail({
        claim: input.claim,
        retryAt: details.retryAt,
        failureCode: details.code,
        failureClass: details.failureClass,
        permanent: details.permanent,
        now: at,
      });
      if (!finalized) {
        logger.warn("Delivery failure finalization lost its lease", {
          deliveryId: input.claim.deliveryId,
          errorCode: details.code,
        });
      }
    } catch (finalizationError) {
      logger.error("Delivery failure could not be finalized", {
        deliveryId: input.claim.deliveryId,
        errorType: finalizationError instanceof Error ? finalizationError.name : "unknown",
      });
    }
    if (details.permanent) {
      await input.dependencies.alert({
        key: `delivery-permanent-${details.failureClass}`,
        severity: details.failureClass === "rendering-integrity" ? "critical" : "warning",
        title: "A briefing reached a permanent delivery failure",
        details: { failureCode: details.code, failureClass: details.failureClass },
        now: at,
      }).catch(() => undefined);
    }
    logger.warn("Briefing delivery failed in isolation", {
      deliveryId: input.claim.deliveryId,
      errorCode: details.code,
      permanent: details.permanent,
    });
    return details.permanent ? "failed" : "retrying";
  }
}

export async function runDeliveryBatch(options?: {
  workerId?: string;
  batchSize?: number;
  leaseSeconds?: number;
  now?: () => Date;
  dependencies?: Partial<DeliveryDependencies>;
}): Promise<DeliveryBatchResult> {
  const dependencies = { ...defaultDependencies, ...options?.dependencies };
  const now = options?.now ?? (() => new Date());
  const workerId = options?.workerId ?? randomUUID();
  const result: DeliveryBatchResult = {
    workerId,
    recovered: 0,
    ambiguousRecovered: 0,
    claimed: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
    gated: 0,
    ambiguous: 0,
  };
  let stage = "heartbeat-start";
  try {
    await dependencies.heartbeat({ state: "started", at: now() });
    stage = "recover-expired-leases";
    const recovered = await dependencies.recover({ now: now() });
    result.recovered = recovered.retryable;
    result.ambiguousRecovered = recovered.ambiguous;
    stage = "claim-deliveries";
    const claims = await dependencies.claim({
      workerId,
      batchSize: options?.batchSize ?? 10,
      leaseSeconds: options?.leaseSeconds ?? 300,
      now: now(),
    });
    result.claimed = claims.length;
    stage = "process-deliveries";
    for (const claim of claims) {
      const outcome = await processClaim({ claim, dependencies, now });
      result[outcome] += 1;
    }
    stage = "heartbeat-complete";
    await dependencies.heartbeat({ state: "completed", at: now(), batchSize: claims.length });
    await dependencies.resolveAlert({
      key: "delivery-worker-batch-failure",
      now: now(),
    }).catch((error) => {
      logger.warn("Recovered delivery alert could not be resolved", {
        errorCode: error instanceof DeliveryDataError ? error.code : "alert-resolution-failed",
      });
    });
    return result;
  } catch (error) {
    const errorCode = error instanceof DeliveryDataError ? error.code : "delivery-batch-failed";
    await dependencies.heartbeat({
      state: "failed",
      at: now(),
      errorCode,
    }).catch(() => undefined);
    await dependencies.alert({
      key: "delivery-worker-batch-failure",
      severity: "critical",
      title: "The briefing delivery worker failed",
      details: {
        errorType: error instanceof Error ? error.name : "unknown",
        errorCode,
        stage,
      },
      consecutiveFailuresBeforeCritical: 3,
      now: now(),
    }).catch(() => undefined);
    throw error;
  }
}
