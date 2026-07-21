import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BRIEFING_THEMES } from "@/config/product";
import { buildStoredBriefingEmail } from "@/lib/email/briefing";

const enabled = process.env.RUN_PHASE9_EMAIL_VISUAL === "1";

describe.skipIf(!enabled)("Phase 9 email visual fixtures", () => {
  it("writes deterministic non-sending HTML for all four themes", async () => {
    const output = path.resolve(process.cwd(), "../../verification/phase9-email");
    await mkdir(output, { recursive: true });
    for (const theme of BRIEFING_THEMES) {
      const email = buildStoredBriefingEmail({
        language: "en",
        theme,
        scheduledFor: "2026-07-12T02:30:00Z",
        timezone: "Asia/Kolkata",
        subscriberName: "Visual QA Reader",
        manageUrl: "https://bulletin.example/access/manage?r=00000000-0000-4000-8000-000000000001&v=1&e=1999999999&s=visual-qa-signature",
        stories: [
          { position: 1, category: "technology-ai", headline: "India opens a shared AI research platform", summary: "A verified public research platform has opened to participating institutions. The first release provides shared compute and evaluated datasets. Access begins with a bounded group of public-interest projects.", whyItMatters: "Shared infrastructure can widen access to expensive research capacity.", isUpdate: true, sources: [{ name: "Public Science Desk", url: "https://publisher.example/ai" }] },
          { position: 2, category: "climate", headline: "Cities publish a common heat-response protocol", summary: "Participating cities published a common protocol for high-heat days. It defines public warnings, cooling access and health escalation steps. Local agencies retain responsibility for activation.", whyItMatters: "A shared protocol makes local emergency action easier to compare and improve.", isUpdate: false, sources: [{ name: "Climate Reporter", url: "https://climate.example/original" }] },
        ],
      });
      await writeFile(path.join(output, `${theme}.html`), email.html, "utf8");
    }
    expect(BRIEFING_THEMES).toHaveLength(4);
  });
});
