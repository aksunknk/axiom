import type { LogParams } from "./logs";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

const RATIONALE_TIMEOUT_MS = 35_000;
const PING_TIMEOUT_MS = 8_000;

export type SafeModeRationaleResult = {
  rationale: string | null;
};

export type LLMPingResult = {
  status: "ok" | "unavailable";
  model: string | null;
  latency_ms: number | null;
  detail: string | null;
};

/** Mimi 心拍: /api/llm/ping。失敗時 status=unavailable。 */
export async function pingLLM(): Promise<LLMPingResult> {
  try {
    const res = await fetch(`${API_BASE}/api/llm/ping`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { status: "unavailable", model: null, latency_ms: null, detail: `http_${res.status}` };
    }
    const data = (await res.json()) as LLMPingResult;
    return {
      status: data.status === "ok" ? "ok" : "unavailable",
      model: data.model ?? null,
      latency_ms: data.latency_ms ?? null,
      detail: data.detail ?? null,
    };
  } catch {
    return { status: "unavailable", model: null, latency_ms: null, detail: "fetch_failed" };
  }
}

/** Nana: Safe Mode 正当化テキストを非同期取得。失敗時 rationale=null。 */
export async function fetchSafeModeRationale(
  params: LogParams
): Promise<SafeModeRationaleResult> {
  try {
    const res = await fetch(`${API_BASE}/api/llm/safe-mode-rationale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
      signal: AbortSignal.timeout(RATIONALE_TIMEOUT_MS),
    });
    if (!res.ok) return { rationale: null };
    return (await res.json()) as SafeModeRationaleResult;
  } catch {
    return { rationale: null };
  }
}
