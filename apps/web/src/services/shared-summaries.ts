import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";

import {
  claimSummaryJobs,
  completeSummaryJob,
  IntelligenceDataError,
  loadSummaryJob,
  recordIntelligenceHeartbeat,
  reserveProviderUsage,
  type SummaryClaim,
  type SummaryJob,
} from "@/data/intelligence";
import { ProviderCircuitBreaker } from "@/lib/intelligence/circuit-breaker";
import { deterministicGrounding, localFinalVerification } from "@/lib/intelligence/grounding";
import { estimatedInputUnits, IntelligenceProviderError, type ProviderTaskKind, type StorySummaryProvider } from "@/lib/intelligence/provider";
import { localizationPrompt, sharedSummaryPrompt } from "@/lib/intelligence/prompts";
import {
  localizedSummaryJsonSchema,
  localizedSummarySchema,
  sharedSummaryJsonSchema,
  sharedSummarySchema,
  type LocalizedSummary,
  type SharedSummary,
} from "@/lib/intelligence/schemas";
import { createLogger } from "@/lib/logging/logger";

const logger = createLogger("shared-summaries");

export type SummaryQuotaConfiguration = {
  requestsPerMinute: number;
  unitsPerMinute: number;
  requestsPerDay: number;
  unitsPerDay: number;
};

type SummaryDependencies = {
  claim: typeof claimSummaryJobs; load: typeof loadSummaryJob; complete: typeof completeSummaryJob;
  reserve: typeof reserveProviderUsage; heartbeat: typeof recordIntelligenceHeartbeat;
};

const defaultDependencies: SummaryDependencies = {
  claim: claimSummaryJobs, load: loadSummaryJob, complete: completeSummaryJob,
  reserve: reserveProviderUsage, heartbeat: recordIntelligenceHeartbeat,
};

export type SharedSummaryBatchResult = {
  workerId: string; claimed: number; verified: number; retrying: number; failed: number;
  insufficientEvidence: number; conflictingEvidence: number;
};

function failureCode(error: unknown): string {
  if (error instanceof IntelligenceProviderError) return error.code;
  if (error instanceof ZodError) return "provider-schema-invalid";
  if (error instanceof IntelligenceDataError) return "database-error";
  return "unexpected-summary-error";
}

async function reserveOrThrow(input: {
  provider: StorySummaryProvider; task: ProviderTaskKind; prompt: string; quota: SummaryQuotaConfiguration;
  dependencies: SummaryDependencies; now: Date;
}): Promise<void> {
  const reservation = await input.dependencies.reserve({
    provider: input.provider.name, model: input.provider.generationModel, task: input.task,
    estimatedUnits: estimatedInputUnits(input.prompt), ...input.quota,
    verificationReserve: 0, verificationUnitReserve: 0, now: input.now,
  });
  if (!reservation.allowed) throw new IntelligenceProviderError(`local-${reservation.reason ?? "quota"}`, "Local provider quota was exhausted", true, reservation.retryAt);
}

async function structured<T>(input: {
  provider: StorySummaryProvider; task: ProviderTaskKind; prompt: string;
  schemaName: string; jsonSchema: Record<string, unknown>; schema: ZodType<T>; quota: SummaryQuotaConfiguration;
  dependencies: SummaryDependencies; now: Date;
}): Promise<T> {
  await reserveOrThrow(input);
  return input.schema.parse(await input.provider.generateStructured({
    task: input.task, prompt: input.prompt, schemaName: input.schemaName, jsonSchema: input.jsonSchema,
  }));
}

function evidencePayload(job: SummaryJob) {
  return job.evidence.map((item) => ({
    id: item.id,
    title: item.title.slice(0, 220),
    excerpt: item.description?.slice(0, 700) ?? null,
    publisher: item.publisherName,
    publishedAt: item.publishedAt,
    category: item.classification?.category ?? null,
    action: item.keyAction?.slice(0, 180) ?? null,
    outcome: item.keyOutcome?.slice(0, 180) ?? null,
    numbers: item.importantNumbers.slice(0, 5).map((number) => ({
      label: number.label.slice(0, 80),
      value: number.value.slice(0, 60),
      unit: number.unit?.slice(0, 30) ?? null,
    })),
  }));
}

function retryAt(claim: SummaryClaim, now: Date, providerRetryAt: Date | null): Date {
  const backoff = new Date(now.getTime() + 15 * 60_000);
  return providerRetryAt && providerRetryAt > backoff ? providerRetryAt : backoff;
}

async function generateCandidate(input: {
  job: SummaryJob; provider: StorySummaryProvider; quota: SummaryQuotaConfiguration;
  dependencies: SummaryDependencies; circuit: ProviderCircuitBreaker; now: Date;
}): Promise<SharedSummary | LocalizedSummary> {
  input.circuit.assertAvailable(input.now);
  const evidence = evidencePayload(input.job);
  if (input.job.language === "en") {
    const prompt = sharedSummaryPrompt({
      clusterVersion: input.job.clusterVersion, isUpdate: input.job.isUpdate, isSensitive: input.job.isSensitive,
      evidence,
    });
    return structured({ provider: input.provider, task: "summarization", prompt,
      schemaName: "bulletin_shared_summary_v1", jsonSchema: sharedSummaryJsonSchema as unknown as Record<string, unknown>,
      schema: sharedSummarySchema, quota: input.quota, dependencies: input.dependencies, now: input.now });
  }
  if (!input.job.canonical) throw new IntelligenceDataError("canonical-summary-missing");
  const prompt = localizationPrompt({ canonical: input.job.canonical, evidence }, input.job.language);
  return structured({ provider: input.provider, task: "localization", prompt,
    schemaName: "bulletin_localized_summary_v1", jsonSchema: localizedSummaryJsonSchema as unknown as Record<string, unknown>,
    schema: localizedSummarySchema, quota: input.quota, dependencies: input.dependencies, now: input.now });
}

async function processSummary(input: {
  claim: SummaryClaim; provider: StorySummaryProvider; quota: SummaryQuotaConfiguration;
  dependencies: SummaryDependencies; circuit: ProviderCircuitBreaker; now: () => Date;
}): Promise<"verified" | "retrying" | "failed" | "insufficient-evidence" | "conflicting-evidence"> {
  try {
    const job = await input.dependencies.load({ claim: input.claim });
    if (job.conflictDetails.length > 0 || job.evidenceStrength === "conflicted") {
      await input.dependencies.complete({ claim: input.claim, status: "conflicting-evidence", repairAttempted: false, errorCode: "cluster-conflicted", now: input.now() });
      return "conflicting-evidence";
    }
    if (job.evidence.length === 0 || (job.isSensitive && !["sufficient", "strong"].includes(job.evidenceStrength))) {
      await input.dependencies.complete({ claim: input.claim, status: "insufficient-evidence", repairAttempted: false, errorCode: "cluster-insufficient-evidence", now: input.now() });
      return "insufficient-evidence";
    }
    const output = await generateCandidate({
      job,
      provider: input.provider,
      quota: input.quota,
      dependencies: input.dependencies,
      circuit: input.circuit,
      now: input.now(),
    });
    input.circuit.recordSuccess();
    if (output.status === "insufficient-evidence" || output.status === "conflicting-evidence") {
      const status = output.status;
      await input.dependencies.complete({ claim: input.claim, status, repairAttempted: false, errorCode: `provider-${status}`, now: input.now() });
      return status;
    }
    if (output.status !== "ready") {
      await input.dependencies.complete({ claim: input.claim, status: "invalid-input", repairAttempted: false, errorCode: `provider-status-${output.status}`, now: input.now() });
      return "failed";
    }
    const grounding = deterministicGrounding(output, job.evidence, job.canonical ?? undefined, job.isUpdate);
    if (!grounding.passed) {
      await input.dependencies.complete({
        claim: input.claim,
        status: "invalid-input",
        repairAttempted: false,
        errorCode: "summary-grounding-failed",
        now: input.now(),
      });
      return "failed";
    }
    const verification = localFinalVerification(grounding);
    const completed = await input.dependencies.complete({
      claim: input.claim,
      status: "verified",
      output,
      verification,
      provider: input.provider.name,
      model: input.provider.generationModel,
      modelMetadata: {
        task: input.claim.language === "en" ? "summarization" : "localization",
        generationCalls: 1,
        verification: "deterministic-local-v2",
      },
      repairAttempted: false,
      now: input.now(),
    });
    if (!completed) throw new IntelligenceDataError("summary-lease-lost");
    return "verified";
  } catch (error) {
    const at = input.now();
    const errorCode = failureCode(error);
    const circuitOpened = input.circuit.recordFailure(errorCode, at);
    const retryable = circuitOpened || (error instanceof IntelligenceProviderError ? error.retryable : error instanceof IntelligenceDataError);
    const status = retryable ? "retry-wait" : "failed";
    const providerRetryAt = error instanceof IntelligenceProviderError ? error.retryAt : null;
    const preferredRetryAt = [providerRetryAt, input.circuit.retryAt]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    try {
      await input.dependencies.complete({ claim: input.claim, status, repairAttempted: false,
        retryAt: status === "retry-wait" ? retryAt(input.claim, at, preferredRetryAt) : null,
        errorCode, now: at });
    } catch (completionError) {
      logger.error("Summary failure could not be finalized", { summaryId: input.claim.summaryId, errorCode: failureCode(completionError) });
    }
    logger.warn("Shared summary failed in isolation", { summaryId: input.claim.summaryId, errorCode });
    return status === "retry-wait" ? "retrying" : "failed";
  }
}

export async function runSharedSummaryBatch(options: {
  provider: StorySummaryProvider; quota: SummaryQuotaConfiguration; workerId?: string; batchSize?: number;
  leaseSeconds?: number; now?: () => Date; dependencies?: Partial<SummaryDependencies>;
}): Promise<SharedSummaryBatchResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const now = options.now ?? (() => new Date());
  const workerId = options.workerId ?? randomUUID();
  const circuit = new ProviderCircuitBreaker();
  const result: SharedSummaryBatchResult = { workerId, claimed: 0, verified: 0, retrying: 0, failed: 0, insufficientEvidence: 0, conflictingEvidence: 0 };
  await dependencies.heartbeat({ workerName: "shared-summaries", state: "started", at: now() });
  try {
    const claims = await dependencies.claim({ workerId, batchSize: options.batchSize ?? 4, leaseSeconds: options.leaseSeconds ?? 420, now: now() });
    result.claimed = claims.length;
    for (const claim of claims) {
      const outcome = await processSummary({ claim, provider: options.provider, quota: options.quota, dependencies, circuit, now });
      if (outcome === "verified") result.verified += 1;
      else if (outcome === "retrying") result.retrying += 1;
      else if (outcome === "insufficient-evidence") result.insufficientEvidence += 1;
      else if (outcome === "conflicting-evidence") result.conflictingEvidence += 1;
      else result.failed += 1;
    }
    await dependencies.heartbeat({ workerName: "shared-summaries", state: "completed", at: now(), batchSize: claims.length });
    logger.info("Shared summary batch completed", { claimed: result.claimed, verified: result.verified, retrying: result.retrying, failed: result.failed });
    return result;
  } catch (error) {
    await dependencies.heartbeat({ workerName: "shared-summaries", state: "failed", at: now(), errorCode: failureCode(error) }).catch(() => undefined);
    throw error;
  }
}
