# EchoGuide delivery record

Delivered source: https://github.com/SamsDevForge/EchoGuide

HTTPS app: https://samsdevforge.github.io/EchoGuide/

Device check: https://samsdevforge.github.io/EchoGuide/probe

## Implemented

- Guest mobile workflow with one local detector for people, chairs, backpacks, gates and building doors.
- Automatic gate/door directional announcements in Start sensing; no capture/check workflow, account or API key required. Startup, pause and failure guidance are spoken.
- Camera-relative stereo tones followed by short browser speech, calibration, Repeat, volume/pace preferences, and immediate Pause.
- Live boxes and observation tracking, expiry, scene-change cancellation, camera-start cancellation, and background pause.
- Capability probe for rear camera, simultaneous XR raw camera/depth, actual readback and depth samples, and copied diagnostics.
- Separate labelled audio demonstration for unsupported devices.
- Optional backend Gemini scene descriptions, PostgreSQL/JWT/bcrypt account APIs, validation, limits, and timeouts.
- Reproducible npm lockfile/setup, deployment workflow, architecture and attribution, demo script and recording checklist.

## Verified locally on 2 October 2026

- Type checking and production builds passed locally. GitHub Actions repeats these checks on every push before deployment.
- Automated client/provider/audio tests and backend tests passed; see [TESTING.md](TESTING.md) for counts and coverage.
- GitHub Pages deployment completed. Public app, pretrained model, and WASM/JavaScript assets returned HTTP 200.
- Desktop browser demonstration, sample announcement UI, Pause, calibration controls, keyboard dismissal, navigation and unsupported XR error checked.
- Actual same-model gate and building-door example inference passed in the desktop browser. Automatic opening speech, one in-flight frame and stop/retry behavior are covered by integration tests. See [TESTING.md](TESTING.md).
- Mobile layout checked at 390 × 844. This is layout emulation, not a physical-device test.
- Committed model metadata contains all five live classes and gate/door synonyms; the asset-preparation script verifies its SHA-256.
- Runtime npm audit reported zero known vulnerabilities.

## Remaining or deliberately unavailable

- Actual Nord CE5 camera/CV performance, earbud channel separation, measured latency, sustained-session behaviour and XR capabilities await physical testing.
- First browser use loads the single 38.2 MB model plus about 26.8 MB of runtime. Phone accuracy and speed await physical testing. A gate/door match does not confirm an exit, unlock state or route; exit signs/text/arrows are not classified.
- Live object distance is unavailable. Same-session centre depth is diagnostic only; no aligned object-depth provider is enabled.
- Gemini and real PostgreSQL are unverified without credentials. The single-device workflow requires neither. The scene-description control is hidden when Gemini is unavailable.
- No native Android module, PWA offline cache, head tracking, or comprehensive obstacle detection.

To recreate locally: `git clone`, `npm ci`, `npm run models`, `npm run dev`. The README contains complete commands and optional configuration.
