# EchoGuide delivery record

Delivered source: https://github.com/SamsDevForge/EchoGuide

HTTPS app: https://samsdevforge.github.io/EchoGuide/

Device check: https://samsdevforge.github.io/EchoGuide/probe

## Implemented

- Guest mobile workflow with local person, chair, and backpack detection.
- Local captured-image checks for gates, building doors and possible exit signs, with image-relative directions and qualified speech; no accounts or API key required.
- Camera-relative stereo tones followed by short browser speech, calibration, Repeat, volume/pace preferences, and immediate Pause.
- Live boxes and observation tracking, expiry, scene-change cancellation, camera-start cancellation, and background pause.
- Capability probe for rear camera, simultaneous XR raw camera/depth, actual readback and depth samples, and copied diagnostics.
- Separate labelled audio demonstration for unsupported devices.
- Optional backend Gemini scene descriptions, PostgreSQL/JWT/bcrypt account APIs, validation, limits, and timeouts.
- Reproducible npm lockfile/setup, deployment workflow, architecture and attribution, demo script and recording checklist.

## Verified on 1 October 2026

- Type checking and production builds passed locally and on a fresh GitHub Actions runner.
- Automated client/provider/audio tests and backend tests passed; see [TESTING.md](TESTING.md) for counts and coverage.
- GitHub Pages deployment completed. Public app, pretrained model, and WASM/JavaScript assets returned HTTP 200.
- Desktop browser demonstration, sample announcement UI, Pause, calibration controls, keyboard dismissal, navigation and unsupported XR error checked.
- Actual production-worker gate and building-door example inference passed in the desktop browser. Loading/inference cancellation and restart passed. The overgrown field-gate miss is recorded in [TESTING.md](TESTING.md).
- Mobile layout checked at 390 × 844. This is layout emulation, not a physical-device test.
- Downloaded model metadata confirmed all three requested labels.
- Runtime npm audit reported zero known vulnerabilities.

## Remaining or deliberately unavailable

- Actual Nord CE5 camera/CV performance, earbud channel separation, measured latency, sustained-session behaviour and XR capabilities await physical testing.
- Gate/door checks require an additional approximately 204 MB model plus browser runtime downloads. Phone accuracy, initial loading time and inference speed await physical testing. An opening or sign match does not confirm an exit, unlock state, route, or readable arrow/text.
- Live object distance is unavailable. Same-session centre depth is diagnostic only; no aligned object-depth provider is enabled.
- Gemini and real PostgreSQL are unverified without credentials. The single-device workflow requires neither. The public static app has no deployed backend and its scene-description control explains this limitation.
- No native Android module, PWA offline cache, head tracking, or comprehensive obstacle detection.

To recreate locally: `git clone`, `npm ci`, `npm run models`, `npm run dev`. The README contains complete commands and optional configuration.
