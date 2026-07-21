import "server-only";

import { NEWS_CATEGORIES, type NewsCategory } from "@/config/product";
import { classificationSchema, type ArticleClassification } from "@/lib/intelligence/schemas";

export type LocalArticleAnalysisInput = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  language: "en" | "hi" | "ml";
  countryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  feedCategories: string[];
};

const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  india: ["india", "indian", "भारत", "इंडिया", "ഇന്ത്യ"],
  world: ["world", "global", "international", "विदेश", "दुनिया", "ലോകം"],
  "regional-local": ["local", "city", "district", "state", "नगर", "जिला", "സംസ്ഥാനം", "ജില്ല"],
  politics: ["politics", "political", "party", "minister", "parliament", "राजनीति", "मंत्री", "രാഷ്ട്രീയം", "മന്ത്രി"],
  "business-economy": ["business", "economy", "economic", "company", "trade", "व्यापार", "अर्थव्यवस्था", "ബിസിനസ്", "സമ്പദ്"],
  "markets-personal-finance": ["market", "stocks", "shares", "mutual fund", "investment", "bank", "बाजार", "निवेश", "ബാങ്ക്", "വിപണി"],
  startups: ["startup", "funding round", "venture capital", "founder"],
  "technology-ai": ["technology", "artificial intelligence", " ai ", "software", "smartphone", "computer", "robot", "टेक", "तकनीक", "സാങ്കേതിക"],
  science: ["science", "research", "study", "space", "nasa", "physics", "quantum", "astronomy", "biology", "वैज्ञानिक", "अंतरिक्ष", "ശാസ്ത്ര", "ഗവേഷണം"],
  health: ["health", "medical", "patient", "patients", "disease", "diseases", "cancer", "clinical", "screening", "syndrome", "hospital", "treatment", "therapy", "glaucoma", "retina", "स्वास्थ्य", "अस्पताल", "ആരോഗ്യ", "ആശുപത്രി"],
  "education-careers": ["education", "school", "university", "exam", "jobs", "career", "शिक्षा", "परीक्षा", "വിദ്യാഭ്യാസ", "പരീക്ഷ"],
  "government-schemes": ["government scheme", "public programme", "grant", "benefit", "subsidy", "सरकारी योजना", "सब्सिडी", "സർക്കാർ പദ്ധതി"],
  sports: ["sport", "match", "tournament", "cricket", "football", "world cup", "खेल", "क्रिकेट", "കായിക", "ക്രിക്കറ്റ്"],
  entertainment: ["film", "movie", "actor", "music", "television", "cinema", "फिल्म", "अभिनेता", "സിനിമ", "നടൻ"],
  climate: ["climate", "emissions", "carbon", "global warming", "biodiversity", "जलवायु", "पर्यावरण", "കാലാവസ്ഥ", "പരിസ്ഥിതി"],
};

const STRONG_CATEGORY_PATTERNS: Array<{ category: NewsCategory; pattern: RegExp }> = [
  { category: "health", pattern: /\b(?:health|medical|patient(?:s)?|disease(?:s)?|cancer|clinical|screening|syndrome|hospital|diagnos(?:is|ed)|treatment|therap(?:y|ies)|vaccine|outbreak|mortality|glaucoma|retina|colorectal)\b|स्वास्थ्य|अस्पताल|बीमारी|इलाज|ആരോഗ്യ|ആശുപത്രി|രോഗം|ചികിത്സ/iu },
  { category: "education-careers", pattern: /\b(?:education|school|college|student(?:s)?|teacher(?:s)?|exam(?:s)?|admission(?:s)?|scholarship(?:s)?|career(?:s)?|job(?:s)?)\b|शिक्षा|परीक्षा|വിദ്യാഭ്യാസ|പരീക്ഷ/iu },
  { category: "entertainment", pattern: /\b(?:film|movie|cinema|actor|actress|director|music|television|streaming|box office|bollywood|hollywood)\b|फिल्म|अभिनेता|സിനിമ|നടൻ/iu },
  { category: "sports", pattern: /\b(?:sport(?:s)?|match|tournament|cricket|football|formula\s*1|grand prix|world cup)\b|खेल|क्रिकेट|കായിക|ക്രിക്കറ്റ്/iu },
  { category: "startups", pattern: /\b(?:startup(?:s)?|funding round|venture capital|seed funding|founder(?:s)?)\b/iu },
  { category: "science", pattern: /\b(?:quantum|physics|astronomy|spacecraft|telescope|particle|molecule|scientist(?:s)?|laboratory|research(?:er|ers)?)\b|वैज्ञानिक|अंतरिक्ष|ശാസ്ത്ര|ഗവേഷണം/iu },
];

const TOPIC_STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "among", "been", "before", "being", "between", "could", "from", "have", "into",
  "more", "over", "report", "says", "than", "that", "their", "there", "these", "this", "through", "under", "using", "were", "what", "when",
  "where", "which", "while", "with", "would", "news", "latest", "update", "public", "first", "finds", "study",
]);

const ENTITY_STOP_WORDS = new Set([
  "a", "an", "and", "applications", "agency", "company", "government", "independent", "july", "news", "report", "the", "this",
]);

const SENSITIVE_PATTERNS: Array<{ flag: ArticleClassification["sensitiveFlags"][number]; pattern: RegExp }> = [
  { flag: "conflict", pattern: /\b(?:war|armed conflict|airstrike|missile strike|military attack|invasion|ceasefire)\b|युद्ध|हमला|യുദ്ധം|ആക്രമണം/iu },
  { flag: "death", pattern: /\b(?:death|deaths|died|dead|killed|fatal|casualt(?:y|ies))\b|मौत|मृत्यु|हत्या|മരണം/iu },
  { flag: "disaster", pattern: /\b(?:disaster|earthquake|flood|cyclone|tsunami|landslide|wildfire)\b|भूकंप|बाढ़|चक्रवात|പ്രളയം|ഭൂകമ്പം/iu },
  { flag: "election", pattern: /\b(?:election|ballot|polling station|vote count)\b|चुनाव|मतदान|തിരഞ്ഞെടുപ്പ്/iu },
  { flag: "financial", pattern: /\b(?:financial fraud|investment fraud|bank fraud|scam|bankruptcy|insolvency|market crash|money laundering)\b|घोटाला|दिवालिया|തട്ടിപ്പ്/iu },
  { flag: "government", pattern: /\b(?:government order|government scheme|ministry|cabinet|parliament|legislation|official policy|regulatory order)\b|सरकारी आदेश|मंत्रालय|संसद|മന്ത്രാലയം|പാർലമെന്റ്/iu },
  { flag: "health", pattern: /\b(?:patient(?:s)?|clinical trial|diagnos(?:is|ed)|disease(?:s)?|cancer|screening|syndrome|treatment|therap(?:y|ies)|vaccine|outbreak|epidemic|medical advice|public health|mortality|glaucoma|retina)\b|मरीज|बीमारी|इलाज|टीका|രോഗി|രോഗം|ചികിത്സ|വാക്സിൻ/iu },
  { flag: "legal", pattern: /\b(?:court ruling|lawsuit|charged with|arrested|convicted|criminal investigation|legal action)\b|अदालत|गिरफ्तार|मुकदमा|കോടതി|അറസ്റ്റ്/iu },
  { flag: "political", pattern: /\b(?:political party|prime minister|presidential|opposition leader|coalition government)\b|प्रधानमंत्री|राजनीतिक दल|പ്രധാനമന്ത്രി|രാഷ്ട്രീയ പാർട്ടി/iu },
  { flag: "public-safety", pattern: /\b(?:emergency warning|security alert|evacuation order|product recall|public safety)\b|आपात चेतावनी|सुरक्षा चेतावनी|അടിയന്തര മുന്നറിയിപ്പ്/iu },
  { flag: "safety", pattern: /\b(?:safety hazard|serious injury|unsafe product|risk of injury)\b|सुरक्षा खतरा|ഗുരുതര പരിക്ക്/iu },
];

function normalized(value: string): string {
  return ` ${value.normalize("NFKC").toLocaleLowerCase("und").replace(/[^\p{L}\p{N}%₹$]+/gu, " ").trim()} `;
}

function unique(values: string[], maximum: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLocaleLowerCase("und");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maximum) break;
  }
  return result;
}

function category(input: LocalArticleAnalysisInput, text: string): NewsCategory {
  const declared = unique(input.feedCategories, 50).filter((item): item is NewsCategory =>
    (NEWS_CATEGORIES as readonly string[]).includes(item),
  );
  const combined = `${input.title} ${input.description ?? ""}`;
  const strongMatch = STRONG_CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(combined));
  if (strongMatch) return strongMatch.category;
  const scores = [...NEWS_CATEGORIES].map((candidate) => ({
    candidate,
    score: CATEGORY_KEYWORDS[candidate].reduce((score, keyword) => score + (text.includes(normalized(keyword)) ? 1 : 0), 0)
      + (declared.includes(candidate) ? 0.25 : 0),
  })).sort((left, right) => right.score - left.score);
  if ((scores[0]?.score ?? 0) > 0) return scores[0].candidate;
  return declared[0] ?? (input.countryCode === "IN" ? "india" : "world");
}

function explicitStatus(input: LocalArticleAnalysisInput, text: string): ArticleClassification["status"] {
  if (/\b(?:sponsored|advertisement|partner content|brand studio|paid post)\b/iu.test(text)) return "sponsored";
  if (/^(?:opinion|editorial|commentary)\s*[:|—–-]/iu.test(input.title)
    || input.feedCategories.some((item) => /^(?:opinion|editorial|commentary)$/iu.test(item))) return "opinion";
  if (input.title.trim().length < 8) return "invalid-input";
  return "ready";
}

function factualDepth(input: LocalArticleAnalysisInput): number {
  const length = input.description?.trim().length ?? 0;
  if (length >= 600) return 3;
  if (length >= 140) return 2;
  if (length >= 40 || input.title.trim().length >= 25) return 1;
  return 0;
}

function extractTopics(input: LocalArticleAnalysisInput): string[] {
  const declared = input.feedCategories.filter((item) => item.length <= 80);
  const titleTokens = input.title.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return unique([
    ...declared,
    ...titleTokens.filter((token) => !TOPIC_STOP_WORDS.has(token)),
  ], 12);
}

function extractOrganizations(input: LocalArticleAnalysisInput): string[] {
  if (input.language !== "en") return [];
  const text = `${input.title}. ${input.description ?? ""}`;
  const phrases = text.match(/\b(?:[A-Z]{2,8}|[A-Z][A-Za-z0-9&.'’-]{2,})(?:\s+(?:[A-Z][A-Za-z0-9&.'’-]{2,}|of|for|and)){0,3}\b/g) ?? [];
  return unique(phrases.filter((phrase) => {
    const tokens = phrase.toLocaleLowerCase("en").split(/\s+/);
    return tokens.some((token) => !ENTITY_STOP_WORDS.has(token));
  }), 20);
}

function extractNumbers(input: LocalArticleAnalysisInput): ArticleClassification["importantNumbers"] {
  const text = `${input.title} ${input.description ?? ""}`;
  const matches = text.match(/(?:₹|\$)?\p{N}+(?:[.,]\p{N}+)*(?:\s?(?:%|percent|crore|lakh|million|billion|trillion|km|kg|years?|days?|hours?))?/giu) ?? [];
  return unique(matches, 20).map((value) => ({
    // Use the observed value as the local identity. Ordinal labels would make
    // unrelated first/second numbers look like contradictory claims.
    label: `reported-value-${value.normalize("NFKC").toLocaleLowerCase("und")}`.slice(0, 120),
    value: value.slice(0, 80),
    unit: null,
    qualifier: null,
  }));
}

function extractUncertainty(text: string): string[] {
  const markers = text.match(/\b(?:alleged|allegedly|could|estimated|expected|likely|may|might|planned|reportedly|unconfirmed)\b|कथित|संभावित|അനുമാന|സാധ്യത/giu) ?? [];
  return unique(markers.map((item) => item.toLocaleLowerCase("und")), 12);
}

export function analyzeArticleLocally(input: LocalArticleAnalysisInput): ArticleClassification {
  const combined = `${input.title} ${input.description ?? ""}`;
  const text = normalized(combined);
  const status = explicitStatus(input, text);
  const depth = status === "ready" ? factualDepth(input) : 0;
  const published = new Date(input.publishedAt);
  const eventTime = Number.isNaN(published.getTime()) ? null : published.toISOString();
  const sensitiveFlags = unique(SENSITIVE_PATTERNS
    .filter(({ pattern }) => pattern.test(combined))
    .map(({ flag }) => flag), 11) as ArticleClassification["sensitiveFlags"];
  const storyCategory = category(input, text);

  return classificationSchema.parse({
    status: status === "ready" && depth === 0 ? "insufficient-evidence" : status,
    category: storyCategory,
    topics: extractTopics(input),
    entities: {
      people: [],
      organizations: extractOrganizations(input),
      locations: unique([input.city ?? "", input.stateRegion ?? ""], 20),
    },
    geography: { countryCode: input.countryCode, stateRegion: input.stateRegion, city: input.city },
    eventTime,
    eventType: `${storyCategory}-report`,
    keyAction: input.title.trim().slice(0, 500) || null,
    // Free-form RSS descriptions are usually paraphrases, not objective update
    // fields. Leaving this null prevents wording changes from versioning a story;
    // locally extracted numeric changes can still create meaningful updates.
    keyOutcome: null,
    importantNumbers: extractNumbers(input),
    sensitiveFlags,
    factualDepth: depth,
    sourceIds: [input.id],
    uncertaintyMarkers: extractUncertainty(combined),
  });
}
