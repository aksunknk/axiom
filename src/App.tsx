import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
    label: "COGNITIVE_LOAD",
    jp: "認知負荷",
    note: "working memory pressure",
    inverse: true,
  },
  {
    key: "physicalEnergy",
    index: "02",
    label: "PHYSICAL_ENERGY",
    jp: "物理的体力",
    note: "biological hardware capacity",
    inverse: false,
  },
  {
    key: "mentalEnergy",
    index: "03",
    label: "MENTAL_ENERGY",
    jp: "精神的体力",
    note: "focus & willpower reserve",
    inverse: false,
  },
  {
    key: "autonomy",
    index: "04",
    label: "AUTONOMY",
    jp: "自律統制率",
    note: "rule adherence rate",
    inverse: false,
  },
  {
    key: "entropy",
    index: "05",
    label: "ENTROPY",
    jp: "エントロピー",
    note: "noise & waste in system",
    inverse: true,
  },
];

const STORAGE_KEY = "status-tracker:v1";
const TRANSLUCENT_KEY = "status-tracker:translucent";

const DEFAULT_STATE: MetricState = {
  cognitiveLoad: 50,
  physicalEnergy: 50,
  mentalEnergy: 50,
  autonomy: 50,
  entropy: 50,
};

const BAR_SEGMENTS = 20;

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

function asciiBar(value: number): string {
  const filled = Math.round((value / 100) * BAR_SEGMENTS);
  return "█".repeat(filled) + "░".repeat(BAR_SEGMENTS - filled);
}

const ENTROPY_THRESHOLD = 50;
const ENTROPY_TOXICITY_WEIGHT = 1.5;
const DEPLETION_THRESHOLD = 20;
const CRITICAL_DEBUFF = 0.5;

// リービッヒの最小律に基づく非線形スコア算出。
// 1) ベース（エントロピー除外の良性4指標平均）
// 2) エントロピー毒性：50超過分に 1.5倍ペナルティ
// 3) クリティカル枯渇：物理 or 精神 <=20 で最終スコア半減
function computeIntegrity(s: MetricState): number {
  const base =
    (100 - s.cognitiveLoad + s.physicalEnergy + s.mentalEnergy + s.autonomy) / 4;

  let score = base;
  if (s.entropy > ENTROPY_THRESHOLD) {
    score -= (s.entropy - ENTROPY_THRESHOLD) * ENTROPY_TOXICITY_WEIGHT;
  }

  if (
    s.physicalEnergy <= DEPLETION_THRESHOLD ||
    s.mentalEnergy <= DEPLETION_THRESHOLD
  ) {
    score *= CRITICAL_DEBUFF;
  }

  return clamp(score);
}

function formatDelta(delta: number, withPercent = false): string {
  const sign = delta >= 0 ? "+" : "-";
  const mag = String(Math.abs(delta)).padStart(2, "0");
  return `Δ ${sign}${mag}${withPercent ? "%" : ""}`;
}

// 回復/安定=緑、軽微な低下=減光、危機的低下(<=-10)=警告赤
function deltaColor(delta: number): string {
  if (delta <= -10) return "text-red-500";
  if (delta < 0) return "text-green-800";
  return "text-green-500";
}

function diagnose(s: MetricState): { text: string; className: string } {
  if (s.mentalEnergy <= DEPLETION_THRESHOLD) {
    return {
      text: "> [ALERT] VRAM CRITICAL LOW. REQUIRE SHUTDOWN.",
      className: "text-red-500",
    };
  }
  if (s.entropy > ENTROPY_THRESHOLD) {
    return {
      text: "> [WARNING] UNSTABLE ENTROPY DETECTED.",
      className: "text-green-300",
    };
  }
  return {
    text: "> [INFO] SYSTEM STABLE. AUTONOMY OPTIMIZED.",
    className: "text-green-500",
  };
}

function loadTranslucent(): boolean {
  return localStorage.getItem(TRANSLUCENT_KEY) === "1";
}

function formatSessionNow(): string {
  return new Date()
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
    .replace(/\//g, "-")
    .replace(/\s/g, " ");
}

export default function App() {
  const [state, setState] = useState<MetricState>(loadState);
  // 起動時（前回セーブ）のスナップショット。セッション差分(Delta)の基準。
  const [baseline] = useState<MetricState>(loadState);
  const [translucent, setTranslucent] = useState<boolean>(loadTranslucent);
  const [now, setNow] = useState(formatSessionNow);

  useEffect(() => {
    const id = setInterval(() => setNow(formatSessionNow()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(TRANSLUCENT_KEY, translucent ? "1" : "0");
  }, [translucent]);

  const setValue = (key: MetricKey, value: number) =>
    setState((prev) => ({ ...prev, [key]: clamp(value) }));

  const adjust = (key: MetricKey, delta: number) =>
    setState((prev) => ({ ...prev, [key]: clamp(prev[key] + delta) }));

  const reset = () => setState(DEFAULT_STATE);

  const integrity = useMemo(() => computeIntegrity(state), [state]);
  const baseIntegrity = useMemo(() => computeIntegrity(baseline), [baseline]);
  const integrityDelta = integrity - baseIntegrity;
  const diagnosis = useMemo(() => diagnose(state), [state]);

  return (
    <div
      className={
        "min-h-screen w-full font-mono text-green-500 antialiased selection:bg-green-500 selection:text-black " +
        (translucent ? "bg-black/70 backdrop-blur-sm" : "bg-black")
      }
    >
      <TitleBar />
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed sm:px-6">
        {/* ── Header ─────────────────────────────── */}
        <header className="border border-green-500 p-4">
          <p className="text-green-500">
            <span className="text-green-700">{"> "}</span>
            SYSTEM / INSTRUMENT PANEL{" "}
            <span className="text-green-300">[AXIOM_v1.0]</span>
          </p>
          <p className="mt-1 text-green-700">
            <span className="text-green-700">{"> "}</span>
            session: {now}
          </p>
          <p className="mt-1 text-green-700">
            <span className="text-green-700">{"> "}</span>
            persistence: localStorage[{STORAGE_KEY}]{" "}
            <span className="animate-pulse text-green-500">_</span>
          </p>
        </header>

        {/* ── Diagnostic log ─────────────────────── */}
        <p className={"mt-3 " + diagnosis.className}>{diagnosis.text}</p>

        {/* ── Integrity ──────────────────────────── */}
        <section className="mt-6 border border-green-500 p-4">
          <p className="text-green-700">{"// SYSTEM INTEGRITY / 統合自律性スコア"}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="whitespace-pre tracking-tight">
              [{asciiBar(integrity)}]
            </span>
            <span className="tabular-nums text-green-300">
              {String(integrity).padStart(3, "0")}%
            </span>
            <span className={"tabular-nums " + deltaColor(integrityDelta)}>
              [ {formatDelta(integrityDelta, true)} ]
            </span>
          </div>
        </section>

        {/* ── Metrics ────────────────────────────── */}
        <main className="mt-6 border border-green-500">
          {METRICS.map((m, i) => (
            <MetricRow
              key={m.key}
              def={m}
              value={state[m.key]}
              delta={state[m.key] - baseline[m.key]}
              last={i === METRICS.length - 1}
              onAdjust={(d) => adjust(m.key, d)}
              onSet={(v) => setValue(m.key, v)}
            />
          ))}
        </main>

        {/* ── Footer ─────────────────────────────── */}
        <footer className="mt-6 flex items-center justify-between text-green-700">
          <button
            onClick={() => setTranslucent((v) => !v)}
            className="border border-green-700 px-2 py-0.5 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
          >
            [OPACITY: {translucent ? "GLASS" : "SOLID"}]
          </button>
          <button
            onClick={reset}
            className="border border-green-700 px-2 py-0.5 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
          >
            [RESET --default]
          </button>
        </footer>
      </div>
    </div>
  );
}

function TitleBar() {
  // decorations:false により OS のタイトルバーが消えるため、ドラッグ移動と
  // ウィンドウ操作を自前で提供する。ブラウザ(dev)では Tauri API を呼ばない。
  const appWindow = isTauri ? getCurrentWindow() : null;

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 select-none items-center justify-between border-b border-green-900 bg-black px-3 text-xs text-green-700"
    >
      <span data-tauri-drag-region className="pointer-events-none">
        {"> AXIOM_v1.0 // drag to move"}
      </span>
      <div className="flex items-center gap-1">
        <button
          aria-label="minimize"
          onClick={() => appWindow?.minimize()}
          className="px-2 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [_]
        </button>
        <button
          aria-label="close"
          onClick={() => appWindow?.close()}
          className="px-2 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [X]
        </button>
      </div>
    </div>
  );
}

type MetricRowProps = {
  def: MetricDef;
  value: number;
  delta: number;
  last: boolean;
  onAdjust: (delta: number) => void;
  onSet: (value: number) => void;
};

function MetricRow({ def, value, delta, last, onAdjust, onSet }: MetricRowProps) {
  return (
    <div className={last ? "p-4" : "border-b border-green-900 p-4"}>
      {/* label row */}
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate">
          <span className="text-green-700">{def.index}.</span>{" "}
          <span className="text-green-300">{def.label}</span>{" "}
          <span className="text-green-800">
            // {def.jp} {def.note}
          </span>
        </p>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={"tabular-nums text-xs " + deltaColor(delta)}>
            [ {formatDelta(delta)} ]
          </span>
          <span className="tabular-nums text-green-300">
            {String(value).padStart(3, "0")}
          </span>
        </span>
      </div>

      {/* gauge + controls */}
      <div className="mt-2 flex items-center gap-3">
        <button
          aria-label={`decrease ${def.label}`}
          onClick={() => onAdjust(-5)}
          className="px-1 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [-]
        </button>

        <span className="whitespace-pre tracking-tight">
          [{asciiBar(value)}]
        </span>

        <button
          aria-label={`increase ${def.label}`}
          onClick={() => onAdjust(5)}
          className="px-1 text-green-500 hover:bg-green-500 hover:text-black focus:outline-none"
        >
          [+]
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onSet(Number(e.target.value))}
          aria-label={`${def.label} slider`}
          className="slider h-px flex-1 cursor-pointer appearance-none bg-green-900"
        />
      </div>
    </div>
  );
}
