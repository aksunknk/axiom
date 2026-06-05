export type MetricInput = {
  cognitiveLoad: number;
  physicalEnergy: number;
  mentalEnergy: number;
  autonomy: number;
  entropy: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function calculateSystemIntegrity(s: MetricInput): number {
  const C = s.cognitiveLoad;
  const P = s.physicalEnergy;
  const M = s.mentalEnergy;
  const A = s.autonomy;
  const E = s.entropy;

  const baseScore = ((100 - C) + P + M + A + (100 - E)) / 5;
  const penaltyE = Math.max(0, E - 50) * 1.5;
  const multiplierL = P <= 20 || M <= 20 ? 0.5 : 1.0;
  const finalScore = (baseScore - penaltyE) * multiplierL;

  return clamp(finalScore);
}
