# EchoGuide

**Hear what’s here.** A single-device, account-free object-awareness prototype for an AI for Smart Mobility hackathon. Tap **Start sensing** once and point the rear camera forward. One local detector identifies **people, chairs, backpacks, gates, and building doors**, then plays a left / centre / right tone followed by a short spoken label.

Gates and doors are announced automatically in the existing audio feed: **“Possible gate, left.” / “Possible door, centre.”** There is no capture or separate checking step. A visible opening cannot establish that a gate is unlocked or that a door leads to an exit.

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

Open **http://localhost:5173**. The optional API runs on port 3001. **No account, database, API key, Python, or `.env` file is required for sensing, audio, preferences, or the capability probe.** The fixed-prompt YOLOE-26s ONNX model (38.2 MB) is committed to Git. Model preparation verifies its SHA-256 and copies the browser runtime from the locked npm dependency. First browser use loads the model and roughly 26.8 MB runtime from this app's origin; subsequent starts can reuse the browser cache.

```sh
npm run typecheck
npm test
npm run build
```

After building, **`npm start` serves the frontend and API together at http://localhost:3001**. The default server listens only on this device. No hosting account is needed. For only the frontend in development use `npm run dev -w client`.

## Use on the phone

Open the HTTPS app link in Chrome on the OnePlus Nord CE5. Pair the boAt earbuds in Android, use **Calibrate earbuds**, then **Start sensing** and allow camera access. Hold the rear camera forward and face the same direction. The app requires no sign-in. Preferences stay in that browser’s local storage.

An ordinary `http://<computer LAN IP>:5173` link does **not** give Android Chrome a secure camera context. Use the public HTTPS deployment. An alternative for developers is Android USB debugging with `adb reverse tcp:5173 tcp:5173`, then `http://localhost:5173` on the attached phone. Android tooling is not bundled or required for the public link.

The audio demo is explicitly marked as sample data and never mixed with live results. Disable Android’s mono-audio setting for stereo cues. The app cannot detect which audio output device Android selected; confirm by listening.

Guidance now defaults to a gentle speaking speed (0.9) and softer directional tones. It prefers an installed English voice, prioritizing voices advertised as natural/enhanced when available. **Guidance voice**, **Speaking speed**, and **Preview guidance voice** are in listening preferences and saved on this device. Voices may load after the page opens; new voices are picked up automatically. If no suitable voice is exposed, the browser default preserves audible guidance. Voice quality and that fallback service depend on the phone's speech engine; no separate TTS account or model is required.

Gates and doors use the same **Start sensing / Pause sensing** flow as other objects. Openings receive announcement priority, with unchanged observations suppressed. Startup, pause, interruption, and retry guidance are spoken. Frames are processed locally in one worker without an inference queue; expired results are discarded rather than announced as current. Backgrounding or leaving sensing stops the camera, worker, tones and speech. Recognition may miss openings or confuse fences/windows with gates/doors; an empty list does not mean “no exit.” Exit signs, text, arrows and usable exit routes are not classified.

The optional **Try detector example photos** link uses the exact same model and preprocessing on labelled gate/door photos without camera access. Spoken results begin “Example photo.” These are smoke tests, not accuracy benchmarks or observations of your surroundings. Photo authors and licences appear in the app and in [`client/public/examples/ATTRIBUTION.md`](client/public/examples/ATTRIBUTION.md).

## What works and what remains

- One local YOLOE-26s model for all five live classes, a rear-camera preview, normalised boxes, lightweight tracking, and camera-relative directions.
- Automatic possible-gate/door announcements, optional same-model example photos, cancellation and spoken loading/error states.
- Start/Pause, stopped-camera handling, background pause, stereo calibration, repeat, adjustable volume/pace, and optional HRTF tones.
- An optional AR depth check requiring depth while requesting raw camera access separately as an optional feature in the **same** session. It can report actual CPU depth even without raw camera access, or GPU depth availability without inventing metric readings, with copyable diagnostics.
- Optional Express Gemini scene descriptions and optional PostgreSQL/JWT/bcrypt account APIs. The primary UI uses local preferences and guest access.
- GitHub Actions checks and HTTPS frontend deployment; optional Netlify, Vercel, and Render configuration.

**Live metric distance is unavailable.** Standard camera frames are never combined with unrelated XR depth. The probe’s centre readings are diagnostic optical-axis depth, not distances to detected objects. A live aligned depth provider is not enabled. Phone tests must first establish usable same-session pixels/depth, orientation, calibration, surface association, and measured error. There is no simulated distance, monocular metre estimate, native wrapper, head tracking, or detection outside the camera’s view.

Automated checks are distinct from physical tests. See [the verification record](docs/TESTING.md). The user reported depth failures on the Nord CE5 and other tested phones on 2 October 2026. The old probe incorrectly made raw camera access mandatory for any depth result; the revised probe removes that gate, requests the session directly from the tap, and distinguishes session rejection, tracking failure, and tracking without depth. Success on these phones has **not** been established. Actual recognition performance, earbud channel separation and end-to-end latency remain unverified.

[Google lists the Nord CE5 as supporting ARCore Depth](https://developers.google.com/ar/devices). That does not guarantee browser access. Use the HTTPS app directly in current Chrome with Google Play Services for AR updated. The check ends automatically after 25 seconds and clears the last current reading when stopped. No experimental browser flags are part of setup. Live object distance remains unavailable, and camera/audio sensing requires no depth setup.

## Architecture

```text
Rear camera → VideoProvider → YOLOE-26s ONNX worker (local, one frame at a time)
                           → normalised observations → Tracker
                           → announcement gate → stereo/HRTF tone + browser speech
                           → accessible React UI

Optional device check → independent XR session → CPU depth / GPU buffer availability
                                               + optional raw camera shader/readPixels

Optional examples → labelled photo → same YOLOE-26s worker → example-qualified speech

Explicit Describe scene → one JPEG → Express → Gemini → text description
```

- `client/src/contracts.ts`: provider and observation interfaces. Timestamps use the browser monotonic clock. Detection confidence and depth validity are separate.
- `vision.ts`: provider/tracking utilities. The detector consumes the full camera frame without crop or mirroring, resizes with letterboxing to 640 × 640, and reverses that transform for normalized boxes. Preview follows the intrinsic aspect ratio with `object-fit: contain`. Camera-left is x < .38; camera-right is x > .62. Frozen frames never refresh stale observations.
- `Tracker`: matching labels and box overlap associate observations; detections missing from the current frame are dropped immediately. Tracks expire after 2.5 seconds. There is no inference queue; processing uses the latest frame at a modest target rate.
- The bounded 2.5-second capture-age limit accommodates model execution and short speech. A label is checked again before speech starts; missing objects, changed directions, Pause and backgrounding cancel it. This avoids cutting a normal CPU-result cue off immediately after its tone while still rejecting stale results.
- Openings are prioritized before the eight-object display/audio limit, so many higher-scoring people cannot crowd them out. Overlap suppression only compares identical classes or confusable opening alternatives; a detected person standing in front of a returned door does not remove the door.
- `audio.ts`, `voices.ts`: left = stereo pan -1, centre = 0, right = +1. A softer short tone precedes unpanned speech at a default rate of 0.9. Installed English voices are preferred and checked on every utterance, so asynchronous voice loading is supported. Status, observations and scene descriptions use the same voice settings. A changed scene or Pause cancels pending cues and speech. Meaningfully unchanged objects are suppressed. Pace is a minimum interval, not a promise of an announcement every N seconds.
- `liveVision.ts`, `live.worker.ts`, `liveContract.ts`: fixed prompts baked into one pretrained model, WebGPU with single-threaded WASM fallback, same-origin weights/runtime, one in-flight request, and generation guards on cancellation. `gates.ts` validates scores/boxes and suppresses duplicates and higher-scoring overlapping fence/window/wall alternatives. Gate and door synonyms map to one spoken label each. Scores are not calibrated probabilities. Results retain capture timestamps; three consecutive expired results stop sensing with spoken retry guidance. `GateScan.tsx` is only a labelled example gallery; the former `/gates` route redirects to normal sensing.
- `probe.ts`: requires `camera-access` and `depth-sensing` together. It samples the browser-owned texture into an application-owned framebuffer before readback. Pixel variation is evidence of readback, **not** proof of detector alignment. `getDepthInMeters` applies the API’s normalised-view-to-depth transform; raw buffers are never indexed as if they were camera pixels. Multiple centre samples reject missing and mixed depth. Optical-axis depth and Euclidean range are distinct; range utilities are tested but not used for live estimates.
- `server/`: strict validation, bounded JPEG payloads, server-side API key, timeout, rate limiting, optional PostgreSQL preferences scoped to verified JWT subjects. Camera images are not stored or logged.

## Optional Gemini setup

Copy `server/.env.example` to `server/.env` and put `GEMINI_API_KEY` there locally. Never commit keys or put them in a `VITE_` variable. Restart the server and reload the page; Describe scene becomes available. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; use a model available to your project. A Gemini request can incur provider usage charges; no account or paid service is created by the app.

For a private single-device run, use `npm run build`, `npm start`, then http://localhost:3001. The app and API share that address; **Describe scene** sends one snapshot and reads the returned description aloud in the selected guidance voice. Pausing/backgrounding cancels speech and ignores a late scene response. GitHub Pages hosts only the frontend, so the private key configured on a local computer does **not** enable Gemini on the public Pages link. An HTTPS backend is needed to enable it there.

On 2 October 2026, a user-supplied key was saved only in the ignored local environment file. A real request through the local backend returned HTTP 200 with a description of the bundled public gate photo. The key is not included in the repository or browser build; recreating Gemini requires your own local key. Real PostgreSQL remains unconfigured and is not required.

For an optional Android-only developer setup, [Termux](https://github.com/termux/termux-app#installation) provides an Android terminal and Node.js packages. Install it from its official instructions, install `git` and `nodejs-lts`, clone this repository, then use the same npm installation/model/build/start commands and a local `server/.env`. Open http://localhost:3001 in Chrome on **that same phone**. This avoids a hosting account or second-device LAN camera origin, but this installation has **not been verified on the Nord CE5**; Android may stop background processes. The public HTTPS camera/audio app is the simpler option when scene descriptions are not needed.

The request deliberately sends one JPEG only when the button is tapped. Detections are supplied as fallible structured context. Prompt instructions prohibit invented distances and navigability claims, but generated content can still be wrong. Responses render as plain React text, not HTML.

Environment variables:

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | server | API port; default 3001 |
| `HOST` | server | Default `127.0.0.1` for one-device use; hosted deployment can set `0.0.0.0` |
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

- [YOLOE-26s](https://docs.ultralytics.com/models/yoloe/) by Ultralytics, **AGPL-3.0**. [Pretrained checkpoint](https://github.com/ultralytics/assets/releases/download/v8.4.0/yoloe-26s-seg.pt) exported with Ultralytics 8.4.171 as a detection-only 640 px FP32 ONNX graph. [Full model licence](client/public/live-models/LICENSE), [provenance and SHA-256](client/public/live-models/provenance.json), and [export source](scripts/export-live-model.py) are included. No training or Python inference server is used.
- [ONNX Runtime 1.30.0](https://github.com/microsoft/onnxruntime/tree/v1.30.0) by Microsoft, MIT. Its [licence](client/public/onnxruntime-LICENSE) is included. Previous MediaPipe and captured-image Grounding DINO runtimes are removed.
- [WebXR Raw Camera Access specification](https://immersive-web.github.io/raw-camera-access/), [WebXR Depth Sensing specification](https://www.w3.org/TR/webxr-depth-sensing-1/), and [Google’s ARCore device list](https://developers.google.com/ar/devices). Nord CE5 is listed for Depth API; browser compatibility and phone behaviour require separate tests.
- [Gemini generateContent API](https://ai.google.dev/api/generate-content).
- React, Vite, React Router, Tailwind CSS, Express, Zod, and the other dependencies retain their respective licences. [Lucide icons](https://lucide.dev/license), ISC.

The application source is [MIT](LICENSE); the model and photos retain their separate licences. The complete application and export source is available in this repository and linked in the app's Quick guide.

## Optional developer model export

Normal recreation uses the committed ONNX and npm only. To regenerate the export, create a Python 3.12 environment, install CPU `torch==2.10.0` and `torchvision==0.25.0` from the official PyTorch CPU index, then install `scripts/model-export-requirements.txt`. Run `python scripts/export-live-model.py` from the repository root. It downloads the pinned official checkpoint and MobileCLIP text encoder, bakes the documented prompts into the detector, checks the ONNX graph and writes weights/provenance into `client/public/live-models`. Allow about 2 GB of free development disk space; none of these Python packages or text-encoder weights are needed on the phone.
