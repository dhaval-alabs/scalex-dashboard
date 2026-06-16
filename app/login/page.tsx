"use client";
import { useState } from "react";

export default function LoginPage() {
  const [stage, setStage] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/request-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setPendingToken(d.pendingToken); setStage("otp");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verifyOtp() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp, pendingToken }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      window.location.href = d.redirect || "/dashboard";
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="card" style={{ width: 360, maxWidth: "90vw" }}>
        <div className="brand" style={{ marginBottom: "0.5rem" }}>
          <div className="brand-logo">S</div><div className="brand-name">ScaleX Workbench</div>
        </div>
        <div className="page-sub" style={{ marginBottom: "1.25rem" }}>AnalytixLabs · sign in to continue</div>
        {stage === "email" ? (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" onKeyDown={(e) => e.key === "Enter" && requestOtp()}
              style={{ width: "100%", padding: "0.7rem", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "var(--radius3)", color: "var(--text)", marginBottom: "0.75rem", fontFamily: "var(--font)" }} />
            <button className="btn" style={{ width: "100%", background: "var(--teal)", color: "#fff", border: "none", padding: "0.7rem", justifyContent: "center" }} onClick={requestOtp} disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </>
        ) : (
          <>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
              style={{ width: "100%", padding: "0.7rem", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: "var(--radius3)", color: "var(--text)", marginBottom: "0.75rem", fontFamily: "var(--mono)", letterSpacing: "0.2em", textAlign: "center" }} />
            <button className="btn" style={{ width: "100%", background: "var(--teal)", color: "#fff", border: "none", padding: "0.7rem", justifyContent: "center" }} onClick={verifyOtp} disabled={busy}>{busy ? "Verifying…" : "Verify & sign in"}</button>
          </>
        )}
        {err && <div style={{ color: "var(--coral)", fontSize: "0.78rem", marginTop: "0.75rem" }}>{err}</div>}
      </div>
    </div>
  );
}
