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

On **1 October 2026**, root type checking and production builds passed, with **21 client tests and 9 server tests passing**. Client coverage includes left/right mapping, rejection of sparse/mixed depth, range conversion, track expiry, duplicate announcement suppression, stale-speech cancellation, late camera-permission cancellation, frozen camera frames, and left-right-left changes before speech starts. Gate coverage includes score/box validation, suppression by higher-scoring fence/window/wall alternatives, candidate limits, image-relative directions, unavailable distance, and qualified snapshot speech. Runtime dependency audit reported zero known vulnerabilities.

Desktop browser checks confirmed the labelled audio demo, sample cue updates, Pause clearing objects, stereo calibration controls, Escape dismissal, route navigation, and the explicit unsupported immersive-AR result. These observations establish interface behaviour only; actual earbud audio and target-phone camera/depth performance remain pending.

### Gate model smoke images

The pinned Grounding DINO Tiny q8 model was exercised locally on real photos on 1 October 2026, using the same comma-separated caption and default 800 × 800 processor as the browser worker. These few images establish that the integration can return gate/door labels; they do not establish detection accuracy.

| Photo | Desktop Node result | Limitation |
| --- | --- | --- |
| [Entrance gate metal gate](https://commons.wikimedia.org/wiki/File:Entrance_gate_metal_gate.jpg), bundled gate example | Gate, left, score .415; about 11 seconds of inference with one CPU thread. | A clear, selected example. |
| [Door in a building](https://commons.wikimedia.org/wiki/File:Door_in_a_building.jpg), bundled door example | Door, centre, score .425; about 11 seconds of inference with one CPU thread. | A clear, selected example. |
| [Overgrown metal gate into a field](https://commons.wikimedia.org/wiki/File:Metal_gate_into_a_field_-_geograph.org.uk_-_186685.jpg) | Fence scored .511, above the overlapping gate score .485; the filter suppressed the gate. | Known missed gate; fence/gate ambiguity remains. |

Scores are model similarities, not probabilities. Node timings exclude loading and are not browser or phone latency. Bundled photos have visible attribution and explicit example labels; see [photo licences](../client/public/examples/ATTRIBUTION.md).

The production browser worker also returned **gate, left** (score .417, 23,458 ms inference) on the gate example and **door, centre** (score .438, 19,867 ms inference) on the building-door example. The visible announcement included “Example photo” and “in this image. Exit unconfirmed.” This verifies actual WASM inference through the UI, not a mocked result. Desktop timing excludes download/initialisation and does not establish phone performance or perceived earbud direction.

Cancellation was exercised during initial loading and during a subsequent cached-model inference. Both cleared the image/results and returned to the paused state. A new check after cancellation returned the door candidate successfully. At a 390 × 844 viewport, the gate controls and result cards remained readable without horizontal overflow; this is layout emulation only.

GitHub Actions also passed fresh dependency installation, model preparation, checks and deployment. The public HTTPS app and its model/WASM assets returned HTTP 200. The mobile layout was inspected at 390 × 844 without horizontal overflow; this is viewport emulation, not phone verification.

## Physical checklist

Use a stationary, supervised indoor setup on the target OnePlus Nord CE5 with paired open-ear earbuds. Run each relevant case on the actual phone, record the outcome, and retain copied device diagnostics. All physical results below are **pending**, not passed.

| Check | Procedure and evidence | Current result |
| --- | --- | --- |
| Secure context and camera | Open the HTTPS app in Chrome; allow rear camera; verify a forward-facing live preview and record its reported resolution/facing mode. | Pending |
| Permission rejection/recovery | Deny camera access, confirm an understandable error, restore permission, and retry Start sensing. | Pending |
| Local model startup | Prepare the model/assets, start sensing, and verify that actual recognition begins. Repeat with the backend offline to establish local detection independence. | Pending |
| Selected classes | Present a person, chair, and backpack separately, then together. Record misses/false detections and confidence across well-lit, dim, partially occluded, and cluttered scenes. | Pending |
| Gates and building doors | Open Gates & doors; capture metal/wooden gates and building doors, including open/closed, partial, dim and cluttered examples. Include fences, windows and blank walls as negative examples. Record candidates, misses and false positives. These are possible openings, never confirmed exits. | Pending |
| Gate directions and cancellation | Place an opening on image left/centre/right. Confirm the spoken image qualifier and position, repeat, then start another check and cancel it. Switch apps during download/inference. Confirm no late result/speech; capture again after moving the phone. Record initial download, inference and total wait times separately. | Pending |
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
| Missing Gemini configuration | With no key, confirm optional scene control explains its unavailability and local sensing continues. | Pending |
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
