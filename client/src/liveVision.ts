import type { Observation, ProviderFrame } from "./contracts";
import { directionFor } from "./vision";
import { validatedPredictions } from "./gates";
import type { GatePrediction } from "./gates";

import { LIVE_LABELS } from "./liveContract";
import type { LiveResponse, LiveRequest } from "./liveContract";
export { LIVE_LABELS, MODEL_LABELS, LIVE_MODEL, MODEL_SIZE } from "./liveContract";
export type { LiveResponse, LiveRequest } from "./liveContract";

export function liveCandidates(predictions: GatePrediction[], timestamp: number): Omit<Observation, "trackId">[] {
  return validatedPredictions(predictions)
    .filter(p => LIVE_LABELS.includes(p.label))
    .sort((a, b) => Number(b.label === "gate" || b.label === "door") - Number(a.label === "gate" || a.label === "door"))
    .slice(0, 8)
    .map(p => ({
      timestamp,
      label: p.label,
      score: p.score,
      box: p.box,
      horizontalPosition: p.box.x + p.box.width / 2,
      direction: directionFor(p.box.x + p.box.width / 2),
      distanceMetres: null,
      depthSource: "none",
      depthState: "unavailable",
    }));
}

/** One in-flight frame. Stopping rejects pending work and destroys its worker. */
export class LiveVision {
  private worker: Worker;
  private serial = 0;
  private stopped = false;
  private pending: { id: number; resolve: (data: LiveResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  device: "webgpu" | "wasm" | null = null;
  constructor(private onStatus: (message: string, progress?: number) => void = () => {}) {
    this.worker = new Worker(new URL("./live.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<LiveResponse>) => {
      const data = event.data;
      if (this.stopped || data.id !== this.pending?.id) return;
      if (data.type === "status") {
        this.onStatus(data.message, data.progress);
        return;
      }
      const pending = this.pending;
      clearTimeout(pending.timer);
      this.pending = null;
      if (data.type === "error") pending.reject(new Error(data.message));
      else pending.resolve(data);
    };
    this.worker.onerror = () => this.stop(new Error("The local detector could not run in this browser."));
  }
  private request(request: LiveRequest, transfer: Transferable[] = [], timeout = 15000) {
    if (this.stopped) return Promise.reject(new DOMException("Sensing stopped.", "AbortError"));
    if (this.pending) return Promise.reject(new Error("A camera frame is already being checked."));
    return new Promise<LiveResponse>((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error("The local detector timed out. Check the connection and retry Start.")), timeout);
      this.pending = { id: request.id, resolve, reject, timer };
      try { this.worker.postMessage(request, transfer); }
      catch (error) { this.stop(error instanceof Error ? error : new Error("Frame transfer failed.")); }
    });
  }
  async load() {
    const forceCpu = typeof location !== "undefined" && new URLSearchParams(location.search).get("runtime") === "wasm";
    const result = await this.request({ id: ++this.serial, type: "load", forceCpu }, [], 180000);
    if (result.type !== "ready") throw new Error("Detector initialization failed.");
    this.device = result.device;
  }
  async detectPixels(pixels: Uint8ClampedArray, width: number, height: number) {
    const copy = new Uint8ClampedArray(pixels);
    const result = await this.request({ id: ++this.serial, type: "detect", pixels: copy, width, height }, [copy.buffer]);
    if (result.type !== "result") throw new Error("Detector did not return a frame result.");
    if (result.device) this.device = result.device;
    return result;
  }
  async detect(frame: ProviderFrame) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(frame.width, frame.height));
    canvas.width = Math.round(frame.width * scale);
    canvas.height = Math.round(frame.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera pixels are unavailable.");
    context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
    const result = await this.detectPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    return { candidates: liveCandidates(result.predictions, frame.timestamp), inferenceMs: result.inferenceMs };
  }
  stop(error: Error = new DOMException("Sensing stopped.", "AbortError")) {
    this.stopped = true;
    this.worker.terminate();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }
}
