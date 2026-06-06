export type LogParams = {
  cognitive_load: number;
  physical_energy: number;
  mental_energy: number;
  autonomy: number;
  entropy: number;
};

export type LogEntry = {
  id: number;
  timestamp: string;
  note: string;
  params: LogParams;
};

export type LogCreatePayload = {
  params: LogParams;
  note: string;
  timestamp: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export async function createLog(payload: LogCreatePayload): Promise<LogEntry> {
  const res = await fetch(`${API_BASE}/api/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/logs failed: ${res.status}`);
  return res.json();
}

export async function fetchLogs(days?: number): Promise<LogEntry[]> {
  const qs = days != null ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/api/logs${qs}`);
  if (!res.ok) throw new Error(`GET /api/logs failed: ${res.status}`);
  return res.json();
}
