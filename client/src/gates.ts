import type { Box, Observation } from "./contracts";
import { directionFor, iou } from "./vision";

export const GATE_MODEL = "grounding-dino-tiny-ONNX";
export const GATE_THRESHOLD = 0.25;
export const GATE_PROMPTS = [
  "gate",
  "door",
  "exit sign",
  "fence",
  "window",
  "wall",
];
export type GateLabel = "gate" | "door" | "exit sign";
export type GateCandidate = Observation & { label: GateLabel };
export interface GatePrediction {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}
const labels: Record<string, GateLabel> = {
  gate: "gate",
  door: "door",
  "exit sign": "exit sign",
};

/** Boxes are normalised by the zero-shot pipeline's percentage=true option. */
export function gateCandidates(
  predictions: GatePrediction[],
  capturedAt: number,
): GateCandidate[] {
  const accepted: { prediction: GatePrediction; box: Box }[] = [];
  for (const prediction of [...predictions].sort((a, b) => b.score - a.score)) {
    const { xmin, ymin, xmax, ymax } = prediction.box;
    if (
      !Number.isFinite(prediction.score) ||
      prediction.score < GATE_THRESHOLD ||
      prediction.score > 1 ||
      ![xmin, ymin, xmax, ymax].every(Number.isFinite)
    )
      continue;
    if (
      xmax <= xmin ||
      ymax <= ymin ||
      xmin >= 1 ||
      ymin >= 1 ||
      xmax <= 0 ||
      ymax <= 0
    )
      continue;
    const x = Math.max(0, xmin),
      y = Math.max(0, ymin);
    const box = {
      x,
      y,
      width: Math.min(1, xmax) - x,
      height: Math.min(1, ymax) - y,
    };
    if (
      box.width * box.height < 0.005 ||
      accepted.some((a) => iou(a.box, box) > 0.45)
    )
      continue;
    // Keep negative classes for overlap suppression; don't relabel a fence as a gate.
    accepted.push({ prediction, box });
  }
  return accepted
    .filter((a) => Object.hasOwn(labels, a.prediction.label))
    .slice(0, 6)
    .map(({ prediction, box }, index) => {
      const horizontalPosition = box.x + box.width / 2;
      return {
        timestamp: capturedAt,
        trackId: `gate-snapshot-${index}`,
        label: labels[prediction.label],
        score: prediction.score,
        box,
        horizontalPosition,
        direction: directionFor(horizontalPosition),
        distanceMetres: null,
        depthSource: "none",
        depthState: "unavailable",
      };
    });
}
export function gatePhrase(candidate: GateCandidate) {
  return `Possible ${candidate.label}, ${candidate.direction}, in this image. Exit unconfirmed.`;
}
export type GateWorkerRequest = {
  id: number;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};
export type GateWorkerResponse =
  | { id: number; type: "status"; message: string; progress?: number }
  | {
      id: number;
      type: "result";
      predictions: GatePrediction[];
      inferenceMs: number;
    }
  | { id: number; type: "error"; message: string };
