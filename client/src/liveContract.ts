import type { GatePrediction } from "./gates";
export const LIVE_LABELS = ["person", "chair", "backpack", "gate", "door"];
// IDs follow the export's fixed prompts; gate/door synonyms share one spoken label.
export const MODEL_LABELS = [...LIVE_LABELS, "fence", "window", "wall", "gate", "gate", "door"];
export const LIVE_MODEL = "live-models/echoguide-yoloe.onnx";
export const MODEL_SIZE = 640;
export type LiveResponse =
  | { id: number; type: "status"; message: string; progress?: number }
  | { id: number; type: "ready"; device: "webgpu" | "wasm" }
  | { id: number; type: "result"; predictions: GatePrediction[]; inferenceMs: number; device?: "webgpu" | "wasm" }
  | { id: number; type: "error"; message: string };
export type LiveRequest =
  | { id: number; type: "load"; forceCpu?: boolean }
  | { id: number; type: "detect"; pixels: Uint8ClampedArray; width: number; height: number };
