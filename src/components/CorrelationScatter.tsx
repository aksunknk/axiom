import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LogEntry } from "../api/logs";

type XAxisKey = "mental_energy" | "physical_energy";
type YAxisKey = "cognitive_load" | "autonomy";

type ScatterPoint = {
  x: number;
  y: number;
  cognitive_load: number;
  physical_energy: number;
  mental_energy: number;
  autonomy: number;
  entropy: number;
  note: string;
  timestamp: string;
};

const AXIOM_GREEN = "#22c55e";
const GRID_STROKE = "#14532d";
const AXIS_STROKE = "#166534";

const X_OPTIONS: { key: XAxisKey; label: string }[] = [
  { key: "mental_energy", label: "MENTAL_ENERGY" },
  { key: "physical_energy", label: "PHYSICAL_ENERGY" },
];

const Y_OPTIONS: { key: YAxisKey; label: string }[] = [
  { key: "cognitive_load", label: "COGNITIVE_LOAD" },
  { key: "autonomy", label: "AUTONOMY" },
];

const PARAM_LABELS: Record<string, string> = {
  cognitive_load: "COGNITIVE_LOAD",
  physical_energy: "PHYSICAL_ENERGY",
  mental_energy: "MENTAL_ENERGY",
  autonomy: "AUTONOMY",
  entropy: "ENTROPY",
};

function formatTooltipTime(iso: string): string {
  return new Date(iso)
    .toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}

function logsToScatterPoints(
  logs: LogEntry[],
  xKey: XAxisKey,
  yKey: YAxisKey
): ScatterPoint[] {
  return logs.map((l) => ({
    x: l.params[xKey],
    y: l.params[yKey],
    cognitive_load: l.params.cognitive_load,
    physical_energy: l.params.physical_energy,
    mental_energy: l.params.mental_energy,
    autonomy: l.params.autonomy,
    entropy: l.params.entropy,
    note: l.note,
    timestamp: l.timestamp,
  }));
}

type TooltipPayload = { payload: ScatterPoint };

function ScatterTooltip({
  active,
  payload,
  xLabel,
  yLabel,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  xLabel: string;
  yLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const p = payload[0].payload;
  const params = [
    "cognitive_load",
    "physical_energy",
    "mental_energy",
    "autonomy",
    "entropy",
  ] as const;

  return (
    <div
      className="border border-green-500 bg-black px-2 py-1 font-mono text-[11px] text-green-500"
      style={{ borderRadius: 0 }}
    >
      <p className="text-green-300">{`> ${formatTooltipTime(p.timestamp)}`}</p>
      <p className="mt-1 text-green-700">
        {`> note: ${p.note.trim() || "(none)"}`}
      </p>
      <p className="mt-1 text-green-800">{`// axis: ${xLabel} x ${yLabel}`}</p>
      {params.map((k) => (
        <p key={k} className="tabular-nums">
          {`  ${PARAM_LABELS[k]}: ${String(p[k]).padStart(3, "0")}`}
        </p>
      ))}
    </div>
  );
}

type CorrelationScatterProps = {
  logs: LogEntry[];
};

export default function CorrelationScatter({ logs }: CorrelationScatterProps) {
  const [xKey, setXKey] = useState<XAxisKey>("mental_energy");
  const [yKey, setYKey] = useState<YAxisKey>("cognitive_load");

  const chartData = useMemo(
    () => logsToScatterPoints(logs, xKey, yKey),
    [logs, xKey, yKey]
  );

  const xLabel = PARAM_LABELS[xKey];
  const yLabel = PARAM_LABELS[yKey];

  return (
    <section className="mt-6 border border-green-500 p-4">
      <p className="text-green-700">{"// CORRELATION / 相関分析散布図"}</p>
      <p className="mt-1 text-green-800">{`> n=${chartData.length} plots`}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-green-700">X:</span>
        {X_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setXKey(opt.key)}
            className={
              "border px-2 py-0.5 text-xs focus:outline-none " +
              (xKey === opt.key
                ? "border-green-500 bg-green-500 text-black"
                : "border-green-700 text-green-500 hover:bg-green-500 hover:text-black")
            }
          >
            [{opt.label}]
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-green-700">Y:</span>
        {Y_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setYKey(opt.key)}
            className={
              "border px-2 py-0.5 text-xs focus:outline-none " +
              (yKey === opt.key
                ? "border-green-500 bg-green-500 text-black"
                : "border-green-700 text-green-500 hover:bg-green-500 hover:text-black")
            }
          >
            [{opt.label}]
          </button>
        ))}
      </div>

      <div className="mt-4 h-72 w-full border border-green-900 bg-black">
        {chartData.length === 0 ? (
          <p className="p-4 text-green-800">{"> no data"}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="1 1" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                domain={[0, 100]}
                tick={{ fill: AXIOM_GREEN, fontSize: 10, fontFamily: "monospace" }}
                stroke={AXIS_STROKE}
                label={{
                  value: xLabel,
                  position: "insideBottom",
                  offset: -2,
                  fill: AXIOM_GREEN,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabel}
                domain={[0, 100]}
                tick={{ fill: AXIOM_GREEN, fontSize: 10, fontFamily: "monospace" }}
                stroke={AXIS_STROKE}
                label={{
                  value: yLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: AXIOM_GREEN,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "2 2", stroke: AXIOM_GREEN }}
                content={
                  <ScatterTooltip xLabel={xLabel} yLabel={yLabel} />
                }
                isAnimationActive={false}
              />
              <Scatter
                name="logs"
                data={chartData}
                fill={AXIOM_GREEN}
                stroke={AXIOM_GREEN}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
