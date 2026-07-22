import "server-only";

const POLICY = `Summarize one news story for Bulletin. Use only the supplied article evidence. Return only the strict JSON object. Do not invent facts, numbers, sources, or citation IDs.`;

export function sharedSummaryPrompt(input: Record<string, unknown>): string {
  return `${POLICY}\nWrite: headline, 2-3 sentence summary, 1 sentence whyItMatters. Cite only article IDs in evidence. Use uncertainty words when evidence is uncertain. If evidence cannot support a basic summary, return status insufficient-evidence.\nEvidence JSON:\n${JSON.stringify(input)}`;
}

export function localizationPrompt(input: Record<string, unknown>, language: "hi" | "ml"): string {
  const name = language === "hi" ? "Hindi" : "Malayalam";
  return `${POLICY}\nTranslate the verified summary into ${name}. Preserve facts, numbers, publisher names, citation IDs, and uncertainty. Do not add facts.\nJSON:\n${JSON.stringify(input)}`;
}
