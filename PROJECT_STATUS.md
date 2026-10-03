# EchoGuide project status

Started: 2026-09-29 11:56 IST. Workspace was empty.

## Decisions and ownership
- Lead: root manifests/lockfile, client, camera/depth contracts, probe, integration and delivery.
- GPT-6 Sol (medium), backend worker: server/** only. No nested delegation.
- User clarified that gates and doors must be announced automatically by normal Start sensing, with no separate captured-image workflow.
- One local YOLOE-26s detection-only ONNX handles person/chair/backpack/gate/door. Fixed prompts include metal/wooden/generic gates and building/generic doors; alternatives suppress overlapping false openings. Model, provenance, licences and export source are committed for npm-only recreation.
- Removed the previous MediaPipe and Grounding DINO runtimes. The old /gates route redirects to sensing. A labelled /examples gallery uses the same live worker.
- Default camera provider has no metric distance. Revised experimental XR requires depth with raw camera optional, so unsupported raw access cannot mask CPU depth. GPU-only buffers are labelled without metric samples. Same-session pixels and depth are still required for future object distances; no unverified alignment is presented as distance.
- Softer stereo tones precede gentle browser speech, with installed English voice selection, speed and preview. Directions are camera-relative.
- No competing native implementation; target phone must be tested before claiming XR depth support.

## Commands
- npm install
- npm run models
- npm run dev
- npm run typecheck && npm test && npm run build

## Blockers
- GitHub access works outside the network sandbox. Remote: SamsDevForge/EchoGuide, public, initially empty.
- User clarified: no accounts required, one-device guest workflow, reproducible through GitHub.
- Gemini key configured only in ignored local server/.env; actual local scene request returned HTTP200. PostgreSQL remains unconfigured. Guest sensing requires neither.
- User reported depth failure on Nord CE5 and other tested phones. Exact diagnostics and success of the revised probe await the user; other physical phone/earbud tests remain unverified.

## Next steps
- Implemented camera sensing, audio, probe, optional backend and deployment files.
- Passed type checking, 73 automated tests (61 client + 12 server), and production builds on 3 October 2026. Dependencies unchanged; earlier runtime audit found zero known issues.
- Verified all five live class IDs, model SHA-256, one in-flight frame, stop/retry and automatic gate/door speech. Capture timestamps are preserved; the bounded 2.5-second expiry accommodates short cues without silently accepting unlimited delay.
- Browser demo, Pause, calibration, Escape and unsupported XR state checked.
- Gate and door examples passed actual browser WebGPU inference; gate also passed the CPU fallback. The rejected nano model missed the gate. Current phone inference/audio tests remain pending; previous captured-image model evidence is in Git history.
- Published to https://github.com/SamsDevForge/EchoGuide and https://samsdevforge.github.io/EchoGuide/.
- Fresh GitHub Actions installation, checks and deployment passed. Public app/model/WASM assets returned HTTP 200.
- Final frame-freshness/rotation fix verified; source formatted for maintenance and reproduction.
- User has phone test URL/procedure; depth failures are recorded, and the revised probe needs a real-phone rerun. See docs/COMPLETION.md.
- Gentle voice, voice preview/selection and improved independent AR depth checks implemented. Tests cover installed/late/fallback voices, tracking/depth absence and stale session cancellation.
- Built frontend and private API now share localhost:3001 via npm start, loopback by default. Describe scene speaks its real response and ignores late responses after Pause. Public Pages still has no scene backend.
- Main controls now precede the collapsed preview; large labelled controls, screen-reader output without competing app speech, persistent Pause, native modal isolation and explicit focus restoration are implemented. Display choices persist across routes and reloads. Fresh view summaries, gate/door focus, on-request guidance, status reading and optional session-only voice commands are included. Desktop keyboard/AX and 375-pixel large-text/high-contrast layouts were checked; actual TalkBack and microphone/phone verification remain pending.
