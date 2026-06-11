import type { LogParams } from "../api/logs";

/**
 * 異常値判定の一元定義。
 * direction "le" = 値が threshold 以下で異常 / "ge" = 以上で異常。
 */
const ALERT_RULES: Record<keyof LogParams, { threshold: number; direction: "le" | "ge" }> = {
  autonomy: { threshold: 30, direction: "le" },
  entropy: { threshold: 80, direction: "ge" },
  cognitive_load: { threshold: 80, direction: "ge" },
  physical_energy: { threshold: 30, direction: "le" },
  mental_energy: { threshold: 30, direction: "le" },
};

export function isMetricAbnormal(key: keyof LogParams, value: number): boolean {
  const rule = ALERT_RULES[key];
  return rule.direction === "le" ? value <= rule.threshold : value >= rule.threshold;
}
