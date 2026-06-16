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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { range, setRange, rangeLabel, theme, toggleTheme } = useApp();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">S</div>
        <div className="brand-name">ScaleX</div>
      </div>
      <div className="brand-sub">AnalytixLabs · Workbench</div>

      <div className="range-box">
        <label>Date Range</label>
        <select value={range} onChange={(e) => setRange(e.target.value as RangeValue)}>
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="range-label">{rangeLabel}</div>
      </div>

      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-group-title">{g.group}</div>
          {g.links.map((l) => (
            <Link key={l.href} href={l.href} className={"nav-link" + (pathname === l.href ? " active" : "")}>
              {l.label}
            </Link>
          ))}
        </div>
      ))}

      <div className="nav-group">
        <div className="nav-link" onClick={toggleTheme}>
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </div>
        <div className="nav-link" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}>
          ⏻ Sign out
        </div>
      </div>
    </aside>
  );
}
