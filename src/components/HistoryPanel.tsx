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
import { fetchLogs, type LogEntry } from "../api/logs";
import CorrelationScatter from "./CorrelationScatter";

const SERIES = [
  { key: "cognitive_load", label: "C", color: "#22c55e" },
  { key: "physical_energy", label: "P", color: "#4ade80" },
  { key: "mental_energy", label: "M", color: "#86efac" },
  { key: "autonomy", label: "A", color: "#16a34a" },
  { key: "entropy", label: "E", color: "#15803d" },
] as const;

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

export default function HistoryPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState("> loading...");

  const load = useCallback(async () => {
    try {
      const data = await fetchLogs(7);
      setLogs(data);
      setStatus(`> loaded ${data.length} records (7d)`);
    } catch {
      setStatus("> [ERROR] API UNREACHABLE");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
                contentStyle={{
                  backgroundColor: "#000",
                  border: "1px solid #22c55e",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#22c55e",
                }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  dot={false}
                  strokeWidth={1}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={load}
          className="border border-green-700 px-2 py-0.5 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [ REFRESH ]
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
