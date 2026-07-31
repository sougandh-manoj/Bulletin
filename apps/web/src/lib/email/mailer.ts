import "server-only";

import nodemailer from "nodemailer";

import { PRODUCT } from "@/config/product";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";

import {
  buildOwnerAlertEmail,
  buildOwnerAccessEmail,
} from "./templates";

const logger = createLogger("transactional-email");

export class EmailDeliveryError extends Error {
  constructor() {
    super("Transactional email delivery failed");
    this.name = "EmailDeliveryError";
  }
}

export class BriefingDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly permanent: boolean,
  ) {
    super("Briefing email delivery failed");
    this.name = "BriefingDeliveryError";
  }
}

function getTransport() {
  const environment = getSecureAccessEnvironment();
  if (environment.APP_ENV === "test" || environment.EMAIL_TRANSPORT === "test") {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: environment.GMAIL_SMTP_USER,
      pass: environment.GMAIL_SMTP_APP_PASSWORD,
    },
  });
}

export function isSmtpDeliveryAccepted(info: unknown) {
  if (!info || typeof info !== "object" || !("accepted" in info)) return false;
  const accepted = (info as { accepted?: unknown }).accepted;
  return Array.isArray(accepted) && accepted.length > 0;
}

async function send(input: {
  recipient: string;
  kind: "owner-access" | "owner-alert";
  subject: string;
  text: string;
  html: string;
}) {
  const environment = getSecureAccessEnvironment();
  try {
    const result = await getTransport().sendMail({
      from: `${PRODUCT.name} <${environment.GMAIL_SMTP_USER ?? "test@bulletin.invalid"}>`,
      to: input.recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    if (
      environment.EMAIL_TRANSPORT === "smtp"
      && !isSmtpDeliveryAccepted(result)
    ) {
      throw new EmailDeliveryError();
    }
    logger.info("Transactional email accepted by configured transport", {
      kind: input.kind,
      transport: environment.EMAIL_TRANSPORT,
    });
  } catch (error) {
    logger.error("Transactional email delivery failed", {
      kind: input.kind,
      error,
    });
    throw new EmailDeliveryError();
  }
}

function classifySmtpError(error: unknown): BriefingDeliveryError {
  const candidate = error as {
    code?: string;
    responseCode?: number;
    command?: string;
  } | null;
  const responseCode = Number(candidate?.responseCode ?? 0);
  if (responseCode >= 500 && responseCode < 600) {
    return new BriefingDeliveryError("smtp-permanent-response", true);
  }
  if (responseCode >= 400 && responseCode < 500) {
    return new BriefingDeliveryError("smtp-temporary-response", false);
  }
  const code = String(candidate?.code ?? "").toUpperCase();
  if (["EAUTH", "EENVELOPE", "EMESSAGE"].includes(code)) {
    return new BriefingDeliveryError(`smtp-${code.toLowerCase()}`, true);
  }
  if (["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS"].includes(code)) {
    return new BriefingDeliveryError(`smtp-${code.toLowerCase()}`, false);
  }
  return new BriefingDeliveryError("smtp-transport-error", false);
}

export async function sendBriefingEmail(input: {
  recipient: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ messageId: string }> {
  const environment = getSecureAccessEnvironment();
  try {
    const result = await getTransport().sendMail({
      from: `${PRODUCT.name} <${environment.GMAIL_SMTP_USER ?? "test@bulletin.invalid"}>`,
      to: input.recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    if (environment.EMAIL_TRANSPORT === "smtp" && !isSmtpDeliveryAccepted(result)) {
      throw new BriefingDeliveryError("smtp-recipient-not-accepted", true);
    }
    const messageId = typeof result.messageId === "string" && result.messageId.trim()
      ? result.messageId.slice(0, 255)
      : `test-${Date.now()}`;
    logger.info("Briefing accepted by configured transport", {
      kind: "briefing",
      transport: environment.EMAIL_TRANSPORT,
    });
    return { messageId };
  } catch (error) {
    const classified = error instanceof BriefingDeliveryError
      ? error
      : classifySmtpError(error);
    logger.error("Briefing email delivery failed", {
      kind: "briefing",
      errorCode: classified.code,
      permanent: classified.permanent,
    });
    throw classified;
  }
}

export async function sendOwnerAccessEmail(recipient: string, url: string) {
  await send({
    recipient,
    kind: "owner-access",
    ...buildOwnerAccessEmail(url),
  });
}

export async function sendOwnerAlertEmail(input: {
  recipient: string;
  title: string;
  operationsUrl: string;
}) {
  await send({
    recipient: input.recipient,
    kind: "owner-alert",
    ...buildOwnerAlertEmail({ title: input.title, operationsUrl: input.operationsUrl }),
  });
}
