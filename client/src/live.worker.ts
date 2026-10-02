import * as ort from "onnxruntime-web/webgpu";
import { LIVE_MODEL, MODEL_LABELS, MODEL_SIZE } from "./liveContract";
import type { LiveRequest, LiveResponse } from "./liveContract";
import type { GatePrediction } from "./gates";

ort.env.wasm.numThreads = 1;
// Keep the bundled module factory; only override the same-origin binary URL.
ort.env.wasm.wasmPaths = {
  wasm: new URL(import.meta.env.BASE_URL + "live-runtime/ort-wasm-simd-threaded.asyncify.wasm", self.location.origin).href,
};
let session: ort.InferenceSession | null = null;
let device: "webgpu" | "wasm" = "wasm";
let active = false;
const send = (data: LiveResponse) => self.postMessage(data);
async function load(id: number, forceCpu = false) {
  if (session) return;
  send({ id, type: "status", message: "Loading local sensing. Gates and doors are included." });
  const metadataResponse = await fetch(import.meta.env.BASE_URL + "live-models/provenance.json", { cache: "no-cache" });
  if (!metadataResponse.ok) throw new Error("The sensing model information could not be loaded.");
  const metadata = await metadataResponse.json();
  if (metadata.inputSize !== MODEL_SIZE || JSON.stringify(metadata.labels) !== JSON.stringify(MODEL_LABELS))
    throw new Error("The sensing model has changed. Reload EchoGuide and retry.");
  const response = await fetch(`${import.meta.env.BASE_URL}${LIVE_MODEL}?v=${metadata.sha256}`, { cache: "force-cache" });
  if (!response.ok) throw new Error("The sensing model could not be downloaded. Check your connection.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!forceCpu && "gpu" in navigator) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"] });
      device = "webgpu";
    } catch { session = null; }
  }
  if (!session) {
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    device = "wasm";
  }
}
self.onmessage = async (event: MessageEvent<LiveRequest>) => {
  if (active) return;
  active = true;
  const request = event.data;
  try {
    await load(request.id, request.type === "load" && request.forceCpu);
    if (request.type === "load") {
      send({ id: request.id, type: "ready", device });
      return;
    }
    const size = MODEL_SIZE;
    const source = new OffscreenCanvas(request.width, request.height);
    source.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(request.pixels), request.width, request.height), 0, 0);
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const scale = Math.min(size / request.width, size / request.height);
    const width = Math.round(request.width * scale), height = Math.round(request.height * scale);
    const left = Math.floor((size - width) / 2), top = Math.floor((size - height) / 2);
    context.fillStyle = "rgb(114,114,114)";
    context.fillRect(0, 0, size, size);
    context.drawImage(source, left, top, width, height);
    const rgba = context.getImageData(0, 0, size, size).data;
    const input = new Float32Array(3 * size * size);
    for (let i = 0; i < size * size; i++) {
      input[i] = rgba[i * 4] / 255;
      input[i + size * size] = rgba[i * 4 + 1] / 255;
      input[i + 2 * size * size] = rgba[i * 4 + 2] / 255;
    }
    const started = performance.now();
    const tensorInput = new ort.Tensor("float32", input, [1, 3, size, size]);
    const run = () => session!.run({ images: tensorInput });
    const output = await run().catch(async (error) => {
      if (device !== "webgpu") throw error;
      await session!.release().catch(() => {});
      session = null;
      await load(request.id, true);
      return run();
    });
    const tensor = output[session!.outputNames[0]];
    if (tensor.dims.length !== 3 || tensor.dims[2] !== 6)
      throw new Error("Unexpected sensing model output. Recreate the prepared assets.");
    const predictions: GatePrediction[] = [];
    const values = tensor.data as Float32Array;
    for (let i = 0; i < values.length; i += 6) {
      const score = values[i + 4], label = MODEL_LABELS[values[i + 5]];
      if (score < 0.25 || !label) continue;
      predictions.push({ label, score, box: {
        xmin: (values[i] - left) / width,
        ymin: (values[i + 1] - top) / height,
        xmax: (values[i + 2] - left) / width,
        ymax: (values[i + 3] - top) / height,
      } });
    }
    send({ id: request.id, type: "result", predictions, inferenceMs: performance.now() - started, device });
  } catch (error) {
    send({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Local sensing failed." });
  } finally { active = false; }
};
