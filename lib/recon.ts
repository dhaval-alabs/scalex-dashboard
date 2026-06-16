// lib/recon.ts — ScaleX Recon MCP client (browser-side fetch)

export const RECON_MCP_URL = "https://scalex-recon-mcp.vercel.app/api/mcp";

export async function callReconMCP(tool: string, args: Record<string, unknown> = {}) {
  const resp = await fetch(RECON_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!resp.ok) throw new Error("Recon MCP error " + resp.status);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || "Recon MCP returned error");
  const text = json.result?.content?.[0]?.text;
  if (!text) throw new Error("Recon MCP returned no content");
  try { return JSON.parse(text); } catch { return text; }
}

export const RECON_TOOLS = [
  "get_relay_health",
  "reconcile_relay_vs_gads",
  "get_coverage_by_source",
  "get_signal_quality_trend",
  "verify_batch_landed",
] as const;
