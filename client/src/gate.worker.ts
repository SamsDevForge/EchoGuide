import { env, pipeline, RawImage } from "@huggingface/transformers";
import type { ZeroShotObjectDetectionPipeline } from "@huggingface/transformers";
import { GATE_MODEL, GATE_PROMPTS, GATE_THRESHOLD } from "./gates";
import type {
  GateWorkerRequest,
  GateWorkerResponse,
  GatePrediction,
} from "./gates";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${import.meta.env.BASE_URL}gate-models/`;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = `${import.meta.env.BASE_URL}gate-runtime/`;
let activeId = 0;
let detector: ZeroShotObjectDetectionPipeline | null = null;
const send = (message: GateWorkerResponse) => self.postMessage(message);
self.onmessage = async (event: MessageEvent<GateWorkerRequest>) => {
  if (activeId) return; // A single request; never build a queue of camera frames.
  const request = event.data;
  activeId = request.id;
  try {
    if (!detector) {
      send({
        id: request.id,
        type: "status",
        message:
          "Loading the local gate model. First use downloads about 204 MB.",
      });
      detector = await pipeline<"zero-shot-object-detection">(
        "zero-shot-object-detection",
        GATE_MODEL,
        {
          device: "wasm",
          dtype: "q8",
          progress_callback: (event) => {
            if (event.status === "progress")
              send({
                id: request.id,
                type: "status",
                message: event.file.endsWith(".onnx")
                  ? "Downloading the gate model…"
                  : "Loading detector files…",
                progress: event.progress,
              });
          },
        },
      );
    }
    send({
      id: request.id,
      type: "status",
      message: "Checking the captured image for gates, doors, and exit signs…",
    });
    const started = performance.now();
    const image = new RawImage(
      request.pixels,
      request.width,
      request.height,
      4,
    );
    // Use one comma-separated caption. This export showed first-category bias
    // with period-separated phrases in real gate/door verification.
    const predictions = await detector(image, [`${GATE_PROMPTS.join(", ")}.`], {
      threshold: GATE_THRESHOLD,
      top_k: 20,
      percentage: true,
    });
    send({
      id: request.id,
      type: "result",
      predictions: predictions as GatePrediction[],
      inferenceMs: performance.now() - started,
    });
  } catch (error) {
    detector = null;
    send({
      id: request.id,
      type: "error",
      message:
        error instanceof Error ? error.message : "Gate detection failed.",
    });
  } finally {
    activeId = 0;
  }
};
