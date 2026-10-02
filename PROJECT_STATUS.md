# EchoGuide project status

Started: 2026-09-29 11:56 IST. Workspace was empty.

## Decisions and ownership
- Lead: root manifests/lockfile, client, camera/depth contracts, probe, integration and delivery.
- GPT-6 Sol (medium), backend worker: server/** only. No nested delegation.
- User clarified that gates and doors must be announced automatically by normal Start sensing, with no separate captured-image workflow.
- One local YOLOE-26s detection-only ONNX handles person/chair/backpack/gate/door. Fixed prompts include metal/wooden/generic gates and building/generic doors; alternatives suppress overlapping false openings. Model, provenance, licences and export source are committed for npm-only recreation.
- Removed the previous MediaPipe and Grounding DINO runtimes. The old /gates route redirects to sensing. A labelled /examples gallery uses the same live worker.
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
- Passed root type checking, 42 automated tests (33 client + 9 server), production builds; runtime audit found zero known issues.
- Verified all five live class IDs, model SHA-256, one in-flight frame, stop/retry and automatic gate/door speech. Capture timestamps are preserved; the bounded 2.5-second expiry accommodates short cues without silently accepting unlimited delay.
- Browser demo, Pause, calibration, Escape and unsupported XR state checked.
- Gate and door examples passed actual browser WebGPU inference; gate also passed the CPU fallback. The rejected nano model missed the gate. Current phone inference/audio tests remain pending; previous captured-image model evidence is in Git history.
- Published to https://github.com/SamsDevForge/EchoGuide and https://samsdevforge.github.io/EchoGuide/.
- Fresh GitHub Actions installation, checks and deployment passed. Public app/model/WASM assets returned HTTP 200.
- Final frame-freshness/rotation fix verified; source formatted for maintenance and reproduction.
- User has phone test URL/procedure; no physical results reported yet. See docs/COMPLETION.md.
