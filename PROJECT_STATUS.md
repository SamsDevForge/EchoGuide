# EchoGuide project status

Started: 2026-09-29 11:56 IST. Workspace was empty.

## Decisions and ownership
- Lead: root manifests/lockfile, client, camera/depth contracts, probe, integration and delivery.
- GPT-6 Sol (medium), backend worker: server/** only. No nested delegation.
- Live mode uses local MediaPipe EfficientDet-Lite0; guest access works without accounts.
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
- Passed root type checking, 23 automated tests, production builds; runtime audit found zero known issues.
- Confirmed model labels in downloaded labels.txt: person, chair, backpack.
- Browser demo, Pause, calibration, Escape and unsupported XR state checked.
- Finish HTTPS deployment and public asset smoke tests, record links and physical-test instructions.
