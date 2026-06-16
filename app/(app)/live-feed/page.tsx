"use client";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { filterByPeriod, parseTs } from "@/lib/sheets";
import { PageHeader, Card } from "@/components/ui";

export default function LiveFeedPage() {
  const { range, relayRows, loading } = useApp();
  const rows = useMemo(() => {
    const f = filterByPeriod(relayRows, range);
    return [...f].sort((a, b) => {
      const da = parseTs(a.timestamp)?.getTime() || 0, db = parseTs(b.timestamp)?.getTime() || 0;
      return db - da;
    }).slice(0, 100);
  }, [relayRows, range]);

  function statusBadge(s: string) {
    if (s === "SUCCESS") return "green";
    if (s === "SUCCESS_EC_ONLY") return "teal";
    if (s.includes("FAIL")) return "coral";
    return "amber";
  }

  return (
    <>
      <PageHeader title="Live Feed" sub="Most recent relay events (latest 100 in range)" />
      <Card loading={loading}>
        <table className="tbl">
          <thead><tr><th>Time</th><th>Status</th><th>Stage</th><th>Value</th><th>GCLID</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "var(--mono)", fontSize: "0.72rem" }}>{r.timestamp}</td>
                <td><span className={"badge " + statusBadge(r.status)}>{r.status}</span></td>
                <td>{r.oldStage ? r.oldStage + " → " : ""}{r.newStage}</td>
                <td className="num">{r.value ? "₹" + r.value : "—"}</td>
                <td>{r.gclid && r.gclid !== "-" ? "✓" : r.status === "SUCCESS_EC_ONLY" ? "EC" : "—"}</td>
                <td>{r.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-msg">No events in range</div>}
      </Card>
    </>
  );
}
