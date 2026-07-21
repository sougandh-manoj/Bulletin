import "server-only";

import { randomUUID } from "node:crypto";

import {
  claimDeliveryPersonalizations,
  completeDeliveryPersonalization,
  enqueueDueDeliveries,
  enqueueSharedLocalization,
  failDeliveryPersonalization,
  listDeliveryPersonalizationCandidates,
  loadDeliveryPersonalizationContext,
  PersonalizationDataError,
  recordPersonalizationHeartbeat,
  type PersonalizationClaim,
} from "@/data/personalization";
import { createLogger } from "@/lib/logging/logger";
import {
  PERSONALIZATION_RULES,
  PERSONALIZATION_VERSION,
  personalize,
} from "@/lib/personalization/rules";

const logger = createLogger("personalization-scheduler");

type PersonalizationDependencies = {
  enqueueDue: typeof enqueueDueDeliveries;
  claim: typeof claimDeliveryPersonalizations;
  loadContext: typeof loadDeliveryPersonalizationContext;
  listCandidates: typeof listDeliveryPersonalizationCandidates;
  enqueueLocalization: typeof enqueueSharedLocalization;
  complete: typeof completeDeliveryPersonalization;
  fail: typeof failDeliveryPersonalization;
  heartbeat: typeof recordPersonalizationHeartbeat;
};

const defaultDependencies: PersonalizationDependencies = {
  enqueueDue: enqueueDueDeliveries,
  claim: claimDeliveryPersonalizations,
  loadContext: loadDeliveryPersonalizationContext,
  listCandidates: listDeliveryPersonalizationCandidates,
  enqueueLocalization: enqueueSharedLocalization,
  complete: completeDeliveryPersonalization,
  fail: failDeliveryPersonalization,
  heartbeat: recordPersonalizationHeartbeat,
};

export type PersonalizationBatchResult = {
  workerId: string;
  scheduled: number;
  claimed: number;
  ready: number;
  short: number;
  empty: number;
  localizationQueued: number;
  retrying: number;
  failed: number;
};

function failureCode(error: unknown): string {
  if (error instanceof PersonalizationDataError) return error.code;
  return "unexpected-personalization-error";
}

async function processClaim(input: {
  claim: PersonalizationClaim;
  dependencies: PersonalizationDependencies;
  now: () => Date;
}): Promise<{ selected: number; requested: number; localizationQueued: number } | null> {
  try {
    const context = await input.dependencies.loadContext({ claim: input.claim });
    const candidates = await input.dependencies.listCandidates({
      claim: input.claim,
      limit: PERSONALIZATION_RULES.maximumCandidatePool,
    });
    const decision = personalize(context, candidates);
    let localizationQueued = 0;
    if (context.language !== "en") {
      for (const candidate of decision.localizationNeeded) {
        await input.dependencies.enqueueLocalization({
          clusterId: candidate.clusterId,
          clusterVersion: candidate.clusterVersion,
          language: context.language,
          now: input.now(),
        });
        localizationQueued += 1;
      }
    }
    const completed = await input.dependencies.complete({
      claim: input.claim,
      selected: decision.selected,
      version: PERSONALIZATION_VERSION,
      metadata: {
        ruleVersion: PERSONALIZATION_VERSION,
        candidateCount: candidates.length,
        selectedCount: decision.selected.length,
        minimumScore: PERSONALIZATION_RULES.minimumScore,
        exclusions: decision.excluded,
        localizationQueued,
      },
      now: input.now(),
    });
    if (!completed) throw new PersonalizationDataError("personalization-lease-lost");
    return {
      selected: decision.selected.length,
      requested: context.storyCount,
      localizationQueued,
    };
  } catch (error) {
    const at = input.now();
    const permanent = input.claim.attemptCount >= 5;
    try {
      await input.dependencies.fail({
        claim: input.claim,
        retryAt: permanent ? null : new Date(at.getTime() + 5 * 60_000),
        failureCode: failureCode(error),
        permanent,
        now: at,
      });
    } catch (failureError) {
      logger.error("Personalization failure could not be finalized", {
        deliveryId: input.claim.deliveryId,
        errorCode: failureCode(failureError),
      });
    }
    logger.warn("Personalization failed in isolation", {
      deliveryId: input.claim.deliveryId,
      errorCode: failureCode(error),
    });
    return null;
  }
}

export async function runPersonalizationBatch(options?: {
  workerId?: string;
  schedulerBatchSize?: number;
  personalizationBatchSize?: number;
  leaseSeconds?: number;
  now?: () => Date;
  dependencies?: Partial<PersonalizationDependencies>;
}): Promise<PersonalizationBatchResult> {
  const dependencies = { ...defaultDependencies, ...options?.dependencies };
  const now = options?.now ?? (() => new Date());
  const workerId = options?.workerId ?? randomUUID();
  const result: PersonalizationBatchResult = {
    workerId,
    scheduled: 0,
    claimed: 0,
    ready: 0,
    short: 0,
    empty: 0,
    localizationQueued: 0,
    retrying: 0,
    failed: 0,
  };

  await dependencies.heartbeat({ state: "started", at: now() });
  try {
    const scheduled = await dependencies.enqueueDue({
      batchSize: options?.schedulerBatchSize ?? 50,
      now: now(),
    });
    result.scheduled = scheduled.length;
    const claims = await dependencies.claim({
      workerId,
      batchSize: options?.personalizationBatchSize ?? 10,
      leaseSeconds: options?.leaseSeconds ?? 180,
      now: now(),
    });
    result.claimed = claims.length;

    for (const claim of claims) {
      const outcome = await processClaim({ claim, dependencies, now });
      if (!outcome) {
        if (claim.attemptCount >= 5) result.failed += 1;
        else result.retrying += 1;
        continue;
      }
      result.ready += 1;
      result.localizationQueued += outcome.localizationQueued;
      if (outcome.selected === 0) result.empty += 1;
      else if (outcome.selected < outcome.requested) result.short += 1;
    }
    await dependencies.heartbeat({
      state: "completed",
      at: now(),
      batchSize: result.claimed,
    });
    return result;
  } catch (error) {
    try {
      await dependencies.heartbeat({
        state: "failed",
        at: now(),
        errorCode: failureCode(error),
      });
    } catch (heartbeatError) {
      logger.error("Personalization heartbeat failure could not be recorded", {
        errorCode: failureCode(heartbeatError),
      });
    }
    throw error;
  }
}
