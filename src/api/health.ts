const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

/** /api/health が200を返すか。タイムアウト900msでポーリング間隔(1s)内に収める。 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    return res.ok;
  } catch {
    return false;
  }
}
