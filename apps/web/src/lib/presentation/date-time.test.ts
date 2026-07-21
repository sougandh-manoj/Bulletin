import { describe, expect, it } from "vitest";

import { formatDeliveryDateTime } from "./date-time";

describe("delivery date presentation", () => {
  it("uses deterministic punctuation and a subscriber timezone", () => {
    expect(formatDeliveryDateTime("2026-07-15T02:30:00.000Z", "Asia/Kolkata"))
      .toBe("Wednesday, 15 July 2026 at 8:00 am");
  });

  it("fails closed to the original value", () => {
    expect(formatDeliveryDateTime("not-a-date", "Asia/Kolkata")).toBe("not-a-date");
    expect(formatDeliveryDateTime("2026-07-15T02:30:00.000Z", "Not/A-Timezone"))
      .toBe("2026-07-15T02:30:00.000Z");
  });
});
