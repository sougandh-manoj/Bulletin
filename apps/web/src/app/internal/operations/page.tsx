import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadOwnerOperationsDashboard } from "@/data/operations";
import { getAuthenticatedOwner } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Owner operations",
  robots: { index: false, follow: false, nocache: true },
};

const panel = { background: "#fcfaf5", border: "1px solid #d8d4cb", padding: 24 } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 } as const;

function ControlForm(props: {
  csrf: string;
  control: string;
  storedValue: boolean;
  checked: boolean;
  label: string;
}) {
  return (
    <form action="/api/internal/owner/action" method="post" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, minHeight: 58, padding: "10px 0", borderBottom: "1px solid #e2ded5" }}>
      <input type="hidden" name="csrf" value={props.csrf} />
      <input type="hidden" name="action" value="control" />
      <input type="hidden" name="control" value={props.control} />
      <input type="hidden" name="enabled" value={String(!props.storedValue)} />
      <span style={{ fontSize: 16, fontWeight: 650 }}>{props.label}</span>
      <button
        type="submit"
        role="switch"
        aria-checked={props.checked}
        aria-label={`${props.label}: ${props.checked ? "active" : "paused"}`}
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: 50,
          height: 29,
          padding: 3,
          border: `1px solid ${props.checked ? "#315f91" : "#aaa69d"}`,
          borderRadius: 999,
          background: props.checked ? "#315f91" : "#d9d5cc",
          cursor: "pointer",
          boxShadow: "inset 0 1px 2px rgba(21,25,29,.12)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: 21,
            height: 21,
            borderRadius: "50%",
            background: "#fffdf8",
            transform: `translateX(${props.checked ? 21 : 0}px)`,
            transition: "transform 160ms ease",
            boxShadow: "0 1px 4px rgba(21,25,29,.28)",
          }}
        />
      </button>
    </form>
  );
}

export default async function OwnerOperationsPage() {
  const owner = await getAuthenticatedOwner();
  if (!owner) redirect("/internal/access");
  const dashboard = await loadOwnerOperationsDashboard();
  const controls = dashboard.controls as Record<string, boolean>;
  const now = Date.parse(dashboard.observedAt);
  return (
    <main style={{ minHeight: "100vh", background: "#f6f3ec", color: "#15191d", padding: "38px 20px 70px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 22 }}>
        <header>
          <p style={{ color: "#315f91", letterSpacing: 2, textTransform: "uppercase", fontSize: 12, fontWeight: 800 }}>Owner only · no subscriber impersonation</p>
          <h1 style={{ margin: "8px 0", font: "500 42px/1.1 Georgia,serif" }}>Bulletin operations</h1>
          <p style={{ color: "#5e6267" }}>Non-PII delivery health, worker recovery, source intelligence, alerts, and encrypted backup proof.</p>
        </header>

        <section style={grid} aria-label="Operational counts">
          <article style={panel}><h2>Subscribers</h2><p>{dashboard.counts.subscribers.total} total · {dashboard.counts.subscribers.active} active · {dashboard.counts.subscribers.paused} paused · {dashboard.counts.subscribers.pending} pending</p></article>
          <article style={panel}><h2>Deliveries</h2><p>{dashboard.counts.deliveries.pending} pending · {dashboard.counts.deliveries.retrying} retrying · {dashboard.counts.deliveries.failed} failed · {dashboard.counts.deliveries.sent} sent</p></article>
          <article style={panel}><h2>Source & intelligence</h2><p>{dashboard.counts.intelligence.failingSources} failing sources · {dashboard.counts.intelligence.failedSummaries} failed summaries</p></article>
          <article style={panel}><h2>Backups</h2><p>{dashboard.backups[0] ? `${dashboard.backups[0].status} · ${new Date(dashboard.backups[0].started_at).toLocaleString("en-IN")}` : "No backup run recorded"}</p></article>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Global controls</h2>
          <ControlForm csrf={owner.csrfToken} control="email-delivery-enabled" storedValue={Boolean(controls.email_delivery_enabled)} checked={Boolean(controls.email_delivery_enabled)} label="Email delivery" />
          <ControlForm csrf={owner.csrfToken} control="delivery-worker-paused" storedValue={Boolean(controls.delivery_worker_paused)} checked={!Boolean(controls.delivery_worker_paused)} label="Delivery worker" />
          <ControlForm csrf={owner.csrfToken} control="personalization-worker-paused" storedValue={Boolean(controls.personalization_worker_paused)} checked={!Boolean(controls.personalization_worker_paused)} label="Personalization worker" />
          <ControlForm csrf={owner.csrfToken} control="ingestion-worker-paused" storedValue={Boolean(controls.ingestion_worker_paused)} checked={!Boolean(controls.ingestion_worker_paused)} label="Ingestion worker" />
          <ControlForm csrf={owner.csrfToken} control="intelligence-worker-paused" storedValue={Boolean(controls.intelligence_worker_paused)} checked={!Boolean(controls.intelligence_worker_paused)} label="Intelligence worker" />
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Worker health</h2>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">Worker</th><th align="left">Last complete</th><th align="left">State</th><th align="left">Last error</th></tr></thead><tbody>
            {dashboard.heartbeats.map((worker) => {
              const completed = worker.last_completed_at ? new Date(worker.last_completed_at).getTime() : 0;
              const stalled = !completed || now - completed > 15 * 60_000;
              return <tr key={worker.worker_name}><td style={{ padding: "10px 0" }}>{worker.worker_name}</td><td>{worker.last_completed_at ? new Date(worker.last_completed_at).toLocaleString("en-IN") : "never"}</td><td style={{ color: stalled ? "#a13c2f" : "#27643b" }}>{stalled ? "stalled / overdue" : "healthy"}</td><td>{worker.last_error_code ?? "—"}</td></tr>;
            })}
          </tbody></table></div>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Recent deliveries</h2>
          <p style={{ color: "#5e6267" }}>Delivery identifiers and state only. Subscriber emails, names, preferences, and private management links are intentionally absent.</p>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th align="left">Delivery</th><th align="left">Scheduled</th><th align="left">Status</th><th align="left">Stories</th><th align="left">Failure</th><th align="left">Safe actions</th></tr></thead><tbody>
            {dashboard.deliveries.map((delivery) => {
              const cancellable = ["pending", "claimed", "rendering", "retry-wait"].includes(delivery.status);
              const retryable = delivery.status === "failed" && delivery.manual_retry_count === 0 && ["smtp-temporary-exhausted", "transient-infrastructure"].includes(delivery.failure_class ?? "");
              return <tr key={delivery.id} style={{ borderTop: "1px solid #e2ded5" }}><td style={{ padding: "12px 8px 12px 0", fontFamily: "monospace" }}>{delivery.id.slice(0, 8)}…</td><td>{new Date(delivery.scheduled_for).toLocaleString("en-IN")}</td><td>{delivery.status} / {delivery.personalization_status}</td><td>{delivery.actual_story_count ?? "—"}</td><td>{delivery.failure_code ?? "—"}</td><td style={{ display: "flex", gap: 6, padding: "8px 0" }}>
                {cancellable ? <form action="/api/internal/owner/action" method="post"><input type="hidden" name="csrf" value={owner.csrfToken}/><input type="hidden" name="action" value="cancel-delivery"/><input type="hidden" name="deliveryId" value={delivery.id}/><button type="submit">Cancel unsent</button></form> : null}
                {retryable ? <form action="/api/internal/owner/action" method="post"><input type="hidden" name="csrf" value={owner.csrfToken}/><input type="hidden" name="action" value="retry-delivery"/><input type="hidden" name="deliveryId" value={delivery.id}/><button type="submit">Retry once</button></form> : null}
              </td></tr>;
            })}
          </tbody></table></div>
        </section>

        <section style={grid}>
          <article style={panel}><h2 style={{ marginTop: 0 }}>Alerts</h2>{dashboard.alerts.length ? dashboard.alerts.map((alert) => <p key={alert.id}><strong>{alert.severity.toUpperCase()}</strong> · {alert.title}<br/><small>{alert.occurrence_count} occurrence(s), last {new Date(alert.last_seen_at).toLocaleString("en-IN")}</small></p>) : <p>No active alert history.</p>}</article>
          <article style={panel}><h2 style={{ marginTop: 0 }}>Backup & restore proof</h2>{dashboard.backups.length ? dashboard.backups.map((backup) => <p key={backup.id}><strong>{backup.status}</strong> · {backup.storage_adapter}<br/><small>{backup.encrypted ? "encrypted" : "not encrypted"} · restore {backup.restore_verified_at ? `verified ${new Date(backup.restore_verified_at).toLocaleString("en-IN")}` : "not yet verified"}</small></p>) : <p>No backup status recorded.</p>}</article>
        </section>
      </div>
    </main>
  );
}
