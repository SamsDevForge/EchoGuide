# EchoGuide project status

Started: 2026-09-29 11:56 IST. Workspace was empty.

## Decisions and ownership
- Lead: root manifests/lockfile, client, camera/depth contracts, probe, integration and delivery.
- GPT-6 Sol (medium), backend worker: server/** only. No nested delegation.
- Live mode uses local MediaPipe EfficientDet-Lite0; guest access works without accounts.
- User requested both gates and building doors. Added a separate local Grounding DINO Tiny q8 captured-image worker; detection is a possible opening, never a certified exit. Lead owns UI/assets; Sol worker owns gate filtering tests and fixture research.
- Default camera provider has no metric distance. Experimental XR requires same-session readable camera pixels and actual CPU depth. No unverified alignment is presented as distance.
- Stereo tones precede ordinary browser speech. Directions are camera-relative.
- No competing native implementation; target phone must be tested before claiming XR depth support.

## Commands
- npm install
- npm run models
- npm run dev
- npm run typecheck && npm test && npm run build

## Blockers
- GitHub access works outside the network sandbox. Remote: SamsDevForge/EchoGuide, public, initially empty.
- User clarified: no accounts required, one-device guest workflow, reproducible through GitHub.
- Optional PostgreSQL and Gemini credentials absent; guest workflow needs neither.
- Physical phone and earbud tests await user.

## Next steps
- Implemented camera sensing, audio, probe, optional backend and deployment files.
- Passed root type checking, 30 automated tests, production builds; runtime audit found zero known issues after adding the patched Transformers.js 4.3.0 runtime.
- Confirmed model labels in downloaded labels.txt: person, chair, backpack.
- Browser demo, Pause, calibration, Escape and unsupported XR state checked.
- Gate/door examples passed actual production browser WASM inference; loading/inference cancellation, recovery and phone-width layout checked. An overgrown field gate remains a known miss; phone inference/audio tests are pending.
- Published to https://github.com/SamsDevForge/EchoGuide and https://samsdevforge.github.io/EchoGuide/.
- Fresh GitHub Actions installation, checks and deployment passed. Public app/model/WASM assets returned HTTP 200.
- Final frame-freshness/rotation fix verified; source formatted for maintenance and reproduction.
- User has phone test URL/procedure; no physical results reported yet. See docs/COMPLETION.md.
