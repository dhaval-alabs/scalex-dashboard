"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchRelayData, RelayRow, BatchRow, PpcRow } from "@/lib/sheets";
import { fetchGadsStats, GadsStats } from "@/lib/gads";

export type RangeValue = "today" | "yesterday" | "7" | "30" | "90" | "this_month" | "last_month";

export const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month (complete)" },
];

// Rolling windows decline over time even on a healthy pipeline: new days add
// close to nothing while mature days drop off the back. Anything reading a
// rolling window as a trend will see a false decline. Fixed windows
// (this_month / last_month) are the ones to compare period over period.
export function rangeFootnote(v: RangeValue): string | null {
  if (v === "90") {
    return "Rolling 90 days. This window declines over time even when the pipeline is healthy — " +
           "new days contribute almost nothing yet while mature days fall off the back. " +
           "Use 'Last month (complete)' for period-over-period comparison.";
  }
  if (v === "this_month") {
    return "Month to date — an incomplete period. Not comparable with a full month.";
  }
  return null;
}

export function rangeLabel(v: RangeValue): string {
  const now = new Date();
  const end = now.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (v === "today") return "Today · " + end;
  if (v === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return "Yesterday · " + y.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  if (v === "this_month") return "This month · " + now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (v === "last_month") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return "Last month · " + lm.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const d = parseInt(v);
  const start = new Date(now); start.setDate(start.getDate() - d);
  return `Last ${d} days · ${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end}`;
}

// days value for GAds API (today=1, yesterday=2, this_month≈30)
function rangeToDays(v: RangeValue): number {
  if (v === "today") return 1;
  if (v === "yesterday") return 2;
  if (v === "this_month") return new Date().getDate();
  if (v === "last_month") {
    // Days elapsed since the 1st of last month, so the GAds pull covers it.
    const now = new Date();
    const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return Math.ceil((now.getTime() - firstOfLast.getTime()) / 864e5);
  }
  return parseInt(v);
}

interface AppState {
  range: RangeValue;
  setRange: (r: RangeValue) => void;
  rangeLabel: string;
  rangeFootnote: string | null;
  theme: "light" | "dark";
  toggleTheme: () => void;
  relayRows: RelayRow[];
  batchRows: BatchRow[];   // day-5 sweeps — was never fetched before
  ppcRows: PpcRow[];       // PPC submission sheet — the CPL denominator
  ppcError: string | null;
  gads: GadsStats | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string;
  refresh: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<RangeValue>("30");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [relayRows, setRelayRows] = useState<RelayRow[]>([]);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [ppcRows, setPpcRows] = useState<PpcRow[]>([]);
  const [ppcError, setPpcError] = useState<string | null>(null);
  const [gads, setGads] = useState<GadsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  // theme init + persistence
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("scalex-theme")) as "light" | "dark" | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("scalex-theme", theme); } catch {}
  }, [theme]);

  const loadGads = useCallback(async (r: RangeValue) => {
    try {
      const g = await fetchGadsStats(rangeToDays(r));
      setGads(g);
    } catch (e: any) {
      console.error("GAds load failed", e);
    }
  }, []);

  const loadAll = useCallback(async (r: RangeValue) => {
    setLoading(true); setError(null);
    try {
      const [relay] = await Promise.allSettled([fetchRelayData(), loadGads(r)]);
      if (relay.status === "fulfilled") {
        setRelayRows(relay.value.rows);
        setBatchRows(relay.value.batch);
        setPpcRows(relay.value.ppc);
        setPpcError(relay.value.ppcError);
      } else {
        // Surface it. The old published-CSV path returned a sign-in page that
        // parsed into garbage rows, so a broken data path looked like an empty
        // dashboard instead of a fault.
        setError((relay.reason as any)?.message || "Relay data load failed");
      }
      setLastUpdated(new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
    } catch (e: any) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, [loadGads]);

  useEffect(() => { loadAll(range); /* eslint-disable-next-line */ }, []);

  // When range changes, re-fetch GAds (sheet rows are client-filtered, no re-fetch needed)
  const onSetRange = useCallback((r: RangeValue) => {
    setRange(r);
    loadGads(r);
    setLastUpdated(new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
  }, [loadGads]);

  return (
    <Ctx.Provider value={{
      range, setRange: onSetRange, rangeLabel: rangeLabel(range), rangeFootnote: rangeFootnote(range),
      theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      relayRows, batchRows, ppcRows, ppcError, gads, loading, error, lastUpdated,
      refresh: () => loadAll(range),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
}
