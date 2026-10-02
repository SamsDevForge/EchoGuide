import { mkdir, copyFile, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = path.join(root, "client/public");
const modelDir = path.join(publicDir, "live-models");
const provenance = JSON.parse(await readFile(path.join(modelDir, "provenance.json"), "utf8"));
const model = await readFile(path.join(modelDir, "echoguide-yoloe.onnx"));
if (createHash("sha256").update(model).digest("hex") !== provenance.sha256)
  throw new Error("The committed sensing model does not match provenance.json. Restore it from GitHub.");

const runtime = path.join(publicDir, "live-runtime");
await mkdir(runtime, { recursive: true });
const require = createRequire(path.join(root, "client/package.json"));
const runtimeSource = path.dirname(require.resolve("onnxruntime-web"));
for (const file of await readdir(runtimeSource)) {
  if (file === "ort-wasm-simd-threaded.asyncify.wasm")
    await copyFile(path.join(runtimeSource, file), path.join(runtime, file));
}
await copyFile(path.join(root, "client/public/onnxruntime-LICENSE"), path.join(runtime, "LICENSE"));
console.log("Verified local sensing model and prepared browser runtime. No accounts or Python required.");
