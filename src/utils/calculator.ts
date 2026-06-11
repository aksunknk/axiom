export type MetricInput = {
  cognitiveLoad: number;
  physicalEnergy: number;
  mentalEnergy: number;
  autonomy: number;
  entropy: number;
};

export type IntegrityOptions = {
  /** Graceful Degradation: 非線形ペナルティを無効化 */
  safeMode?: boolean;
  /** 当日の nottodo_purge イベント数（スコアボーナス算出用） */
  nottodoxPurgeCount?: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** 1件あたり+2、上限+10 */
const NOTTODOT_BONUS_PER_PURGE = 2;
const NOTTODOT_BONUS_CAP = 10;

export function calculateSystemIntegrity(
  s: MetricInput,
  opts: IntegrityOptions = {}
): number {
  const C = s.cognitiveLoad;
  const P = s.physicalEnergy;
  const M = s.mentalEnergy;
  const A = s.autonomy;
  const E = s.entropy;

  const baseScore = ((100 - C) + P + M + A + (100 - E)) / 5;

  const penaltyE = opts.safeMode ? 0 : Math.max(0, E - 50) * 1.5;
  const multiplierL = opts.safeMode ? 1.0 : P <= 20 || M <= 20 ? 0.5 : 1.0;

  const purgeCount = opts.nottodoxPurgeCount ?? 0;
  const nottodoxBonus = Math.min(
    purgeCount * NOTTODOT_BONUS_PER_PURGE,
    NOTTODOT_BONUS_CAP
  );

  const finalScore = (baseScore - penaltyE) * multiplierL + nottodoxBonus;

  return clamp(finalScore);
}
