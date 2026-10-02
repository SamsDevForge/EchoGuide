# EchoGuide delivery record

Delivered source: https://github.com/SamsDevForge/EchoGuide

HTTPS app: https://samsdevforge.github.io/EchoGuide/

Device check: https://samsdevforge.github.io/EchoGuide/probe

## Implemented

- Guest mobile workflow with one local detector for people, chairs, backpacks, gates and building doors.
- Automatic gate/door directional announcements in Start sensing; no capture/check workflow, account or API key required. Startup, pause and failure guidance are spoken.
- Softer camera-relative stereo tones followed by gentle browser speech, installed voice selection/preview, speaking speed, calibration, Repeat, volume/pace preferences, and immediate Pause.
- Live boxes and observation tracking, expiry, scene-change cancellation, camera-start cancellation, and background pause.
- Optional depth check with required depth and optional raw camera access, CPU samples or GPU buffer availability, tracking/error diagnostics, automatic completion, and cancellation. Its depth is never mixed with a separate camera stream.
- Separate labelled audio demonstration for unsupported devices.
- Private local Gemini scene descriptions with spoken results, one-address frontend/API serving, PostgreSQL/JWT/bcrypt account APIs, validation, limits, and timeouts.
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

- User reported depth failures on Nord CE5 and other tested phones on 2 October 2026. The revised depth check has not yet passed on those phones; exact browser/runtime failure remains unresolved without copied diagnostics. Camera/CV performance, earbud separation, latency and sustained-session behaviour remain unverified.
- First browser use loads the single 38.2 MB model plus about 26.8 MB of runtime. Phone accuracy and speed await physical testing. A gate/door match does not confirm an exit, unlock state or route; exit signs/text/arrows are not classified.
- Live object distance is unavailable. Same-session centre depth is diagnostic only; no aligned object-depth provider is enabled.
- Gemini returned a real scene description through the local backend with the user-supplied key. The key remains in the ignored local environment file. GitHub Pages has no backend, so the public app's scene control remains hidden until an HTTPS backend is configured. Real PostgreSQL remains unconfigured; accounts are not needed.
- No native Android module, PWA offline cache, head tracking, or comprehensive obstacle detection.

To recreate locally: `git clone`, `npm ci`, `npm run models`, `npm run dev`. The README contains complete commands and optional configuration.
