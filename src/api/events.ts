/** 汎用イベント種別。v1.5 以降の離散イベントを統一管理する。 */
export type EventKind =
  | "safe_mode_toggle"
  | "nottodo_purge"
  | "violation";

export type EventLlmState = {
  status: "queued" | "pending" | "done" | "failed";
  data: {
    trigger: string;
    category: string;
    impact: string[];
  } | null;
};

export type EventEntry = {
  id: number;
  timestamp: string;
  kind: EventKind;
  payload: Record<string, unknown> & {
    note?: string;
    llm?: EventLlmState;
  };
};

export type EventCreatePayload = {
  kind: EventKind;
  payload?: Record<string, unknown>;
  timestamp: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export async function createEvent(
  payload: EventCreatePayload
): Promise<EventEntry> {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/events failed: ${res.status}`);
  return res.json();
}

export async function fetchEvents(
  opts?: { kind?: EventKind; days?: number }
): Promise<EventEntry[]> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.days != null) params.set("days", String(opts.days));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/events${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`GET /api/events failed: ${res.status}`);
  return res.json();
}

export async function countEvents(
  kind: EventKind,
  days = 1
): Promise<number> {
  const res = await fetch(
    `${API_BASE}/api/events/count?kind=${kind}&days=${days}`
  );
  if (!res.ok) throw new Error(`GET /api/events/count failed: ${res.status}`);
  const data = (await res.json()) as { count: number };
  return data.count;
}
