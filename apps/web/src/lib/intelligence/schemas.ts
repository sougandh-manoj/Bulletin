import { z } from "zod";

import { NEWS_CATEGORIES } from "@/config/product";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableBoundedText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const uniqueStrings = (maximumItems: number, maximumLength = 160) => z.array(
  boundedText(maximumLength),
).max(maximumItems).refine((items) => new Set(items.map((item) => item.toLocaleLowerCase("und"))).size === items.length, {
  message: "Values must be unique",
});

export const providerStatusSchema = z.enum([
  "ready",
  "invalid-input",
  "opinion",
  "sponsored",
  "insufficient-evidence",
  "conflicting-evidence",
]);

export const entitySetSchema = z.object({
  people: uniqueStrings(20),
  organizations: uniqueStrings(20),
  locations: uniqueStrings(20),
}).strict();

export const geographySchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  stateRegion: nullableBoundedText(120),
  city: nullableBoundedText(120),
}).strict();

export const importantNumberSchema = z.object({
  label: boundedText(120),
  value: boundedText(80),
  unit: nullableBoundedText(40),
  qualifier: nullableBoundedText(120),
}).strict();

export const sensitiveFlagSchema = z.enum([
  "conflict",
  "death",
  "disaster",
  "election",
  "financial",
  "government",
  "health",
  "legal",
  "political",
  "public-safety",
  "safety",
]);

export const classificationSchema = z.object({
  status: providerStatusSchema,
  category: z.enum(NEWS_CATEGORIES),
  topics: uniqueStrings(12, 80),
  entities: entitySetSchema,
  geography: geographySchema,
  eventTime: z.string().datetime({ offset: true }).nullable(),
  eventType: boundedText(100),
  keyAction: nullableBoundedText(500),
  keyOutcome: nullableBoundedText(500),
  importantNumbers: z.array(importantNumberSchema).max(20),
  sensitiveFlags: z.array(sensitiveFlagSchema).max(11).refine((items) => new Set(items).size === items.length),
  factualDepth: z.number().int().min(0).max(3),
  sourceIds: uniqueStrings(8, 64).min(1),
  uncertaintyMarkers: uniqueStrings(12, 200),
}).strict();

export const clusterVerificationSchema = z.object({
  status: providerStatusSchema,
  sameEvent: z.boolean(),
  consistent: z.boolean(),
  meaningfulUpdate: z.boolean(),
  conflicts: uniqueStrings(20, 300),
  reasonCodes: uniqueStrings(20, 80),
  sourceIds: uniqueStrings(20, 64).min(1),
}).strict();

export const attributionMarkerSchema = z.object({
  articleId: boundedText(64),
  publisherName: boundedText(200),
}).strict();

export const sharedSummarySchema = z.object({
  status: providerStatusSchema,
  headline: boundedText(220),
  summary: boundedText(2_000),
  whyItMatters: boundedText(800),
  citationArticleIds: uniqueStrings(12, 64).min(1),
  attributionMarkers: z.array(attributionMarkerSchema).max(12),
  uncertaintyMarkers: uniqueStrings(12, 200),
  isUpdate: z.boolean(),
}).strict();

export const localizedSummarySchema = sharedSummarySchema.extend({
  language: z.enum(["hi", "ml"]),
}).strict();

export const finalVerificationSchema = z.object({
  status: providerStatusSchema,
  passed: z.boolean(),
  unsupportedClaims: uniqueStrings(20, 400),
  invalidCitationIds: uniqueStrings(20, 64),
  numericConflicts: uniqueStrings(20, 300),
  uncertaintyPreserved: z.boolean(),
  attributionPreserved: z.boolean(),
}).strict();

export type ArticleClassification = z.infer<typeof classificationSchema>;
export type ClusterVerification = z.infer<typeof clusterVerificationSchema>;
export type SharedSummary = z.infer<typeof sharedSummarySchema>;
export type LocalizedSummary = z.infer<typeof localizedSummarySchema>;
export type FinalVerification = z.infer<typeof finalVerificationSchema>;
export type EntitySet = z.infer<typeof entitySetSchema>;
export type ImportantNumber = z.infer<typeof importantNumberSchema>;

const text = (maxLength: number, nullable = false) => ({
  type: nullable ? ["string", "null"] : "string",
  minLength: 1,
  maxLength,
});
const stringArray = (maxItems: number, maxLength: number) => ({
  type: "array",
  maxItems,
  items: text(maxLength),
});

export const classificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "category", "topics", "entities", "geography", "eventTime", "eventType", "keyAction", "keyOutcome", "importantNumbers", "sensitiveFlags", "factualDepth", "sourceIds", "uncertaintyMarkers"],
  properties: {
    status: { type: "string", enum: providerStatusSchema.options },
    category: { type: "string", enum: NEWS_CATEGORIES },
    topics: stringArray(12, 80),
    entities: {
      type: "object", additionalProperties: false, required: ["people", "organizations", "locations"],
      properties: { people: stringArray(20, 160), organizations: stringArray(20, 160), locations: stringArray(20, 160) },
    },
    geography: {
      type: "object", additionalProperties: false, required: ["countryCode", "stateRegion", "city"],
      properties: { countryCode: text(2, true), stateRegion: text(120, true), city: text(120, true) },
    },
    eventTime: text(40, true), eventType: text(100), keyAction: text(500, true), keyOutcome: text(500, true),
    importantNumbers: {
      type: "array", maxItems: 20, items: {
        type: "object", additionalProperties: false, required: ["label", "value", "unit", "qualifier"],
        properties: { label: text(120), value: text(80), unit: text(40, true), qualifier: text(120, true) },
      },
    },
    sensitiveFlags: { type: "array", maxItems: 11, items: { type: "string", enum: sensitiveFlagSchema.options } },
    factualDepth: { type: "integer", minimum: 0, maximum: 3 },
    sourceIds: stringArray(8, 64), uncertaintyMarkers: stringArray(12, 200),
  },
} as const;

export const clusterVerificationJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "sameEvent", "consistent", "meaningfulUpdate", "conflicts", "reasonCodes", "sourceIds"],
  properties: {
    status: { type: "string", enum: providerStatusSchema.options }, sameEvent: { type: "boolean" }, consistent: { type: "boolean" }, meaningfulUpdate: { type: "boolean" },
    conflicts: stringArray(20, 300), reasonCodes: stringArray(20, 80), sourceIds: stringArray(20, 64),
  },
} as const;

const summaryProperties = {
  status: { type: "string", enum: providerStatusSchema.options }, headline: text(220), summary: text(2_000), whyItMatters: text(800),
  citationArticleIds: stringArray(12, 64),
  attributionMarkers: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["articleId", "publisherName"], properties: { articleId: text(64), publisherName: text(200) } } },
  uncertaintyMarkers: stringArray(12, 200), isUpdate: { type: "boolean" },
} as const;

export const sharedSummaryJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "headline", "summary", "whyItMatters", "citationArticleIds", "attributionMarkers", "uncertaintyMarkers", "isUpdate"],
  properties: summaryProperties,
} as const;

export const localizedSummaryJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "headline", "summary", "whyItMatters", "citationArticleIds", "attributionMarkers", "uncertaintyMarkers", "isUpdate", "language"],
  properties: { ...summaryProperties, language: { type: "string", enum: ["hi", "ml"] } },
} as const;

export const finalVerificationJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "passed", "unsupportedClaims", "invalidCitationIds", "numericConflicts", "uncertaintyPreserved", "attributionPreserved"],
  properties: {
    status: { type: "string", enum: providerStatusSchema.options }, passed: { type: "boolean" },
    unsupportedClaims: stringArray(20, 400), invalidCitationIds: stringArray(20, 64), numericConflicts: stringArray(20, 300),
    uncertaintyPreserved: { type: "boolean" }, attributionPreserved: { type: "boolean" },
  },
} as const;
