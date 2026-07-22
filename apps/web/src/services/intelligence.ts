import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

import {
  claimArticles,
  commitArticleToCluster,
  findClusterCandidates,
  finishArticleClaim,
  IntelligenceDataError,
  promoteClusterForSummary,
  recordIntelligenceHeartbeat,
  stageArticleIntelligence,
  type ClaimedArticle,
  type ClusterCandidate,
  type CommitResult,
} from "@/data/intelligence";
import {
  eventFingerprint,
  titleSimilarity,
  type EventFacts,
} from "@/lib/intelligence/deterministic";
import { analyzeArticleLocally } from "@/lib/intelligence/local-analysis";
import type { ArticleClassification } from "@/lib/intelligence/schemas";
import { createLogger } from "@/lib/logging/logger";

const logger = createLogger("story-intelligence");

type IntelligenceDependencies = {
  claim: typeof claimArticles; stage: typeof stageArticleIntelligence; candidates: typeof findClusterCandidates;
  commit: typeof commitArticleToCluster; promote: typeof promoteClusterForSummary; finish: typeof finishArticleClaim;
  heartbeat: typeof recordIntelligenceHeartbeat;
};

const defaultDependencies: IntelligenceDependencies = {
  claim: claimArticles, stage: stageArticleIntelligence, candidates: findClusterCandidates,
  commit: commitArticleToCluster, promote: promoteClusterForSummary, finish: finishArticleClaim,
  heartbeat: recordIntelligenceHeartbeat,
};

export type IntelligenceBatchResult = {
  workerId: string; claimed: number; processed: number; quarantined: number; retrying: number; failed: number;
  clustersCreatedOrJoined: number; meaningfulUpdates: number; summariesQueued: number;
};

function facts(classification: ArticleClassification): EventFacts {
  return {
    entities: classification.entities, geography: classification.geography, eventTime: classification.eventTime,
    eventType: classification.eventType, keyAction: classification.keyAction, keyOutcome: classification.keyOutcome,
    importantNumbers: classification.importantNumbers,
  };
}

function retryDate(article: ClaimedArticle, now: Date, preferred?: Date | null): Date {
  const minutes = Math.min(360, 5 * (2 ** Math.max(0, article.processingAttempts - 1)));
  const backoff = new Date(now.getTime() + minutes * 60_000);
  return preferred && preferred > backoff ? preferred : backoff;
}

function failureCode(error: unknown): string {
  if (error instanceof ZodError) return "local-analysis-schema-invalid";
  if (error instanceof IntelligenceDataError) return "database-error";
  if (error instanceof TypeError && /fetch|network|request|socket|terminated/i.test(error.message)) return "transient-intelligence-request";
  return "unexpected-intelligence-error";
}

function retryableFailure(error: unknown): boolean {
  return error instanceof IntelligenceDataError
    || (error instanceof TypeError && /fetch|network|request|socket|terminated/i.test(error.message));
}

function chooseCluster(input: {
  article: ClaimedArticle; classification: ArticleClassification; candidates: ClusterCandidate[];
}): { candidate: ClusterCandidate | null; reasonCodes: string[] } {
  const ranked = input.candidates.map((candidate) => ({
    candidate,
    score: Math.max(0, ...candidate.snapshot.evidenceArticles.map((item) =>
      titleSimilarity(input.article.title, item.title),
    )),
  })).sort((left, right) => right.score - left.score
    || right.candidate.snapshot.latestEventAt.localeCompare(left.candidate.snapshot.latestEventAt)
    || left.candidate.clusterId.localeCompare(right.candidate.clusterId));
  const best = ranked[0];
  if (best && best.score >= 0.68) {
    return { candidate: best.candidate, reasonCodes: ["title-similarity-match", `title-score-${best.score.toFixed(3)}`] };
  }
  return { candidate: null, reasonCodes: ["no-similar-title"] };
}

function duplicateEvidence(article: ClaimedArticle, candidate: ClusterCandidate | null) {
  if (!candidate) return { id: null, kind: null } as const;
  for (const item of candidate.snapshot.evidenceArticles) {
    if (item.publisherFamilyKey === article.publisherFamilyKey) continue;
    const score = titleSimilarity(article.title, item.title);
    if (score >= 0.68) {
      return { id: item.id, kind: score === 1 ? "cross-source-exact" as const : "cross-source-near" as const };
    }
  }
  return { id: null, kind: null } as const;
}

async function processArticle(input: {
  article: ClaimedArticle;
  dependencies: IntelligenceDependencies; candidateLimit: number; candidateLookbackHours: number;
  now: () => Date;
}): Promise<CommitResult | "quarantined" | "retrying" | "failed"> {
  const { article, dependencies } = input;
  try {
    const classification = analyzeArticleLocally({
      id: article.id,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      language: article.language,
      countryCode: article.countryCode,
      stateRegion: article.stateRegion,
      city: article.city,
      feedCategories: article.feedCategories,
    });
    if (classification.status !== "ready" || classification.factualDepth === 0) {
      await dependencies.finish({ article, status: "quarantined", retryAt: null, errorCode: `local-analysis-${classification.status}`, now: input.now() });
      return "quarantined";
    }
    const staged = await dependencies.stage({
      article, classification,
      fingerprint: eventFingerprint(facts(classification), article.publishedAt, article.normalizedTitle),
      metadata: { policyVersion: "title-only-v1", analysisVersion: "title-only-v1", schemaVersion: "phase-7-v1" },
    });
    if (!staged) throw new IntelligenceDataError("article-lease-lost");
    const candidates = await dependencies.candidates({ articleId: article.id, limit: input.candidateLimit, lookbackHours: input.candidateLookbackHours });
    const choice = chooseCluster({ article, classification, candidates });
    const duplicate = duplicateEvidence(article, choice.candidate);
    const meaningful = false;
    const committed = await dependencies.commit({
      article, preferredClusterId: choice.candidate?.clusterId ?? null,
      decisionMethod: choice.candidate ? "normalized-title-similarity" : "normalized-title-unique-story",
      decisionMetadata: { reasonCodes: choice.reasonCodes, ruleScore: choice.candidate?.ruleScore ?? null, analysisVersion: "title-only-v1" },
      isMeaningfulUpdate: meaningful, hasMaterialConflict: false, conflicts: [],
      evidenceDuplicateOfArticleId: duplicate.id, evidenceDuplicateKind: duplicate.kind, now: input.now(),
    });
    return await dependencies.promote({ commit: committed, now: input.now() });
  } catch (error) {
    const at = input.now();
    const errorCode = failureCode(error);
    const retryable = retryableFailure(error);
    const exhausted = article.processingAttempts >= 5;
    const status = retryable && !exhausted ? "retry-wait" : "failed";
    const retryAt = status === "retry-wait" ? retryDate(article, at) : null;
    try {
      await dependencies.finish({ article, status, retryAt, errorCode, now: at });
    } catch (completionError) {
      logger.error("Article intelligence failure could not be finalized", { articleId: article.id, errorCode: failureCode(completionError) });
    }
    logger.warn("Article intelligence failed in isolation", {
      articleId: article.id,
      errorCode,
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message.slice(0, 240) : "non-error-thrown",
    });
    return status === "retry-wait" ? "retrying" : "failed";
  }
}

export async function runIntelligenceBatch(options: {
  workerId?: string; batchSize?: number; leaseSeconds?: number;
  candidateLimit?: number; candidateLookbackHours?: number; now?: () => Date;
  dependencies?: Partial<IntelligenceDependencies>;
}): Promise<IntelligenceBatchResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const now = options.now ?? (() => new Date());
  const workerId = options.workerId ?? randomUUID();
  const result: IntelligenceBatchResult = { workerId, claimed: 0, processed: 0, quarantined: 0, retrying: 0, failed: 0, clustersCreatedOrJoined: 0, meaningfulUpdates: 0, summariesQueued: 0 };
  await dependencies.heartbeat({ workerName: "story-intelligence", state: "started", at: now() });
  try {
    const articles = await dependencies.claim({ workerId, batchSize: options.batchSize ?? 5, leaseSeconds: options.leaseSeconds ?? 300, now: now() });
    result.claimed = articles.length;
    for (const article of articles) {
      const outcome = await processArticle({ article, dependencies,
        candidateLimit: options.candidateLimit ?? 12, candidateLookbackHours: options.candidateLookbackHours ?? 96,
        now });
      if (outcome === "quarantined") result.quarantined += 1;
      else if (outcome === "retrying") result.retrying += 1;
      else if (outcome === "failed") result.failed += 1;
      else { result.processed += 1; result.clustersCreatedOrJoined += 1; if (outcome.meaningfulUpdate) result.meaningfulUpdates += 1; if (outcome.summaryQueued) result.summariesQueued += 1; }
    }
    await dependencies.heartbeat({ workerName: "story-intelligence", state: "completed", at: now(), batchSize: articles.length });
    logger.info("Story intelligence batch completed", { claimed: result.claimed, processed: result.processed, quarantined: result.quarantined, retrying: result.retrying, failed: result.failed });
    return result;
  } catch (error) {
    await dependencies.heartbeat({ workerName: "story-intelligence", state: "failed", at: now(), errorCode: failureCode(error) }).catch(() => undefined);
    throw error;
  }
}
