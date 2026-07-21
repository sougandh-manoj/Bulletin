import type { Metadata } from "next";

import { OwnerAccessForm } from "./access-form";

export const metadata: Metadata = {
  title: "Owner access",
  robots: { index: false, follow: false, nocache: true },
};

export default function OwnerAccessPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f6f3ec", color: "#15191d", padding: "72px 20px" }}>
      <section style={{ maxWidth: 480, margin: "0 auto", padding: 32, background: "#fcfaf5", border: "1px solid #d8d4cb" }}>
        <p style={{ color: "#315f91", letterSpacing: 2, textTransform: "uppercase", fontSize: 12, fontWeight: 800 }}>Private operations</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, margin: "12px 0" }}>Bulletin owner access</h1>
        <p style={{ color: "#5e6267", lineHeight: 1.6 }}>This route is not linked publicly. Access requires the allowlisted owner inbox and a one-time link.</p>
        <OwnerAccessForm />
      </section>
    </main>
  );
}
