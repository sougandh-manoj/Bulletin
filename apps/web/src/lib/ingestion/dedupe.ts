import type { NormalizedArticle } from "@/lib/ingestion/types";

export const EXACT_TITLE_WINDOW_MS = 72 * 60 * 60 * 1000;
export const NEAR_TITLE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const NEAR_TITLE_THRESHOLD = 0.92;
const MINIMUM_NEAR_DUPLICATE_TOKENS = 6;

export type DuplicateCandidate = Pick<
  NormalizedArticle,
  "sourceId" | "normalizedTitle" | "normalizedTitleHash" | "publishedAt"
> & { id: string };

export type DuplicateDecision =
  | { kind: "same-source-title" | "same-source-near-title"; articleId: string }
  | null;

function tokens(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function numericTokens(values: string[]): string[] {
  return values.filter((value) => /^\p{N}+$/u.test(value));
}

function bigrams(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < values.length - 1; index += 1) {
    const bigram = `${values[index]}\u0000${values[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

export function titleDiceSimilarity(leftTitle: string, rightTitle: string): number {
  const left = bigrams(tokens(leftTitle));
  const right = bigrams(tokens(rightTitle));
  const leftSize = [...left.values()].reduce((sum, count) => sum + count, 0);
  const rightSize = [...right.values()].reduce((sum, count) => sum + count, 0);
  if (leftSize === 0 || rightSize === 0) return leftTitle === rightTitle ? 1 : 0;
  let overlap = 0;
  for (const [bigram, count] of left) {
    overlap += Math.min(count, right.get(bigram) ?? 0);
  }
  return (2 * overlap) / (leftSize + rightSize);
}

export function findSameSourceDuplicate(
  article: NormalizedArticle,
  candidates: DuplicateCandidate[],
): DuplicateDecision {
  const articleTime = Date.parse(article.publishedAt);
  const articleTokens = tokens(article.normalizedTitle);
  const articleNumbers = numericTokens(articleTokens);

  for (const candidate of candidates) {
    if (candidate.sourceId !== article.sourceId) continue;
    const age = Math.abs(articleTime - Date.parse(candidate.publishedAt));
    if (age <= EXACT_TITLE_WINDOW_MS && candidate.normalizedTitleHash === article.normalizedTitleHash) {
      return { kind: "same-source-title", articleId: candidate.id };
    }
  }

  if (articleTokens.length < MINIMUM_NEAR_DUPLICATE_TOKENS) return null;
  for (const candidate of candidates) {
    if (candidate.sourceId !== article.sourceId) continue;
    const age = Math.abs(articleTime - Date.parse(candidate.publishedAt));
    if (age > NEAR_TITLE_WINDOW_MS) continue;
    const candidateTokens = tokens(candidate.normalizedTitle);
    if (candidateTokens.length < MINIMUM_NEAR_DUPLICATE_TOKENS) continue;
    if (numericTokens(candidateTokens).join("\u0000") !== articleNumbers.join("\u0000")) continue;
    if (titleDiceSimilarity(article.normalizedTitle, candidate.normalizedTitle) >= NEAR_TITLE_THRESHOLD) {
      return { kind: "same-source-near-title", articleId: candidate.id };
    }
  }
  return null;
}

