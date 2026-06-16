"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp, RANGE_OPTIONS, RangeValue } from "@/context/AppContext";

const NAV = [
  { group: "Overview", links: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/ask-ai", label: "Ask AI" },
  ]},
  { group: "Intelligence", links: [
    { href: "/ec-recovery", label: "EC Recovery" },
    { href: "/cpl-trend", label: "CPL Trend" },
    { href: "/reconciliation", label: "Signal Reconciliation" },
    { href: "/smart-bidding", label: "Smart Bidding" },
    { href: "/campaigns", label: "Campaigns" },
  ]},
  { group: "Live", links: [
    { href: "/live-feed", label: "Live Feed" },
    { href: "/funnel", label: "Funnel Analysis" },
  ]},
  { group: "System", links: [
    { href: "/pixel-health", label: "Pixel Health" },
  ]},
];

const ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  "/ask-ai": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  "/ec-recovery": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  "/cpl-trend": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  "/reconciliation": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  "/smart-bidding": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  "/campaigns": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  "/live-feed": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  "/funnel": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>,
  "/pixel-health": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ico"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { range, setRange, rangeLabel, theme, toggleTheme } = useApp();

  return (
    <aside className="sidebar">
      {/* Brand — Scaletrix logo */}
      <div className="brand" style={{ marginBottom: "0.15rem" }}>
        <img
          src="https://scaletrix.ai/wp-content/uploads/2025/04/logo-3.webp"
          alt="Scaletrix.AI"
          style={{ height: "22px", width: "auto", display: "block" }}
          onError={(e) => {
            // fallback to icon if logo fails to load
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = "none";
            const fallback = el.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        {/* Fallback icon (hidden by default) */}
        <div className="brand-logo" style={{ display: "none" }}>S</div>
      </div>
      <div className="brand-sub">AnalytixLabs · Workbench</div>

      {/* Global range selector */}
      <div className="range-box">
        <label>Date Range</label>
        <select value={range} onChange={(e) => setRange(e.target.value as RangeValue)}>
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="range-label">{rangeLabel}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <div className="nav-group-title">{g.group}</div>
            {g.links.map((l) => (
              <Link key={l.href} href={l.href} className={"nav-link" + (pathname === l.href ? " active" : "")}>
                {ICONS[l.href]}
                {l.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="nav-group">
          <div className="nav-link" onClick={toggleTheme} style={{ cursor: "pointer" }}>
            <span style={{ marginRight: "0.55rem" }}>{theme === "dark" ? "☀" : "☾"}</span>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </div>
          <div className="nav-link" onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
          }} style={{ cursor: "pointer" }}>
            <span style={{ marginRight: "0.55rem" }}>⏻</span>
            Sign out
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="live-badge">
          <div className="live-dot"></div>
          <span>Live feed sync active</span>
        </div>
      </div>
    </aside>
  );
}
