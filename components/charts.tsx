"use client";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const AXIS = { fontSize: 11, fill: "var(--text4)" };
const GRID = "var(--chart-grid)";

function cssVar(name: string) {
  if (typeof window === "undefined") return "#14B8A6";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#14B8A6";
}

const tooltipStyle = {
  background: "var(--surface)", border: "1px solid var(--border2)",
  borderRadius: 8, fontSize: 12, color: "var(--text)",
};

export function LineTrend({ data, xKey, yKey, color = "var(--teal)", height = 260 }:
  { data: any[]; xKey: string; yKey: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaTrend({ data, xKey, yKey, color = "var(--teal)", height = 260 }:
  { data: any[]; xKey: string; yKey: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <defs>
          <linearGradient id={"g-" + yKey} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#g-${yKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarSeries({ data, xKey, yKey, color = "var(--teal)", height = 260, horizontal = false }:
  { data: any[]; xKey: string; yKey: string; color?: string; height?: number; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 40 : -8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface2)" }} />
        <Bar dataKey={yKey} fill={color} radius={3} />
      </BarChart>
    </ResponsiveContainer>
  );
}
