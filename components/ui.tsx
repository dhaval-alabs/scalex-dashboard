"use client";
import { useApp } from "@/context/AppContext";

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  const { lastUpdated, refresh, loading } = useApp();
  return (
    <div className="page-head">
      <div>
        <div className="page-title">{title}</div>
        {sub && <div className="page-sub">{sub}</div>}
        {lastUpdated && <div className="card-date">Last updated: {lastUpdated}</div>}
      </div>
      <div className="page-actions">
        {children}
        <button className="btn" onClick={refresh} disabled={loading}>↻ Refresh</button>
      </div>
    </div>
  );
}

export function Card({ title, sub, dateLabel, fixedLabel, loading, children }:
  { title?: string; sub?: string; dateLabel?: string; fixedLabel?: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className={"card" + (loading ? " shimmer" : "")}>
      {(title || sub) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {sub && <div className="card-sub">{sub}</div>}
          {dateLabel && <div className="card-date">{dateLabel}</div>}
          {fixedLabel && <div className="card-date fixed">{fixedLabel}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({ label, value, foot, accent }: { label: string; value: React.ReactNode; foot?: string; accent?: string }) {
  return (
    <div className="kpi" style={accent ? ({ ["--accent" as any]: accent }) : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
