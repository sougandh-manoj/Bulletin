import type { FinalVerification, LocalizedSummary, SharedSummary } from "@/lib/intelligence/schemas";

type Evidence = { id: string; publisherName: string; title: string; description: string | null };

function digits(value: string): Set<string> {
  return new Set(value.normalize("NFKC").match(/\p{N}+(?:[.,]\p{N}+)*(?:%|₹|\$)?/gu) ?? []);
}

function summaryText(value: SharedSummary | LocalizedSummary): string {
  return `${value.headline}\n${value.summary}\n${value.whyItMatters}`;
}

function sentenceCount(value: string): number {
  return value.split(/[.!?।॥]+/u).map((item) => item.trim()).filter(Boolean).length;
}

const GROUNDING_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "being", "but", "can", "could", "for", "from", "has", "have", "into", "its", "may",
  "more", "not", "over", "publisher", "report", "reported", "reports", "source", "sources", "than", "that", "the", "their", "this", "through",
  "under", "was", "were", "will", "with", "would",
]);

function contentTokens(value: string): string[] {
  return (value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((token) => !GROUNDING_STOP_WORDS.has(token));
}

export type GroundingResult = {
  passed: boolean;
  reasonCodes: string[];
  unsupportedClaims: string[];
  invalidCitationIds: string[];
  numericConflicts: string[];
  uncertaintyPreserved: boolean;
  attributionPreserved: boolean;
};

export function deterministicGrounding(
  output: SharedSummary | LocalizedSummary,
  evidence: Evidence[],
  canonical?: SharedSummary,
  expectedIsUpdate?: boolean,
): GroundingResult {
  const reasons: string[] = [];
  const unsupportedClaims: string[] = [];
  const sentences = sentenceCount(output.summary);
  if (sentences < 3 || sentences > 4) {
    reasons.push("summary-sentence-count");
    unsupportedClaims.push("Summary must contain exactly three or four complete factual sentences.");
  }
  if (expectedIsUpdate !== undefined && output.isUpdate !== expectedIsUpdate) {
    reasons.push("update-status-mismatch");
    unsupportedClaims.push("Summary update status does not match the cluster version.");
  }
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const invalidCitationIds = output.citationArticleIds.filter((id) => !evidenceById.has(id));
  if (invalidCitationIds.length > 0) reasons.push("invalid-citation-id");
  const markerIds = new Set(output.attributionMarkers.map((marker) => marker.articleId));
  if (output.citationArticleIds.some((id) => !markerIds.has(id))) reasons.push("missing-attribution-marker");
  for (const marker of output.attributionMarkers) {
    const source = evidenceById.get(marker.articleId);
    if (!source || source.publisherName !== marker.publisherName) reasons.push("invalid-publisher-attribution");
  }
  const citedText = output.citationArticleIds.map((id) => {
    const item = evidenceById.get(id);
    return item ? `${item.title} ${item.description ?? ""}` : "";
  }).join(" ");
  const supportedDigits = digits(citedText);
  const numericConflicts = [...digits(summaryText(output))].filter((value) => !supportedDigits.has(value));
  if (numericConflicts.length > 0) reasons.push("unsupported-numeric-claim");
  // Translations do not share vocabulary with their English evidence, so this
  // conservative lexical sanity check applies only to canonical summaries.
  if (!("language" in output)) {
    const evidenceTokens = new Set(contentTokens(citedText));
    for (const sentence of output.summary.split(/[.!?।॥]+/u).map((item) => item.trim()).filter(Boolean)) {
      const tokens = contentTokens(sentence);
      if (tokens.length < 5) continue;
      const supported = tokens.filter((token) => evidenceTokens.has(token));
      if (supported.length === 0) {
        reasons.push("unsupported-lexical-claim");
        unsupportedClaims.push(sentence.slice(0, 400));
      }
    }
  }
  const evidenceHasUncertainty = /\b(?:alleged|allegedly|could|estimated|expected|likely|may|might|planned|reportedly|unconfirmed)\b|कथित|संभावित|അനുമാന|സാധ്യത/iu.test(citedText);
  const outputHasUncertainty = /\b(?:alleged|allegedly|could|estimated|expected|likely|may|might|planned|reportedly|unconfirmed)\b|कथित|संभावित|അനുമാന|സാധ്യത/iu.test(summaryText(output));
  const uncertaintyPreserved = !evidenceHasUncertainty || outputHasUncertainty;
  if (!uncertaintyPreserved) reasons.push("uncertainty-not-preserved");
  if (canonical) {
    const canonicalDigits = digits(summaryText(canonical));
    if ([...digits(summaryText(output))].some((value) => !canonicalDigits.has(value))) reasons.push("localization-numeric-drift");
    if (output.citationArticleIds.join("|") !== canonical.citationArticleIds.join("|")) reasons.push("localization-citation-drift");
    if (output.isUpdate !== canonical.isUpdate) reasons.push("localization-update-drift");
  }
  const citationIds = new Set(output.citationArticleIds);
  if (output.attributionMarkers.some((marker) => !citationIds.has(marker.articleId))) reasons.push("attribution-not-cited");
  if ("language" in output) {
    const text = summaryText(output);
    const script = output.language === "hi" ? /[\u0900-\u097F]/u : /[\u0D00-\u0D7F]/u;
    if (!script.test(text)) reasons.push("localization-script-mismatch");
  } else {
    const text = summaryText(output);
    const latinLetters = (text.match(/[A-Za-z]/g) ?? []).length;
    const targetScriptLetters = (text.match(/[\u0900-\u097F\u0D00-\u0D7F]/gu) ?? []).length;
    if (latinLetters === 0 || targetScriptLetters > latinLetters) reasons.push("canonical-english-script-mismatch");
  }
  const reasonCodes = [...new Set(reasons)];
  const attributionPreserved = !reasonCodes.some((reason) => [
    "missing-attribution-marker", "invalid-publisher-attribution", "attribution-not-cited",
  ].includes(reason));
  return {
    passed: reasonCodes.length === 0,
    reasonCodes,
    unsupportedClaims: [...new Set(unsupportedClaims)],
    invalidCitationIds: [...new Set(invalidCitationIds)],
    numericConflicts: [...new Set(numericConflicts)],
    uncertaintyPreserved,
    attributionPreserved,
  };
}

export function localFinalVerification(value: GroundingResult): FinalVerification {
  return {
    status: value.passed ? "ready" : "invalid-input",
    passed: value.passed,
    unsupportedClaims: value.unsupportedClaims,
    invalidCitationIds: value.invalidCitationIds,
    numericConflicts: value.numericConflicts,
    uncertaintyPreserved: value.uncertaintyPreserved,
    attributionPreserved: value.attributionPreserved,
  };
}

export function acceptedFinalVerification(value: FinalVerification): boolean {
  return value.status === "ready"
    && value.passed
    && value.unsupportedClaims.length === 0
    && value.invalidCitationIds.length === 0
    && value.numericConflicts.length === 0
    && value.uncertaintyPreserved
    && value.attributionPreserved;
}
