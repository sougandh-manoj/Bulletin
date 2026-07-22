import "server-only";

import { createHash } from "node:crypto";

import type { ArticleClassification, EntitySet, ImportantNumber } from "@/lib/intelligence/schemas";

export type EventFacts = Pick<ArticleClassification, "entities" | "eventTime" | "eventType" | "keyAction" | "keyOutcome" | "importantNumbers"> & {
  geography: { countryCode: string | null; stateRegion: string | null; city: string | null };
};

export type EventConsistency = {
  decision: "accept" | "reject" | "uncertain";
  reasonCodes: string[];
  conflicts: string[];
};

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("und").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const ENTITY_STOP_WORDS = new Set([
  "agency", "board", "centre", "company", "consequences", "corporation", "court", "department", "government", "group", "happens",
  "have", "india", "international", "ministry", "news", "report", "says", "state", "the", "whatever", "why", "will",
]);

function values(entitySet: EntitySet): string[] {
  const people = Array.isArray(entitySet?.people) ? entitySet.people : [];
  const organizations = Array.isArray(entitySet?.organizations) ? entitySet.organizations : [];
  return [...people, ...organizations]
    .flatMap((value) => normalized(value).split(" "))
    .filter((value) => value.length >= 4 && !ENTITY_STOP_WORDS.has(value));
}

function overlaps(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function numberMap(numbers: ImportantNumber[]): Map<string, string> {
  return new Map(numbers.map((item) => [normalized(item.label), normalized(`${item.value} ${item.unit ?? ""}`)]));
}

function locationConflict(left: string | null, right: string | null): boolean {
  return Boolean(left && right && normalized(left) !== normalized(right));
}

export function evaluateEventConsistency(article: EventFacts, candidate: EventFacts): EventConsistency {
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const actionSimilarity = tokenDice(article.keyAction ?? "", candidate.keyAction ?? "");
  if (normalized(article.eventType) !== normalized(candidate.eventType)) conflicts.push("event-type-mismatch");
  if (locationConflict(article.geography.countryCode, candidate.geography.countryCode)) conflicts.push("country-mismatch");
  if (locationConflict(article.geography.stateRegion, candidate.geography.stateRegion)) conflicts.push("state-region-mismatch");
  if (locationConflict(article.geography.city, candidate.geography.city)) conflicts.push("city-mismatch");

  if (article.eventTime && candidate.eventTime) {
    const difference = Math.abs(Date.parse(article.eventTime) - Date.parse(candidate.eventTime));
    if (!Number.isFinite(difference) || difference > 36 * 60 * 60 * 1_000) conflicts.push("event-time-window-mismatch");
    else reasons.push("event-time-compatible");
  }

  const articleNumbers = numberMap(article.importantNumbers);
  const candidateNumbers = numberMap(candidate.importantNumbers);
  for (const [label, value] of articleNumbers) {
    const candidateValue = candidateNumbers.get(label);
    if (candidateValue && candidateValue !== value) conflicts.push(`numeric-conflict:${label}`);
    else if (candidateValue) reasons.push("numeric-claim-compatible");
  }

  const articleEntities = values(article.entities);
  const candidateEntities = values(candidate.entities);
  const hasEntityOverlap = articleEntities.length > 0 && candidateEntities.length > 0
    && overlaps(articleEntities, candidateEntities);
  if (articleEntities.length > 0 && candidateEntities.length > 0) {
    if (hasEntityOverlap) reasons.push("principal-entity-overlap");
    else conflicts.push("principal-entity-mismatch");
  }
  if (actionSimilarity >= 0.55) reasons.push("key-action-overlap");
  if (conflicts.length > 0) return { decision: "reject", reasonCodes: reasons, conflicts };

  const sameEventType = normalized(article.eventType) === normalized(candidate.eventType);
  const geographyAnchor = ["countryCode", "stateRegion", "city"].some((key) => {
    const field = key as keyof EventFacts["geography"];
    return Boolean(article.geography[field] && candidate.geography[field]
      && normalized(article.geography[field]) === normalized(candidate.geography[field]));
  });
  const preciseGeographyAnchor = ["stateRegion", "city"].some((key) => {
    const field = key as "stateRegion" | "city";
    return Boolean(article.geography[field] && candidate.geography[field]
      && normalized(article.geography[field]) === normalized(candidate.geography[field]));
  });
  const supportedEntityAnchor = hasEntityOverlap && (
    actionSimilarity >= 0.2 || reasons.includes("numeric-claim-compatible") || preciseGeographyAnchor
  );
  if (sameEventType && (
    actionSimilarity >= 0.72
    || supportedEntityAnchor
    || (geographyAnchor && reasons.includes("event-time-compatible") && actionSimilarity >= 0.55)
  )) {
    reasons.push("deterministic-event-anchor");
    return { decision: "accept", reasonCodes: reasons, conflicts };
  }
  return { decision: "uncertain", reasonCodes: reasons, conflicts };
}

function materialOutcomeChanged(next: string | null, previous: string | null): boolean {
  const nextValue = normalized(next);
  const previousValue = normalized(previous);
  return Boolean(nextValue && (!previousValue || nextValue !== previousValue));
}

export function isMeaningfulEventUpdate(article: EventFacts, candidate: EventFacts): boolean {
  // A paraphrased action is repeated reporting, not an update. Version bumps
  // require a new/changed outcome or an important numeric claim.
  if (materialOutcomeChanged(article.keyOutcome, candidate.keyOutcome)) return true;
  const previous = numberMap(candidate.importantNumbers);
  return article.importantNumbers.some((item) => previous.get(normalized(item.label)) !== normalized(`${item.value} ${item.unit ?? ""}`));
}

export function eventFingerprint(facts: EventFacts, fallbackTime?: string, identityText?: string): string {
  const identityTime = facts.eventTime ?? fallbackTime;
  const eventDate = identityTime ? new Date(identityTime).toISOString().slice(0, 10) : "unknown-date";
  const principalEntities = values(facts.entities).sort();
  const numbers = facts.importantNumbers.map((item) => [normalized(item.label), normalized(`${item.value} ${item.unit ?? ""}`)]).sort();
  return createHash("sha256").update(JSON.stringify({
    eventType: normalized(facts.eventType), eventDate,
    geography: [facts.geography.countryCode, facts.geography.stateRegion, facts.geography.city].map(normalized),
    principalEntities, numbers, storyIdentity: normalized(identityText),
  })).digest("hex");
}

const ACTION_STOP_WORDS = new Set([
  "about", "after", "again", "also", "among", "and", "before", "being", "from", "have", "into", "latest", "more", "news",
  "over", "report", "says", "than", "that", "their", "there", "these", "this", "through", "under", "update", "what", "when",
  "where", "which", "while", "why", "will", "with", "would",
  "अब", "और", "का", "की", "के", "को", "क्या", "क्यों", "ने", "पर", "में", "यह", "से", "है", "हैं", "हुआ", "हुई", "लिए",
  "അത്", "ഒരു", "എന്ന", "എന്ന്", "ഈ", "കൂടി", "ചെയ്തു", "നിന്ന്", "മുതൽ", "വരെ",
]);

function actionTokens(value: string): string[] {
  return normalized(value).split(" ").filter((token) =>
    token.length >= 3 && !/^\p{N}+$/u.test(token) && !ACTION_STOP_WORDS.has(token),
  );
}

function dice(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const token of rightTokens) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  let matches = 0;
  for (const token of leftTokens) {
    const count = remaining.get(token) ?? 0;
    if (count > 0) { matches += 1; remaining.set(token, count - 1); }
  }
  return (2 * matches) / (leftTokens.length + rightTokens.length);
}

function tokenDice(left: string, right: string): number {
  return dice(actionTokens(left), actionTokens(right));
}

const TITLE_STOP_WORDS = new Set([
  ...ACTION_STOP_WORDS,
  "breaking", "exclusive", "explained", "live", "photos", "today", "video",
]);

function titleTokens(value: string): string[] {
  return normalized(value).split(" ").filter((token) =>
    token.length >= 3 && !TITLE_STOP_WORDS.has(token),
  );
}

/** Title-only duplicate score used by the simplified story pipeline. */
export function titleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (Math.min(leftTokens.length, rightTokens.length) < 3) return 0;
  const rightSet = new Set(rightTokens);
  const shared = new Set(leftTokens.filter((token) => rightSet.has(token))).size;
  if (shared < 3) return 0;
  const diceScore = (2 * shared) / (new Set(leftTokens).size + rightSet.size);
  const containment = shared / Math.min(new Set(leftTokens).size, rightSet.size);
  return Math.max(diceScore, containment * 0.92);
}

function rawTokenDice(left: string, right: string): number {
  return dice(normalized(left).split(" ").filter(Boolean), normalized(right).split(" ").filter(Boolean));
}

export function crossSourceDuplicateKind(
  articleText: string,
  evidenceText: string,
): "cross-source-exact" | "cross-source-near" | null {
  const left = normalized(articleText);
  const right = normalized(evidenceText);
  if (left && left === right) return "cross-source-exact";
  return rawTokenDice(left, right) >= 0.94 ? "cross-source-near" : null;
}
