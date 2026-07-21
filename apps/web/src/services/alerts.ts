import "server-only";

import { recordDeliveryAlert } from "@/data/delivery";
import { getOwnerEnvironment } from "@/env/server";
import { sendOwnerAlertEmail } from "@/lib/email/mailer";

export async function recordAndNotifyOperationalAlert(input: Parameters<typeof recordDeliveryAlert>[0]) {
  const shouldNotify = await recordDeliveryAlert(input);
  if (shouldNotify && input.severity === "critical") {
    const environment = getOwnerEnvironment();
    await sendOwnerAlertEmail({
      recipient: environment.OWNER_EMAIL,
      title: input.title,
      operationsUrl: new URL("/internal/operations", environment.APP_BASE_URL).toString(),
    });
  }
  return shouldNotify;
}
