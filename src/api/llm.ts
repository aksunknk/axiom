import type { LogParams } from "./logs";
import { apiFetch, API_BASE } from "./http";

const RATIONALE_TIMEOUT_MS = 35_000;
const ENRICH_BATCH_TIMEOUT_MS = 600_000;

export type SafeModeRationaleRequest = {
  params: LogParams;
  integrity?: number;
  integrity_delta?: number;
  diagnosis?: string;
};

export type SafeModeRationaleResult = {
  rationale: string | null;
};

export type EnrichQueueResult = {
  count: number;
};

export type EnrichBatchResult = {
  queued_before: number;
  processed: number;
  done: number;
  requeued: number;
};

/** バッチエンリッチ待ち件数（直近7日）。 */
export async function fetchEnrichQueueCount(days = 7): Promise<EnrichQueueResult> {
  try {
    const res = await apiFetch(`${API_BASE}/api/llm/enrich-queue?days=${days}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { count: 0 };
    return (await res.json()) as EnrichQueueResult;
  } catch {
    return { count: 0 };
  }
}

/** キュー済み note を Mimi で一括エンリッチ（手動トリガー）。 */
export async function runEnrichBatch(days = 7): Promise<EnrichBatchResult | null> {
  try {
    const res = await apiFetch(`${API_BASE}/api/llm/enrich-batch?days=${days}`, {
      method: "POST",
      signal: AbortSignal.timeout(ENRICH_BATCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as EnrichBatchResult;
  } catch {
    return null;
  }
}

/** Nana: Safe Mode 正当化 + 最初の一手を非同期取得。失敗時 rationale=null。 */
export async function fetchSafeModeRationale(
  body: SafeModeRationaleRequest
): Promise<SafeModeRationaleResult> {
  try {
    const res = await apiFetch(`${API_BASE}/api/llm/safe-mode-rationale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RATIONALE_TIMEOUT_MS),
    });
    if (!res.ok) return { rationale: null };
    return (await res.json()) as SafeModeRationaleResult;
  } catch {
    return { rationale: null };
  }
}
