# EchoGuide

**Hear what’s here.** A single-device, account-free object-awareness prototype for an AI for Smart Mobility hackathon. Point the rear camera forward; local detection identifies **people, chairs, and backpacks**, then plays a left / centre / right tone followed by a short spoken label.

**Gates & doors** checks a deliberately captured camera image or selected photo for **gates, building doors, and possible exit signs** using a separate local detector. It announces, for example, “Possible gate, left, in this image. Exit unconfirmed.” A visual opening cannot establish that a gate is unlocked or that a door leads to an exit.

**[Open EchoGuide](https://SamsDevForge.github.io/EchoGuide/)** · **[Device capability check](https://SamsDevForge.github.io/EchoGuide/probe)** · [Demo script](docs/SUBMISSION.md) · [Test record](docs/TESTING.md)

This is a stationary, supervised indoor demonstration. It can miss or misidentify objects. It does not certify a route safe, provide road-crossing guidance, or infer a clear path from missing detections.

## Run from GitHub

Install Node.js 22 or newer and Git, then:

```sh
git clone https://github.com/SamsDevForge/EchoGuide.git
cd EchoGuide
npm ci
npm run models
npm run dev
```

Open **http://localhost:5173**. The API runs on port 3001. **No account, database, API key, or `.env` file is required for camera sensing, gate/door checks, audio, preferences, or the capability probe.** Model preparation downloads EfficientDet-Lite0 and the pinned quantized Grounding DINO Tiny model, then copies their browser runtimes locally. The gate model is approximately 204 MB, with additional runtime files; allow time and a reliable connection for preparation. Large binaries are generated assets, not committed to Git.

```sh
npm run typecheck
npm test
npm run build
```

`npm run start` starts the built optional API; for a built frontend preview use `npm exec -w client vite preview -- --host 0.0.0.0`. For only the frontend in development use `npm run dev -w client`.

## Use on the phone

Open the HTTPS app link in Chrome on the OnePlus Nord CE5. Pair the boAt earbuds in Android, use **Calibrate earbuds**, then **Start sensing** and allow camera access. Hold the rear camera forward and face the same direction. The app requires no sign-in. Preferences stay in that browser’s local storage.

An ordinary `http://<computer LAN IP>:5173` link does **not** give Android Chrome a secure camera context. Use the public HTTPS deployment. An alternative for developers is Android USB debugging with `adb reverse tcp:5173 tcp:5173`, then `http://localhost:5173` on the attached phone. Android tooling is not bundled or required for the public link.

The audio demo is explicitly marked as sample data and never mixed with live results. Disable Android’s mono-audio setting for stereo cues. The app cannot detect which audio output device Android selected; confirm by listening.

To look for an opening, select **Gates & doors**, open the rear camera, point at a gate or building door, and tap **Capture & check**. Alternatively choose **Use a photo**, then **Check this image**. The first browser check downloads the model from this app’s origin; subsequent checks can reuse the browser cache. The image is processed in a local worker and is not uploaded. Directions describe the captured image, so capture again after moving the phone. **Cancel check / Pause** stops inference and audio. Recognition may miss openings or confuse fences/windows with gates/doors; “no candidate” does not mean “no exit.” An exit-sign candidate does not verify its text or arrow.

**Try gate example / Try door example** loads labelled demonstration photos so the complete local check can be reproduced without camera access. The screen and spoken result identify these as example photos. These are individual smoke tests, not accuracy benchmarks. Photo authors and licences appear in the app and in [`client/public/examples/ATTRIBUTION.md`](client/public/examples/ATTRIBUTION.md); the photos retain their own licences.

## What works and what remains

- Local MediaPipe EfficientDet-Lite0 detection, a rear-camera preview, normalised boxes, lightweight tracking, and camera-relative directions.
- Local Grounding DINO Tiny gate/door/exit-sign candidate checks on camera captures or photos, normalised boxes, qualified directional speech, cancellation and loading/error states.
- Start/Pause, stopped-camera handling, background pause, stereo calibration, repeat, adjustable volume/pace, and optional HRTF tones.
- An XR capability probe requesting raw camera access and CPU depth in the **same** session, reading actual camera pixels and depth, with copyable diagnostics.
- Optional Express Gemini scene descriptions and optional PostgreSQL/JWT/bcrypt account APIs. The primary UI uses local preferences and guest access.
- GitHub Actions checks and HTTPS frontend deployment; optional Netlify, Vercel, and Render configuration.

**Live metric distance is unavailable.** Standard camera frames are never combined with unrelated XR depth. The probe’s centre readings are diagnostic optical-axis depth, not distances to detected objects. A live aligned depth provider is not enabled. Phone tests must first establish usable same-session pixels/depth, orientation, calibration, surface association, and measured error. There is no simulated distance, monocular metre estimate, native wrapper, head tracking, or detection outside the camera’s view.

Automated checks are distinct from physical tests. See [the verification record](docs/TESTING.md). Actual Nord CE5 recognition performance, earbud channel separation, end-to-end latency, and WebXR behaviour await physical testing. Optional Gemini and PostgreSQL need credentials for live integration tests.

## Architecture

```text
Rear camera → VideoProvider → MediaPipe (local, ~3 frames/sec target)
                           → normalised observations → Tracker
                           → announcement gate → stereo/HRTF tone + browser speech
                           → accessible React UI

Device check → independent XR session → raw camera shader/readPixels + CPU depth

Gates & doors → deliberate camera capture / photo → Grounding DINO Tiny q8 (local worker)
             → filtered candidate boxes → image-relative tone + qualified speech

Explicit Describe scene → one JPEG → Express → Gemini → text description
```

- `client/src/contracts.ts`: provider and observation interfaces. Timestamps use the browser monotonic clock. Detection confidence and depth validity are separate.
- `vision.ts`: the detector consumes the full intrinsic camera frame without crop or mirroring. Bounding boxes are normalised against that frame. Preview follows its changing aspect ratio and uses `object-fit: contain`. Camera-left is x < .38; camera-right is x > .62. The provider uses no fixed landscape assumptions, and rejects unchanged/frozen frames rather than refreshing stale detections.
- `Tracker`: matching labels and box overlap associate observations; detections missing from the current frame are dropped immediately. Tracks expire after 1.5 seconds. There is no inference queue; processing uses the latest frame at a modest target rate.
- `audio.ts`: left = stereo pan -1, centre = 0, right = +1. A short tone precedes ordinary, unpanned speech because browser speech cannot be routed through Web Audio. A changed scene or Pause cancels pending cues and speech. Meaningfully unchanged objects are suppressed. Pace is a minimum interval, not a promise of an announcement every N seconds.
- `GateScan.tsx`, `gate.worker.ts`, `gates.ts`: one captured-image request at a time, WASM inference on one worker thread, with local model/runtime paths and remote model fetching disabled. A local caption queries gates, doors and exit signs plus fence/window/wall alternatives. Scores below .25, invalid/tiny boxes and duplicates are rejected; higher-scoring overlapping alternatives suppress opening candidates. These scores are model similarities, not calibrated probabilities. No snapshot result becomes a live observation or metric distance. Pause/background/navigation stops the worker and cancels speech. The model revision is pinned in `scripts/prepare-assets.mjs`.
- `probe.ts`: requires `camera-access` and `depth-sensing` together. It samples the browser-owned texture into an application-owned framebuffer before readback. Pixel variation is evidence of readback, **not** proof of detector alignment. `getDepthInMeters` applies the API’s normalised-view-to-depth transform; raw buffers are never indexed as if they were camera pixels. Multiple centre samples reject missing and mixed depth. Optical-axis depth and Euclidean range are distinct; range utilities are tested but not used for live estimates.
- `server/`: strict validation, bounded JPEG payloads, server-side API key, timeout, rate limiting, optional PostgreSQL preferences scoped to verified JWT subjects. Camera images are not stored or logged.

## Optional Gemini setup

Copy `server/.env.example` to `server/.env` and put `GEMINI_API_KEY` there locally. Never commit keys or put them in a `VITE_` variable. Restart the server and reload the page; Describe scene becomes available. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; use a model available to your project. A Gemini request can incur provider usage charges; no account or paid service is created by the app.

The request deliberately sends one JPEG only when the button is tapped. Detections are supplied as fallible structured context. Prompt instructions prohibit invented distances and navigability claims, but generated content can still be wrong. Responses render as plain React text, not HTML.

Environment variables:

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | server | API port; default 3001 |
| `CLIENT_ORIGIN` | server | Allowed frontend origin; default localhost:5173 |
| `GEMINI_API_KEY` | server only | Optional scene description API key |
| `GEMINI_MODEL` | server | Optional model name |
| `DATABASE_URL` | server only | Optional PostgreSQL connection string |
| `JWT_SECRET` | server only | Strong random 32+ character secret when accounts are configured |
| `VITE_API_URL` | client build | Deployed API origin; blank uses development proxy |
| `VITE_STATIC_MODE` | client build | `true` disables optional API requests unless an API URL is set |
| `VITE_BASE_PATH` | build shell | `/EchoGuide/` on GitHub Pages; `/` elsewhere |

Optional accounts require a real PostgreSQL database and `npm run db:migrate -w server`. No database is silently emulated. Account APIs remain available for future extension, but login is intentionally absent from this single-device UI.

## Deployment and recreation

The included Actions workflow installs from `package-lock.json`, prepares model assets, runs checks, builds, and deploys `client/dist` to GitHub Pages. In a fork, enable **Settings → Pages → GitHub Actions** and update the workflow base path if the repository name differs. The workflow copies `index.html` to `404.html` to support direct client routes on Pages.

For Netlify or Vercel, use the included configuration. For the optional API on Render, use `render.yaml` and configure environment variables in the host’s secret settings. Set `VITE_API_URL` to that API origin and rebuild the client. Set `CLIENT_ORIGIN` to your frontend origin. No hosting purchase is needed for the account-free static workflow. Review current free-plan availability before optional backend deployment.

## Attribution and sources

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js), Google, Apache-2.0. Official [EfficientDet-Lite0 model documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector) and [Google model asset](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite). COCO labels include `person`, `chair`, and `backpack`; runtime requests these labels only.
- [Grounding DINO Tiny](https://huggingface.co/IDEA-Research/grounding-dino-tiny) by IDEA Research and [the ONNX Community conversion](https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX), Apache-2.0; [Transformers.js](https://github.com/huggingface/transformers.js), Apache-2.0, and [ONNX Runtime](https://github.com/microsoft/onnxruntime), MIT. Gate assets use revision `ff690b0a8050566c290287545bd059350f3e9096` and `onnx/model_quantized.onnx`.
- [WebXR Raw Camera Access specification](https://immersive-web.github.io/raw-camera-access/), [WebXR Depth Sensing specification](https://www.w3.org/TR/webxr-depth-sensing-1/), and [Google’s ARCore device list](https://developers.google.com/ar/devices). Nord CE5 is listed for Depth API; browser compatibility and phone behaviour require separate tests.
- [Gemini generateContent API](https://ai.google.dev/api/generate-content).
- React, Vite, React Router, Tailwind CSS, Express, Zod, and the other dependencies retain their respective licences. [Lucide icons](https://lucide.dev/license), ISC.

See [LICENSE](LICENSE) for this project’s source licence.
