import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchEnrichQueueCount, runEnrichBatch } from "../api/llm";
import { fetchEvents, type EventEntry, type EventKind, type EventLlmState } from "../api/events";
import { fetchLogs, type EnrichmentData, type LogEntry, type LogParams } from "../api/logs";
import { isMetricAbnormal } from "../utils/thresholds";
import CorrelationScatter from "./CorrelationScatter";

const UNIFIED_LOG_LIMIT = 10;

const QUEUED_STATUSES = new Set(["queued", "pending", "failed"]);

type HistoryPanelProps = {
  apiReady?: boolean;
};

type MetricKey =
  | "cognitive_load"
  | "physical_energy"
  | "mental_energy"
  | "autonomy"
  | "entropy";

type VisibleMetrics = Record<MetricKey, boolean>;

const SERIES: {
  key: MetricKey;
  legend: string;
  short: string;
  color: string;
}[] = [
  { key: "cognitive_load", legend: "COGNITIVE_LOAD", short: "COG", color: "#22c55e" },
  { key: "physical_energy", legend: "PHYSICAL_ENERGY", short: "PHY", color: "#4ade80" },
  { key: "mental_energy", legend: "MENTAL_ENERGY", short: "MEN", color: "#86efac" },
  { key: "autonomy", legend: "AUTONOMY", short: "AUT", color: "#16a34a" },
  { key: "entropy", legend: "ENTROPY", short: "ENT", color: "#15803d" },
];

const DEFAULT_VISIBLE: VisibleMetrics = {
  cognitive_load: false,
  physical_energy: false,
  mental_energy: false,
  autonomy: true,
  entropy: false,
};

function formatAxisTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatListTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** RECENT LOG の表示順とラベル。閾値超過時は数値のみアンバー表示。 */
const RECENT_LOG_FIELDS: { key: keyof LogParams; label: string }[] = [
  { key: "autonomy", label: "AUT" },
  { key: "cognitive_load", label: "COG" },
  { key: "physical_energy", label: "PHY" },
  { key: "mental_energy", label: "MEN" },
  { key: "entropy", label: "ENT" },
];

type UnifiedEntry =
  | { type: "log"; id: number; timestamp: string; log: LogEntry }
  | { type: "event"; id: number; timestamp: string; event: EventEntry };

function mergeUnifiedEntries(
  logs: LogEntry[],
  events: EventEntry[]
): UnifiedEntry[] {
  const merged: UnifiedEntry[] = [
    ...logs.map((log) => ({
      type: "log" as const,
      id: log.id,
      timestamp: log.timestamp,
      log,
    })),
    ...events.map((event) => ({
      type: "event" as const,
      id: event.id,
      timestamp: event.timestamp,
      event,
    })),
  ];
  return merged
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, UNIFIED_LOG_LIMIT);
}

function eventLabel(kind: EventKind): string {
  switch (kind) {
    case "nottodo_purge":
      return "NOT-TO-DO PURGED";
    case "safe_mode_toggle":
      return "SAFE_MODE_TOGGLED";
    case "violation":
      return "VIOLATION";
  }
}

function formatLlmTag(data: EnrichmentData): string {
  return `// LLM_TAG: [${data.category}] trigger: ${data.trigger}`;
}

function isQueuedLog(log: LogEntry): boolean {
  const status = log.enrichment?.status;
  return Boolean(log.note.trim() && status && QUEUED_STATUSES.has(status));
}

function isQueuedEvent(event: EventEntry): boolean {
  const note =
    typeof event.payload.note === "string" ? event.payload.note.trim() : "";
  if (!note) return false;
  const llm = event.payload.llm as EventLlmState | undefined;
  if (!llm) return event.kind === "nottodo_purge";
  return QUEUED_STATUSES.has(llm.status);
}

function LlmTagLine({ data }: { data: EnrichmentData }) {
  return (
    <p className="pl-4 font-mono text-xs text-gray-500">{formatLlmTag(data)}</p>
  );
}

function UnifiedLogLine({ entry }: { entry: UnifiedEntry }) {
  const time = formatListTime(entry.timestamp);

  if (entry.type === "log") {
    const log = entry.log;
    const enrichData =
      log.enrichment?.status === "done" ? log.enrichment.data : null;
    const showQueued = isQueuedLog(log);

    return (
      <li>
        <p className="font-mono text-xs tabular-nums text-green-500">
          {`> [${time}] `}
          {RECENT_LOG_FIELDS.map((f, i) => {
            const value = log.params[f.key];
            return (
              <span key={f.key}>
                {f.label}
                {": "}
                <span
                  className={
                    isMetricAbnormal(f.key, value) ? "text-yellow-500" : undefined
                  }
                >
                  {pad3(value)}
                </span>
                {i < RECENT_LOG_FIELDS.length - 1 && " | "}
              </span>
            );
          })}
          {log.note.trim() && (
            <span className="text-green-800">{` // ${log.note.trim()}`}</span>
          )}
        </p>
        {showQueued && (
          <p className="pl-4 font-mono text-xs text-gray-600">// LLM: QUEUED</p>
        )}
        {enrichData && <LlmTagLine data={enrichData} />}
      </li>
    );
  }

  const { event } = entry;
  const note =
    typeof event.payload.note === "string" ? event.payload.note.trim() : "";
  const llm = event.payload.llm as EventLlmState | undefined;
  const enrichData = llm?.status === "done" ? llm.data : null;
  const showQueued = isQueuedEvent(event);

  return (
    <li>
      <p className="font-mono text-xs tabular-nums text-green-500">
        {`> [${time}] `}
        <span className="text-yellow-500">[*EVENT*]</span>
        {` ${eventLabel(event.kind)}`}
        {note && <span className="text-green-800">{` // ${note}`}</span>}
      </p>
      {showQueued && (
        <p className="pl-4 font-mono text-xs text-gray-600">// LLM: QUEUED</p>
      )}
      {enrichData && <LlmTagLine data={enrichData} />}
    </li>
  );
}

function logsToCsv(logs: LogEntry[]): string {
  const header =
    "id,timestamp,note,cognitive_load,physical_energy,mental_energy,autonomy,entropy";
  const rows = logs.map((l) =>
    [
      l.id,
      l.timestamp,
      `"${l.note.replace(/"/g, '""')}"`,
      l.params.cognitive_load,
      l.params.physical_energy,
      l.params.mental_energy,
      l.params.autonomy,
      l.params.entropy,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export default function HistoryPanel({ apiReady = false }: HistoryPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [status, setStatus] = useState("> loading...");
  const [queueCount, setQueueCount] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [visibleMetrics, setVisibleMetrics] =
    useState<VisibleMetrics>(DEFAULT_VISIBLE);

  const refreshQueueCount = useCallback(async () => {
    if (!apiReady) {
      setQueueCount(0);
      return;
    }
    setQueueCount((await fetchEnrichQueueCount(7)).count);
  }, [apiReady]);

  const load = useCallback(async () => {
    try {
      const [logData, eventData] = await Promise.all([
        fetchLogs(7),
        fetchEvents({ days: 7 }),
      ]);
      setLogs(logData);
      setEvents(eventData);
      setStatus(
        `> loaded logs=${logData.length} events=${eventData.length} (7d)`
      );
      await refreshQueueCount();
    } catch {
      setStatus("> [ERROR] API UNREACHABLE");
    }
  }, [refreshQueueCount]);

  useEffect(() => {
    load();
  }, [load]);

  const runEnrich = async () => {
    if (!apiReady || enriching) return;
    setEnriching(true);
    setStatus("> [SYSTEM] MIMI BATCH ENRICH IN PROGRESS...");
    const result = await runEnrichBatch(7);
    if (!result) {
      setStatus("> [ERROR] ENRICH BATCH FAILED (LM STUDIO?)");
    } else {
      setStatus(
        `> enrich: done=${result.done} requeued=${result.requeued} / ${result.processed}`
      );
    }
    setEnriching(false);
    await load();
  };

  const chartData = useMemo(
    () =>
      logs.map((l) => ({
        time: formatAxisTime(l.timestamp),
        cognitive_load: l.params.cognitive_load,
        physical_energy: l.params.physical_energy,
        mental_energy: l.params.mental_energy,
        autonomy: l.params.autonomy,
        entropy: l.params.entropy,
      })),
    [logs]
  );

  const unifiedLog = useMemo(
    () => mergeUnifiedEntries(logs, events),
    [logs, events]
  );

  const toggleMetric = (key: MetricKey) =>
    setVisibleMetrics((prev) => ({ ...prev, [key]: !prev[key] }));

  const exportCsv = async () => {
    try {
      const all = await fetchLogs();
      const blob = new Blob([logsToCsv(all)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axiom_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`> exported ${all.length} records`);
    } catch {
      setStatus("> [ERROR] EXPORT FAILED");
    }
  };

  return (
    <section className="mt-6 border border-green-500 p-4">
      <p className="text-green-700">{"// HISTORY / 直近7日間パラメータ推移"}</p>
      <p className="mt-1 text-green-800">{status}</p>

      <div className="mt-4 h-64 w-full border border-green-900 bg-black">
        {chartData.length === 0 ? (
          <p className="p-4 text-green-800">{"> no data"}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#14532d" strokeDasharray="1 1" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#22c55e", fontSize: 10, fontFamily: "monospace" }}
                stroke="#166534"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#22c55e", fontSize: 10, fontFamily: "monospace" }}
                stroke="#166534"
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{
                  backgroundColor: "#000",
                  border: "1px solid #22c55e",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#22c55e",
                }}
              />
              {SERIES.map((s) =>
                visibleMetrics[s.key] ? (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.short}
                    stroke={s.color}
                    dot={false}
                    strokeWidth={1}
                    isAnimationActive={false}
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* metric legend / toggle */}
      <div className="mt-2 flex flex-wrap gap-2">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggleMetric(s.key)}
            aria-pressed={visibleMetrics[s.key]}
            className={
              "border px-2 py-0.5 font-mono text-xs focus:outline-none " +
              (visibleMetrics[s.key]
                ? "border-green-500 bg-green-500 text-black"
                : "border-green-700 text-green-500 hover:bg-green-500 hover:text-black")
            }
          >
            [{s.legend}]
          </button>
        ))}
      </div>

      {/* unified log: logs + events */}
      <div className="mt-3 border border-green-900 bg-black px-2 py-2">
        <p className="text-green-700">
          {`// UNIFIED LOG / 直近${UNIFIED_LOG_LIMIT}件`}
        </p>
        {unifiedLog.length === 0 ? (
          <p className="mt-1 text-green-800">{"> no data"}</p>
        ) : (
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {unifiedLog.map((entry) => (
              <UnifiedLogLine
                key={`${entry.type}-${entry.id}`}
                entry={entry}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={load}
          className="border border-green-700 px-2 py-0.5 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [ REFRESH ]
        </button>
        <button
          onClick={runEnrich}
          disabled={!apiReady || enriching || queueCount === 0}
          className={
            "border px-2 py-0.5 focus:outline-none " +
            (apiReady && !enriching && queueCount > 0
              ? "border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
              : "cursor-not-allowed border-green-900 text-green-900")
          }
        >
          {enriching
            ? "[ ENRICH: RUNNING ]"
            : `[ ENRICH: ${String(queueCount).padStart(2, "0")} ]`}
        </button>
        <button
          onClick={exportCsv}
          className="border border-green-700 px-2 py-0.5 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [ EXPORT CSV ]
        </button>
      </div>

      <CorrelationScatter logs={logs} />
    </section>
  );
}
