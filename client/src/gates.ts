import type { Box } from "./contracts";
import { iou } from "./vision";

export const GATE_THRESHOLD = 0.25;
export interface GatePrediction {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

/** Validate image-normalized boxes before class filtering and tracking. */
export function validatedPredictions(predictions: GatePrediction[]) {
  const accepted: { prediction: GatePrediction; box: Box }[] = [];
  for (const prediction of [...predictions].sort((a, b) => b.score - a.score)) {
    const { xmin, ymin, xmax, ymax } = prediction.box;
    if (!Number.isFinite(prediction.score) || prediction.score < GATE_THRESHOLD ||
        prediction.score > 1 || ![xmin, ymin, xmax, ymax].every(Number.isFinite)) continue;
    if (xmax <= xmin || ymax <= ymin || xmin >= 1 || ymin >= 1 || xmax <= 0 || ymax <= 0) continue;
    const x = Math.max(0, xmin), y = Math.max(0, ymin);
    const box = { x, y, width: Math.min(1, xmax) - x, height: Math.min(1, ymax) - y };
    if (box.width * box.height < 0.005 || accepted.some(a => iou(a.box, box) > 0.45)) continue;
    // Negative classes participate in suppression, then are discarded by the live allowlist.
    accepted.push({ prediction, box });
  }
  return accepted.map(({ prediction, box }) => ({ label: prediction.label, score: prediction.score, box }));
}
