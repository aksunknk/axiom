import { apiFetch, API_BASE } from "./http";

/** /api/health が200を返すか。タイムアウト900msでポーリング間隔(1s)内に収める。 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    return res.ok;
  } catch {
    return false;
  }
}
