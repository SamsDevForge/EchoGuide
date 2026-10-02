# EchoGuide validation

## Automated checks

Run from the repository root after installing dependencies:

```sh
npm run typecheck
npm test
npm run build
```

The server suite validates guest health without credentials, clear missing-integration errors, JPEG/request-size validation, scene rate limiting, Gemini REST payload construction, upstream error privacy, and optional account hashing/authentication/preference isolation. Gemini replies and the account repository are test doubles: these tests do not establish cloud availability or actual PostgreSQL connectivity.

Server TypeScript checking, production compilation, and all **9 server API tests** passed on the development computer on 29 September 2026. The password-hashing integration test permits 30 seconds to accommodate slower hosts; the successful run completed the suite in about 7 seconds. Browser and physical device checks are separate from automated checks; record the final root-workspace check output alongside this checklist.

On **2 October 2026**, root type checking and production builds passed, with **33 client tests and 9 server tests passing**. Coverage includes all five live classes, normalized directions, opening alternatives/duplicate suppression, preserved capture timestamps, one in-flight frame, worker stop/retry, automatic gate/door speech through live candidates → tracker → audio, opening priority, spoken status, stale-speech cancellation, late camera-permission cancellation, and frozen frames. Runtime dependency audit reported zero known vulnerabilities. The prior 204 MB captured-image model has been removed.

Desktop browser checks confirmed the labelled audio demo, sample cue updates, Pause clearing objects, stereo calibration controls, Escape dismissal, route navigation, and the explicit unsupported immersive-AR result. These observations establish interface behaviour only; actual earbud audio and target-phone camera/depth performance remain pending.

### Current live model smoke images

The committed YOLOE-26s fixed-prompt ONNX was exercised through the actual browser UI on 2 October 2026. The optional example gallery uses the same worker, 640 px letterbox preprocessing and filters as live sensing. These examples establish that the integration returns both labels; they do not establish detection accuracy or phone performance. The smaller YOLOE-26n trial missed the gate example and was rejected.

| Photo | Desktop browser WebGPU result | Limitation |
| --- | --- | --- |
| [Entrance gate metal gate](https://commons.wikimedia.org/wiki/File:Entrance_gate_metal_gate.jpg), bundled gate example | Possible gate, left, score .342; 877 ms inference. | A clear, selected example. |
| [Door in a building](https://commons.wikimedia.org/wiki/File:Door_in_a_building.jpg), bundled door example | Possible door, centre, score .635; 625 ms inference. | A clear, selected example. |

Scores are not calibrated probabilities. Timings exclude download, initialization and preprocessing; they are not camera-to-audio or phone latency. Bundled photos have visible attribution and explicit example labels; see [photo licences](../client/public/examples/ATTRIBUTION.md).

The forced single-threaded WASM fallback (`/examples?runtime=wasm`) also returned gate, left, score .342, in 1,120 ms on this desktop. This checks a real CPU path rather than relying on GPU availability. The 2.5-second capture-age bound allows normal model execution plus the brief cue; labels that expire during the tone are discarded before speech.

The final production CPU build returned door, centre, score .587, in 1,185 ms. Start/cancel/restart controls and spoken pause confirmation were checked in the production UI; a camera permission prompt in the desktop test browser prevented a physical live-camera recognition check. The phone-width document measured 375 px with no horizontal overflow. Tests also retain a returned door under an overlapping person and retain a gate when ten higher-scoring people fill the frame.

The visible example announcement starts “Example photo.” The normal feed uses “Possible gate, left.” / “Possible door, centre.” automatically. Automated integration tests verify these feed announcements and priority over ordinary objects; physical live-camera gate recognition and perceived earbud direction remain pending. The old captured-image model's October 1 timings and overgrown field-gate miss are retained in Git history, and do not describe this model.

Pause during loading terminates the worker and rejects the pending request; late readiness/results are ignored and a new instance can retry. Current frames expire after 2.5 seconds. Results are never re-stamped on arrival, and stale frames cannot produce queued speech. Three consecutive slow results stop sensing with spoken retry guidance.

GitHub Actions also passed fresh dependency installation, model preparation, checks and deployment. The public HTTPS app and its model/WASM assets returned HTTP 200. The mobile layout was inspected at 390 × 844 without horizontal overflow; this is viewport emulation, not phone verification.

## Physical checklist

Use a stationary, supervised indoor setup on the target OnePlus Nord CE5 with paired open-ear earbuds. Run each relevant case on the actual phone, record the outcome, and retain copied device diagnostics. All physical results below are **pending**, not passed.

| Check | Procedure and evidence | Current result |
| --- | --- | --- |
| Secure context and camera | Open the HTTPS app in Chrome; allow rear camera; verify a forward-facing live preview and record its reported resolution/facing mode. | Pending |
| Permission rejection/recovery | Deny camera access, confirm an understandable error, restore permission, and retry Start sensing. | Pending |
| Local model startup | Prepare the model/assets, start sensing, and verify that actual recognition begins. Repeat with the backend offline to establish local detection independence. | Pending |
| Selected classes | Present a person, chair, and backpack separately, then together. Record misses/false detections and confidence across well-lit, dim, partially occluded, and cluttered scenes. | Pending |
| Gates and building doors | Tap Start sensing once. Present metal/wooden gates and building doors, including open/closed, partial, dim and cluttered examples. Confirm automatic speech without another action. Include fences, windows and blank walls as negatives. Record misses and false positives. These are possible openings, never confirmed exits. | Pending |
| Opening direction and cancellation | Position openings on camera left/centre/right and confirm short automatic announcements. Pause during startup and inference, then retry. Switch apps and confirm no late result/speech. Record download, initialization, inference and total wait separately. | Pending |
| Direction and tracking | Move each object between image left, centre, and right while phone/head orientation stays aligned. Confirm directional labels and coherent tracking. Image direction is not a world bearing. | Pending |
| Earbud stereo routing | Turn mono audio off; play calibration left/centre/right at comfortable volume. Confirm perceived direction on the paired earbuds and repeat after reconnecting. | Pending |
| Tone/speech ordering | Confirm that a brief directional tone precedes a comprehensible spoken label. Check volume zero, moderate volume, and supported speech voice. | Pending |
| Announcement pacing | Select each pace. Check that stable observations do not repeatedly announce and changed observations wait for the configured minimum spacing. | Pending |
| Stale observations | Remove an object and interrupt the stream; verify old cards and queued speech clear. Check a change while speech is active. | Pending |
| Pause/background/recovery | Pause, switch apps, lock the phone, then return. Confirm camera/audio stop and a deliberate Start resumes cleanly. Repeat Start/Pause several times. | Pending |
| End-to-end latency | Record an object entering the frame and the resulting audio on a second device/video. Measure frame-entry-to-tone onset and frame-entry-to-spoken-label onset across at least 20 trials; report median and worst observed delay, selected pace, and device conditions. Diagnostics inference time is only model execution time. | Pending |
| Sustained operation | Run a supervised stationary session for 10 minutes. Record heat, battery change, freezes, speech overlap, and recovery behavior. | Pending |
| Experimental XR/depth | Run Device check's XR + depth test for its full duration. Copy JSON; inspect readable pixels, valid depth frames, and simultaneous frames. API availability alone is insufficient. | Pending |
| Depth alignment/accuracy | If XR yields data, compare known measured targets and camera/depth coordinates under near/far, edge, occlusion, and invalid-depth cases. Live distance stays unavailable until a valid aligned provider is integrated and validated. | Pending |
| Missing Gemini configuration | With no key, confirm the optional scene control stays hidden and local sensing works. | Pending |
| Optional Gemini | If configured, tap Describe scene and check a visible-content-only short response; test timeout/service errors and ensure no distances or navigability claims. A single JPEG is sent to the backend and Gemini. | Pending |

## Result record

```text
Date/time:
Phone / Android / Chrome:
Earbuds / mono audio setting:
App revision and HTTPS URL:
Selected audio mode / pace / volume:
Camera / XR / depth copied JSON:
Recognition observations and failures:
Latency trials, median, worst observed:
Pause/background/stale-data results:
Sustained-session results:
Optional Gemini result or Not configured:
Unresolved issues:
Tester:
```

Do not use an empty detection list, one working cue, or an XR feature flag as evidence of route safety, dependable audio routing, or valid depth measurements.
