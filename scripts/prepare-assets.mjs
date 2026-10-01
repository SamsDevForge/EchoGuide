import { mkdir, copyFile, readdir, stat, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = path.join(root, "client/public");
async function copyRuntime(source, destination, include = () => true) {
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(source)) {
    if (include(file))
      await copyFile(path.join(source, file), path.join(destination, file));
  }
}
async function download(url, destination, minimumSize = 1) {
  const existing = await stat(destination).catch(() => null);
  if (existing && existing.size >= minimumSize) return;
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body)
      throw new Error(`Asset download failed (${response.status}): ${url}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    if ((await stat(partial)).size < minimumSize)
      throw new Error(`Incomplete asset: ${url}`);
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

await copyRuntime(
  path.join(root, "node_modules/@mediapipe/tasks-vision/wasm"),
  path.join(publicDir, "vision"),
);
await download(
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
  path.join(publicDir, "models/efficientdet-lite0.tflite"),
  1000000,
);
// Same-origin model assets: no API key, Python server, or remote inference.
// Pin the revision so GitHub recreations use the same weights and tokenizer.
const revision = "ff690b0a8050566c290287545bd059350f3e9096";
const modelRoot = path.join(publicDir, "gate-models/grounding-dino-tiny-ONNX");
await mkdir(modelRoot, { recursive: true });
await copyFile(
  path.join(root, "node_modules/@huggingface/transformers/LICENSE"),
  path.join(modelRoot, "LICENSE"),
);
const files = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "onnx/model_quantized.onnx",
];
for (const file of files) {
  console.log(`Preparing gate model: ${file}`);
  await download(
    `https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX/resolve/${revision}/${file}`,
    path.join(modelRoot, file),
    file.endsWith(".onnx") ? 200000000 : 1,
  );
}
await copyRuntime(
  path.join(root, "node_modules/onnxruntime-web/dist"),
  path.join(publicDir, "gate-runtime"),
  (file) => /^ort-wasm.*\.(wasm|mjs)$/.test(file),
);
await download(
  "https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/LICENSE",
  path.join(publicDir, "gate-runtime/LICENSE"),
  1000,
);
console.log("Local object and gate/door model assets ready in client/public.");
