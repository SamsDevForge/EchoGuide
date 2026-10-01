import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  DoorOpen,
  ImagePlus,
  Info,
  LoaderCircle,
  Pause,
  RotateCcw,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { AudioGuide } from "./audio";
import { defaults } from "./contracts";
import type { Preferences } from "./contracts";
import { VideoProvider } from "./vision";
import { gateCandidates, gatePhrase } from "./gates";
import type { GateCandidate, GateWorkerResponse } from "./gates";

type Snapshot = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  url: string;
  timestamp: number;
  capturedAt: string;
  source: "camera" | "photo" | "example";
  example?: "gate" | "door";
};
const examples = {
  gate: {
    file: "gate-entrance.jpg",
    title: "gate",
    author: "Steve Hillebrand / U.S. Fish and Wildlife Service",
    url: "https://commons.wikimedia.org/wiki/File:Entrance_gate_metal_gate.jpg",
    license: "Public domain",
    licenseUrl:
      "https://commons.wikimedia.org/wiki/File:Entrance_gate_metal_gate.jpg",
  },
  door: {
    file: "door-building.jpg",
    title: "building door",
    author: "Poldo2018",
    url: "https://commons.wikimedia.org/wiki/File:Door_in_a_building.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
};
function spokenFor(candidate: GateCandidate, captured: Snapshot) {
  return `${captured.source === "example" ? "Example photo. " : ""}${gatePhrase(candidate)}`;
}
function snapshotFrom(
  image: CanvasImageSource,
  width: number,
  height: number,
  source: Snapshot["source"],
): Snapshot {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(960, width);
  canvas.height = Math.round((canvas.width * height) / width);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image capture is unavailable.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
    url: canvas.toDataURL("image/jpeg", 0.85),
    timestamp: performance.now(),
    capturedAt: new Date().toLocaleTimeString(),
    source,
  };
}
function savedPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem("echoguide.preferences") ?? "{}");
    return {
      volume:
        typeof p.volume === "number" && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(1, p.volume))
          : defaults.volume,
      announcementIntervalMs: defaults.announcementIntervalMs,
      spatialMode: p.spatialMode === "hrtf" ? "hrtf" : "stereo",
    };
  } catch {
    return defaults;
  }
}
export default function GateScan() {
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef(new VideoProvider());
  const audio = useRef(new AudioGuide());
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<
    "idle" | "camera" | "preview" | "checking" | "results"
  >("idle");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [candidates, setCandidates] = useState<GateCandidate[]>([]);
  const [message, setMessage] = useState("Choose a camera image to check.");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState(
    "Gate and door directions will be spoken here.",
  );
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  function cancel() {
    generation.current++;
    camera.current.stop();
    audio.current.cancel();
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState("idle");
    setSnapshot(null);
    setCandidates([]);
    setInferenceMs(null);
    setProgress(null);
    setError("");
    setMessage("Check paused. Open the camera or choose another photo.");
    setAnnouncement("Check paused.");
  }
  function stopPendingCheck() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (state === "checking") {
      worker.current?.terminate();
      worker.current = null;
    }
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      generation.current++;
      camera.current.stop();
      audio.current.dispose();
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function openCamera() {
    generation.current++;
    const token = generation.current;
    stopPendingCheck();
    audio.current.cancel();
    camera.current.stop();
    setState("idle");
    setError("");
    setSnapshot(null);
    setCandidates([]);
    setInferenceMs(null);
    setProgress(null);
    setAnnouncement("Camera image not yet captured.");
    setMessage("Allow the rear camera, then point it toward a gate or door.");
    try {
      await audio.current.unlock();
      if (token !== generation.current) return;
      await camera.current.start(video.current!);
      if (token !== generation.current) return;
      setState("camera");
    } catch (e) {
      if (token !== generation.current) return;
      setState("idle");
      setError(
        e instanceof Error
          ? e.message
          : "Camera unavailable. You can use a photo.",
      );
    }
  }
  async function choosePhoto(file: File) {
    generation.current++;
    const token = generation.current;
    stopPendingCheck();
    camera.current.stop();
    audio.current.cancel();
    setState("idle");
    setSnapshot(null);
    setError("");
    setCandidates([]);
    setInferenceMs(null);
    setProgress(null);
    setAnnouncement("Photo not yet checked.");
    setMessage("Opening the selected photo…");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 10 MB.");
      const image = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      try {
        const captured = snapshotFrom(
          image,
          image.width,
          image.height,
          "photo",
        );
        if (token !== generation.current) return;
        setSnapshot(captured);
        setState("preview");
        setMessage("Photo selected. Tap Check this image.");
      } finally {
        image.close();
      }
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "This photo could not be opened. Try JPEG or PNG.",
        );
    }
  }
  async function chooseExample(name: "gate" | "door") {
    const token = ++generation.current;
    stopPendingCheck();
    camera.current.stop();
    audio.current.cancel();
    setState("idle");
    setSnapshot(null);
    setCandidates([]);
    setInferenceMs(null);
    setProgress(null);
    setError("");
    setAnnouncement("Example photo not yet checked.");
    setMessage("Opening the example photo…");
    try {
      const image = new Image();
      image.src = `${import.meta.env.BASE_URL}examples/${examples[name].file}`;
      await image.decode();
      if (token !== generation.current) return;
      const captured = snapshotFrom(
        image,
        image.naturalWidth,
        image.naturalHeight,
        "example",
      );
      setSnapshot({ ...captured, example: name });
      setState("preview");
      setMessage(
        "Example photo selected. Tap Check this image. This is not your camera view.",
      );
    } catch {
      if (token === generation.current)
        setError(
          "Example photo unavailable. Use the camera or choose your own photo.",
        );
    }
  }
  async function analyse(captured: Snapshot) {
    const id = ++generation.current;
    audio.current.cancel();
    setError("");
    setSnapshot(captured);
    setCandidates([]);
    setState("checking");
    setInferenceMs(null);
    setProgress(null);
    setMessage("Loading the gate detector. First use may take a minute.");
    setAnnouncement("Checking this captured image.");
    camera.current.stop();
    try {
      await audio.current.unlock();
      if (id !== generation.current) return;
      const active =
        worker.current ??
        new Worker(new URL("./gate.worker.ts", import.meta.url), {
          type: "module",
        });
      worker.current = active;
      const fail = (text: string) => {
        if (id !== generation.current) return;
        if (timer.current) clearTimeout(timer.current);
        active.terminate();
        worker.current = null;
        setState("preview");
        setError(text);
        setMessage(
          "Gate check unavailable. You can retry or return to local object sensing.",
        );
      };
      active.onerror = () =>
        fail(
          "The gate detector could not run in this browser. Try current Chrome and close other heavy tabs.",
        );
      active.onmessage = (event: MessageEvent<GateWorkerResponse>) => {
        const data = event.data;
        if (data.id !== generation.current) return;
        if (data.type === "status") {
          setMessage(data.message);
          setProgress(data.progress ?? null);
          return;
        }
        if (data.type === "error") {
          fail(`Gate check failed: ${data.message}`);
          return;
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setProgress(null);
        const found = gateCandidates(data.predictions, captured.timestamp);
        setCandidates(found);
        setInferenceMs(Math.round(data.inferenceMs));
        setState("results");
        setMessage(
          found.length
            ? "Candidates in this captured image. Exit use is unconfirmed."
            : "No gate, door, or exit-sign candidate found. This does not establish that there is no exit.",
        );
        if (found.length) {
          audio.current.say(
            found[0],
            savedPreferences(),
            setAnnouncement,
            spokenFor(found[0], captured),
          );
        } else {
          setAnnouncement("No candidate found in this image.");
        }
      };
      timer.current = setTimeout(
        () =>
          fail(
            "The gate check timed out. The initial model download needs a reliable connection.",
          ),
        180000,
      );
      const pixels = new Uint8ClampedArray(captured.pixels);
      active.postMessage(
        { id, pixels, width: captured.width, height: captured.height },
        [pixels.buffer],
      );
    } catch (e) {
      if (id !== generation.current) return;
      setState("preview");
      setError(e instanceof Error ? e.message : "Gate detection unavailable.");
    }
  }
  function capture() {
    try {
      const frame = camera.current.frame(true);
      if (!frame)
        throw new Error(
          "No fresh camera image. Allow camera access and try again.",
        );
      void analyse(
        snapshotFrom(frame.image, frame.width, frame.height, "camera"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image capture failed.");
    }
  }
  async function repeat(candidate: GateCandidate) {
    const token = generation.current;
    try {
      await audio.current.unlock();
      if (token === generation.current && snapshot)
        audio.current.say(
          candidate,
          savedPreferences(),
          setAnnouncement,
          spokenFor(candidate, snapshot),
        );
    } catch {
      if (token === generation.current)
        setError("Audio could not start. Try again from a direct button tap.");
    }
  }
  const busy = state === "checking";
  return (
    <main className="main narrow gate-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> Back to sensing
      </Link>
      <p className="eyebrow">GATES, DOORS & POSSIBLE EXIT SIGNS</p>
      <h1>Find an opening.</h1>
      <p className="intro">
        Check one image for visible gates and doors, then hear their left,
        centre, or right position. The camera image stays on your device.
      </p>
      <section className="panel gate-capture">
        <div className="panel-heading">
          <h2>
            <DoorOpen size={20} /> Gate & door check
          </h2>
          <span className="status-pill">
            {state === "camera"
              ? "Camera preview"
              : busy
                ? "Checking image"
                : snapshot
                  ? snapshot.source === "example"
                    ? "Example photo"
                    : "Captured image"
                  : "Camera off"}
          </span>
        </div>
        <div className="gate-examples">
          <span>Example photos · not a live camera view</span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void chooseExample("gate")}
          >
            Try gate example
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void chooseExample("door")}
          >
            Try door example
          </button>
        </div>
        {snapshot?.example && (
          <p className="gate-credit">
            Example {examples[snapshot.example].title} photo by{" "}
            <a href={examples[snapshot.example].url}>
              {examples[snapshot.example].author}
            </a>{" "}
            ·{" "}
            <a href={examples[snapshot.example].licenseUrl}>
              {examples[snapshot.example].license}
            </a>
            . Source image unmodified.
          </p>
        )}
        <p className="gate-download-note">
          First use downloads an additional gate model (about 204 MB plus
          runtime files). Further checks use the cached model. This check is
          slower than live object sensing.
        </p>
        <div
          className="gate-image"
          style={
            snapshot
              ? { aspectRatio: snapshot.width / snapshot.height }
              : undefined
          }
        >
          <video
            ref={video}
            muted
            playsInline
            style={{ display: state === "camera" ? "block" : "none" }}
            aria-label="Rear camera for gate check"
          />
          {snapshot ? (
            <>
              <img
                src={snapshot.url}
                alt="Captured image being checked for gates and doors"
              />
              <div className="bounding-layer" aria-hidden="true">
                {candidates.map((c) => (
                  <div
                    className="bounding-box"
                    key={c.trackId}
                    style={{
                      left: `${c.box.x * 100}%`,
                      top: `${c.box.y * 100}%`,
                      width: `${c.box.width * 100}%`,
                      height: `${c.box.height * 100}%`,
                    }}
                  >
                    <span>Possible {c.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : state !== "camera" ? (
            <div className="gate-placeholder">
              <DoorOpen size={44} />
              <p>Frame a gate or door.</p>
              <small>You can also check a photo.</small>
            </div>
          ) : null}
        </div>
        <div className="gate-controls">
          {state === "camera" ? (
            <button className="button primary" onClick={capture}>
              <Camera size={18} /> Capture & check
            </button>
          ) : snapshot ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void analyse(snapshot)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <DoorOpen size={18} />
              )}{" "}
              {busy ? "Checking…" : "Check this image"}
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => void openCamera()}
            >
              <Camera size={18} /> Open rear camera
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={18} /> Use a photo
          </button>
          <button className="button pause-button" onClick={cancel}>
            <Pause size={18} />
            {busy ? "Cancel check" : "Pause"}
          </button>
          <input
            className="sr-only"
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a gate or door photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void choosePhoto(file);
              e.target.value = "";
            }}
          />
        </div>
        {snapshot && state !== "checking" && (
          <button className="text-button" onClick={() => void openCamera()}>
            <RotateCcw size={15} /> Take another camera image
          </button>
        )}
        <p className="gate-state" role="status">
          {message}
          {progress !== null ? ` ${Math.round(progress)}%` : ""}
        </p>
        {busy && progress !== null && (
          <progress
            max="100"
            value={progress}
            aria-label="Gate model loading progress"
          />
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
      {snapshot && (
        <section className="panel gate-results">
          <h2>
            <DoorOpen size={18} />{" "}
            {snapshot.source === "example"
              ? "Example photo"
              : snapshot.source === "photo"
                ? "Selected photo"
                : "Captured camera image"}{" "}
            · {snapshot.capturedAt}
          </h2>
          <p className="panel-subtitle">
            Directions refer to this image. Take another image after moving the
            phone.
          </p>
          {candidates.map((c) => (
            <div className="object-row" key={c.trackId}>
              <span className="object-icon">
                <DoorOpen size={21} />
              </span>
              <div>
                <strong>Possible {c.label}</strong>
                <small>Exit unconfirmed · distance unavailable</small>
              </div>
              <span className="direction">
                {c.direction === "left"
                  ? "↖"
                  : c.direction === "right"
                    ? "↗"
                    : "↑"}{" "}
                {c.direction}
              </span>
              <button
                className="icon-button"
                aria-label={`Hear possible ${c.label} ${c.direction}`}
                onClick={() => void repeat(c)}
              >
                <Volume2 size={18} />
              </button>
            </div>
          ))}
          <p className="note" aria-live="polite">
            {announcement}
          </p>
          {inferenceMs !== null && (
            <details>
              <summary>Gate check diagnostics</summary>
              <pre className="diagnostics">
                {JSON.stringify(
                  {
                    model: "Grounding DINO Tiny · q8",
                    mode: "captured image",
                    source: snapshot.source,
                    example: snapshot.example ?? null,
                    inferenceMs,
                    candidates: candidates.map((c) => ({
                      label: c.label,
                      score: c.score,
                      direction: c.direction,
                      box: c.box,
                    })),
                    exitVerified: false,
                    distanceMetres: null,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </section>
      )}
      <section className="bottom-note">
        <Info size={20} />
        <p>
          <strong>A visible gate or door is an exit candidate.</strong> It may
          be locked, closed, or lead elsewhere. An exit-sign candidate is a
          visual match; its text and arrow are not verified. Confirm the actual
          exit with a sighted person in the controlled indoor demo.
        </p>
      </section>
      <p className="privacy-note">
        <ShieldCheck size={16} /> All gate checks run locally. No login or AI
        API key needed.
      </p>
    </main>
  );
}
