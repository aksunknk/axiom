import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw, Activity } from "lucide-react";

type MetricKey =
  | "cognitiveLoad"
  | "physicalEnergy"
  | "mentalEnergy"
  | "autonomy"
  | "entropy";

type MetricState = Record<MetricKey, number>;

type MetricDef = {
  key: MetricKey;
  index: string;
  label: string;
  jp: string;
  note: string;
  /** true の場合、低い値が良好な状態（負荷・ノイズ系） */
  inverse: boolean;
};

const METRICS: MetricDef[] = [
  {
    key: "cognitiveLoad",
    index: "01",
    label: "Cognitive Load",
    jp: "認知負荷",
    note: "Working memory pressure",
    inverse: true,
  },
  {
    key: "physicalEnergy",
    index: "02",
    label: "Physical Energy",
    jp: "物理的体力",
    note: "Biological hardware capacity",
    inverse: false,
  },
  {
    key: "mentalEnergy",
    index: "03",
    label: "Mental Energy",
    jp: "精神的体力",
    note: "Focus & willpower reserve",
    inverse: false,
  },
  {
    key: "autonomy",
    index: "04",
    label: "Autonomy",
    jp: "自律統制率",
    note: "Rule adherence rate",
    inverse: false,
  },
  {
    key: "entropy",
    index: "05",
    label: "Entropy",
    jp: "エントロピー",
    note: "Noise & waste in system",
    inverse: true,
  },
];

const STORAGE_KEY = "status-tracker:v1";

const DEFAULT_STATE: MetricState = {
  cognitiveLoad: 40,
  physicalEnergy: 70,
  mentalEnergy: 65,
  autonomy: 80,
  entropy: 25,
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function loadState(): MetricState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<MetricState>;
    return METRICS.reduce((acc, m) => {
      const v = parsed[m.key];
      acc[m.key] = typeof v === "number" ? clamp(v) : DEFAULT_STATE[m.key];
      return acc;
    }, {} as MetricState);
  } catch {
    return DEFAULT_STATE;
  }
}

export default function App() {
  const [state, setState] = useState<MetricState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setValue = (key: MetricKey, value: number) =>
    setState((prev) => ({ ...prev, [key]: clamp(value) }));

  const adjust = (key: MetricKey, delta: number) =>
    setState((prev) => ({ ...prev, [key]: clamp(prev[key] + delta) }));

  const reset = () => setState(DEFAULT_STATE);

  // 総合スコア：inverse 系は反転して平均化する
  const integrity = useMemo(() => {
    const total = METRICS.reduce((sum, m) => {
      const v = state[m.key];
      return sum + (m.inverse ? 100 - v : v);
    }, 0);
    return Math.round(total / METRICS.length);
  }, [state]);

  const now = useMemo(
    () =>
      new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    []
  );

  return (
    <div className="min-h-screen w-full bg-white text-neutral-950 font-sans antialiased">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-10 sm:py-24">
        {/* ── Header ─────────────────────────────── */}
        <header className="mb-16 border-b border-neutral-950 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
                <Activity className="h-3 w-3" strokeWidth={1.5} />
                System / Instrument Panel
              </p>
              <h1 className="text-4xl font-light uppercase leading-none tracking-tight sm:text-6xl">
                Status
              </h1>
            </div>
            <p className="pt-1 text-[10px] uppercase tracking-widest text-neutral-400">
              {now}
            </p>
          </div>
        </header>

        {/* ── Integrity ──────────────────────────── */}
        <section className="mb-16 flex items-end justify-between">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
              System Integrity
            </p>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              統合自律性スコア
            </p>
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-6xl font-light leading-none tabular-nums">
              {integrity}
            </span>
            <span className="text-sm text-neutral-400">/100</span>
          </div>
        </section>

        {/* ── Metrics ────────────────────────────── */}
        <main className="divide-y divide-neutral-200 border-y border-neutral-950">
          {METRICS.map((m) => (
            <MetricRow
              key={m.key}
              def={m}
              value={state[m.key]}
              onAdjust={(d) => adjust(m.key, d)}
              onSet={(v) => setValue(m.key, v)}
            />
          ))}
        </main>

        {/* ── Footer ─────────────────────────────── */}
        <footer className="mt-12 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400">
            Autosaved · localStorage
          </p>
          <button
            onClick={reset}
            className="group flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400 transition-colors hover:text-neutral-950"
          >
            <RotateCcw
              className="h-3 w-3 transition-transform group-hover:-rotate-180"
              strokeWidth={1.5}
            />
            Reset
          </button>
        </footer>
      </div>
    </div>
  );
}

type MetricRowProps = {
  def: MetricDef;
  value: number;
  onAdjust: (delta: number) => void;
  onSet: (value: number) => void;
};

function MetricRow({ def, value, onAdjust, onSet }: MetricRowProps) {
  return (
    <div className="group grid grid-cols-[auto_1fr] gap-x-6 gap-y-5 py-9">
      {/* index */}
      <span className="pt-1 font-mono text-[11px] tracking-widest text-neutral-300">
        {def.index}
      </span>

      <div>
        {/* label row */}
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-light uppercase tracking-tight">
              {def.label}
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-neutral-400">
              {def.jp} — {def.note}
            </p>
          </div>
          <span className="shrink-0 font-mono text-2xl font-light tabular-nums">
            {String(value).padStart(3, "0")}
          </span>
        </div>

        {/* gauge */}
        <div className="relative h-px w-full bg-neutral-200">
          <div
            className="absolute left-0 top-0 h-px bg-neutral-950 transition-[width] duration-500 ease-out"
            style={{ width: `${value}%` }}
          />
          {/* marker */}
          <div
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 transition-[left] duration-500 ease-out"
            style={{ left: `${value}%` }}
          />
        </div>

        {/* controls */}
        <div className="mt-5 flex items-center gap-4">
          <button
            aria-label={`decrease ${def.label}`}
            onClick={() => onAdjust(-5)}
            className="flex h-7 w-7 items-center justify-center border border-neutral-950 transition-colors hover:bg-neutral-950 hover:text-white"
          >
            <Minus className="h-3 w-3" strokeWidth={1.5} />
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onSet(Number(e.target.value))}
            aria-label={`${def.label} slider`}
            className="slider h-px flex-1 cursor-pointer appearance-none bg-neutral-300"
          />

          <button
            aria-label={`increase ${def.label}`}
            onClick={() => onAdjust(5)}
            className="flex h-7 w-7 items-center justify-center border border-neutral-950 transition-colors hover:bg-neutral-950 hover:text-white"
          >
            <Plus className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
