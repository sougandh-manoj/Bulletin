import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  cancelOwnerDelivery,
  retryOwnerDelivery,
  setOwnerControl,
} from "@/data/operations";
import { getOwnerEnvironment } from "@/env/server";
import { getAuthenticatedOwner } from "@/lib/security/admin-session";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/security/constants";
import { hasValidSameOrigin } from "@/lib/security/request";

export const runtime = "nodejs";

const controlSchema = z.object({
  action: z.literal("control"),
  csrf: z.string().min(1),
  control: z.enum([
    "email-delivery-enabled",
    "delivery-worker-paused",
    "personalization-worker-paused",
    "ingestion-worker-paused",
    "intelligence-worker-paused",
  ]),
  enabled: z.enum(["true", "false"]),
});
const deliverySchema = z.object({
  action: z.enum(["cancel-delivery", "retry-delivery"]),
  csrf: z.string().min(1),
  deliveryId: z.string().uuid(),
});

export async function POST(request: Request) {
  const environment = getOwnerEnvironment();
  if (!hasValidSameOrigin(request, environment.APP_BASE_URL)) {
    return new Response("Denied", { status: 403, headers: PRIVATE_RESPONSE_HEADERS });
  }
  const body = Object.fromEntries(await request.formData());
  const parsed = body.action === "control" ? controlSchema.safeParse(body) : deliverySchema.safeParse(body);
  if (!parsed.success) return new Response("Invalid owner action", { status: 400, headers: PRIVATE_RESPONSE_HEADERS });
  const owner = await getAuthenticatedOwner({ csrfToken: parsed.data.csrf });
  if (!owner) return new Response("Unauthorized", { status: 401, headers: PRIVATE_RESPONSE_HEADERS });
  const requestId = randomUUID();
  if (parsed.data.action === "control") {
    await setOwnerControl({ control: parsed.data.control, enabled: parsed.data.enabled === "true", requestId });
  } else if (parsed.data.action === "cancel-delivery") {
    await cancelOwnerDelivery({ deliveryId: parsed.data.deliveryId, requestId });
  } else {
    await retryOwnerDelivery({ deliveryId: parsed.data.deliveryId, requestId });
  }
  return NextResponse.redirect(new URL("/internal/operations", request.url), {
    status: 303,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}
