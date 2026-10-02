import { useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  AudioLines,
  ArrowLeft,
  ArrowUpRight,
  Backpack,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Ear,
  Eye,
  Headphones,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Volume2,
  X,
  Armchair,
  Activity,
  DoorOpen,
} from "lucide-react";
import type { Direction, Observation, Preferences } from "./contracts";
import { defaults } from "./contracts";
import { AudioGuide } from "./audio";
import { availableGuidanceVoices, selectGuidanceVoice } from "./voices";
import { Tracker, TRACK_TTL, VideoProvider } from "./vision";
import { LiveVision, LIVE_LABELS } from "./liveVision";
import { api } from "./api";
import { depthFailure, newReport, XRProbe } from "./probe";
import GateScan from "./GateScan";

function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem("echoguide.preferences") ?? "{}");
    return {
      volume:
        typeof p.volume === "number" && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(1, p.volume))
          : defaults.volume,
      announcementIntervalMs: [3000, 5000, 8000].includes(
        p.announcementIntervalMs,
      )
        ? p.announcementIntervalMs
        : defaults.announcementIntervalMs,
      spatialMode: p.spatialMode === "hrtf" ? "hrtf" : "stereo",
      voiceURI:
        typeof p.voiceURI === "string" && p.voiceURI.length < 300
          ? p.voiceURI
          : "",
      speechRate: [0.8, 0.9, 1, 1.1].includes(p.speechRate)
        ? p.speechRate
        : defaults.speechRate,
    };
  } catch {
    return defaults;
  }
}
function useGuidanceVoices() {
  const [voices, setVoices] = useState(availableGuidanceVoices);
  useEffect(() => {
    const refresh = () => setVoices(availableGuidanceVoices());
    const synthesis = window.speechSynthesis;
    synthesis?.addEventListener("voiceschanged", refresh);
    refresh();
    return () => synthesis?.removeEventListener("voiceschanged", refresh);
  }, []);
  return voices;
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function Brand() {
  return (
    <Link className="brand" to="/" aria-label="EchoGuide home">
      <span className="brand-mark">
        <AudioLines size={23} />
      </span>
      echo<span>guide</span>
      <span className="beta">PROTOTYPE</span>
    </Link>
  );
}
function App() {
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <NavLink to="/" end>
              <ScanLine size={17} /> Sensing
            </NavLink>
            <NavLink to="/probe">
              <Activity size={17} /> Device check
            </NavLink>
            <NavLink to="/guide">
              <Info size={17} /> Quick guide
            </NavLink>
          </nav>
          <span className="guest">
            <span /> Guest mode
          </span>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Sensing />} />
        <Route path="/probe" element={<Probe />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/gates" element={<Navigate to="/" replace />} />
        <Route path="/examples" element={<GateScan />} />
        <Route path="*" element={<Guide />} />
      </Routes>
      <footer>
        <span>
          <AudioLines size={16} /> A little more awareness. One sound at a time.
        </span>
        <span>
          AI for Smart Mobility <i>·</i> Indoor prototype
        </span>
      </footer>
    </>
  );
}
function Calibration({
  audio,
  prefs,
  onClose,
}: {
  audio: AudioGuide;
  prefs: Preferences;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [active, setActive] = useState<Direction | null>(null);
  const [tested, setTested] = useState<Direction[]>([]);
  async function cue(direction: Direction) {
    await audio.unlock();
    audio.cancel();
    audio.tone(direction, prefs);
    setActive(direction);
    setTested((t) => [...new Set([...t, direction])]);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const buttons =
          dialog.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      audio.cancel();
      previous?.focus();
    };
  }, [audio]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calibration-title"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          autoFocus
          className="icon-button close"
          aria-label="Close calibration"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="feature-icon">
          <Headphones />
        </div>
        <p className="eyebrow">MAKE YOURSELF COMFORTABLE</p>
        <h2 id="calibration-title">Find your left and right.</h2>
        <p>
          Pair your earbuds, turn off mono audio in your phone’s accessibility
          settings, and try each cue at a comfortable volume.
        </p>
        <div className="cue-grid">
          {(["left", "centre", "right"] as Direction[]).map((d) => (
            <button
              className={active === d ? "cue selected" : "cue"}
              key={d}
              onClick={() => void cue(d)}
            >
              <Volume2 />
              <strong>{d}</strong>
              <small>{tested.includes(d) ? "Played" : "Tap to listen"}</small>
            </button>
          ))}
        </div>
        <p className="note">
          You should hear left in your left ear, right in your right ear, and
          centre in both. Spoken labels play normally after the directional
          tone.
        </p>
        <button className="button primary full" onClick={onClose}>
          Done <Check size={18} />
        </button>
      </section>
    </div>
  );
}
function Sensing() {
  const video = useRef<HTMLVideoElement>(null);
  const provider = useRef<VideoProvider | null>(null);
  const detector = useRef<LiveVision | null>(null);
  const tracker = useRef(new Tracker());
  const audio = useRef(new AudioGuide());
  const running = useRef(false);
  const generation = useRef(0);
  const frameId = useRef(0);
  const latest = useRef<Observation[]>([]);
  const [state, setState] = useState<
    "idle" | "loading" | "live" | "demo" | "paused"
  >("idle");
  const [error, setError] = useState("");
  const [objects, setObjects] = useState<Observation[]>([]);
  const [prefs, setPrefs] = useState(readPreferences);
  const voices = useGuidanceVoices();
  const selectedVoice = selectGuidanceVoice(voices, prefs.voiceURI);
  const prefRef = useRef(prefs);
  const [calibrate, setCalibrate] = useState(false);
  const [announcement, setAnnouncement] = useState(
    "Your next observation will appear here.",
  );
  const [inference, setInference] = useState<number | null>(null);
  const [scene, setScene] = useState("");
  const [describing, setDescribing] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [gemini, setGemini] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const [loadingMessage, setLoadingMessage] = useState(
    "Getting sensing ready…",
  );
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => {
    prefRef.current = prefs;
    try {
      localStorage.setItem("echoguide.preferences", JSON.stringify(prefs));
    } catch {
      /* Session-only preferences remain usable. */
    }
  }, [prefs]);
  useEffect(() => {
    void api<{ geminiConfigured: boolean }>("/health")
      .then((h) => setGemini(h.geminiConfigured))
      .catch(() => setGemini(false));
  }, []);
  function pause(message = "Sensing paused. Tap Start when you’re ready.") {
    generation.current++;
    running.current = false;
    cancelAnimationFrame(frameId.current);
    provider.current?.stop();
    provider.current = null;
    detector.current?.stop();
    detector.current = null;
    tracker.current.clear();
    audio.current.cancel();
    latest.current = [];
    setObjects([]);
    setState("paused");
    setAnnouncement(message);
    setInference(null);
    setDescribing(false);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden)
        pause("Paused because the app moved to the background.");
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      generation.current++;
      running.current = false;
      cancelAnimationFrame(frameId.current);
      provider.current?.stop();
      detector.current?.stop();
      audio.current.dispose();
    };
  }, []);
  async function start() {
    pause();
    setError("");
    setScene("");
    setState("loading");
    setDevice(null);
    setLoadingMessage("Getting sensing ready…");
    const token = generation.current;
    const camera = new VideoProvider();
    provider.current = camera;
    try {
      await audio.current.unlock();
      if (token !== generation.current) return;
      audio.current.status(
        "Starting sensing. Allow camera access if asked.",
        prefRef.current,
        setAnnouncement,
      );
      if (!video.current) throw new Error("Camera preview unavailable.");
      const localDetector = new LiveVision((message) => {
        if (token === generation.current) setLoadingMessage(message);
      });
      detector.current = localDetector;
      let cameraReady = false;
      const cameraStart = camera.start(video.current).then(() => {
        cameraReady = true;
      });
      const modelStart = localDetector.load().then(() => {
        if (token === generation.current && !cameraReady) {
          setLoadingMessage("Please allow camera access in your browser.");
          audio.current.status(
            "Please allow camera access in your browser.",
            prefRef.current,
            setAnnouncement,
          );
        }
      });
      await Promise.all([cameraStart, modelStart]);
      if (token !== generation.current) return;
      setDevice(localDetector.device);
      if (token !== generation.current) {
        camera.stop();
        return;
      }
      const track = (
        video.current.srcObject as MediaStream
      ).getVideoTracks()[0];
      track.addEventListener(
        "ended",
        () => {
          if (running.current) {
            pause("Camera interrupted. Tap Start to reconnect.");
            setError("Camera access ended.");
            audio.current.status(
              "Camera interrupted. Tap Start to reconnect.",
              prefRef.current,
              setAnnouncement,
            );
          }
        },
        { once: true },
      );
      setAspect(video.current.videoWidth / video.current.videoHeight || 4 / 3);
      running.current = true;
      setState("live");
      audio.current.status(
        "Sensing started.",
        prefRef.current,
        setAnnouncement,
      );
      let last = 0;
      let lastFrameAt = performance.now();
      let checking = false;
      let staleFrames = 0;
      const loop = (time: number) => {
        if (!running.current || token !== generation.current) return;
        frameId.current = requestAnimationFrame(loop);
        if (time - last < 300) return;
        last = time;
        latest.current = latest.current.filter(
          (o) => time - o.timestamp <= TRACK_TTL,
        );
        setObjects(latest.current);
        audio.current.update(latest.current, prefRef.current, setAnnouncement);
        const frame = camera.frame();
        if (!frame) {
          if (time - lastFrameAt > TRACK_TTL) {
            latest.current = [];
            setObjects([]);
            audio.current.cancel();
          }
          if (time - lastFrameAt > 5000) {
            pause("Camera stopped providing frames. Tap Start to retry.");
            setError("Camera stream interrupted.");
            audio.current.status(
              "Camera interrupted. Tap Start to reconnect.",
              prefRef.current,
              setAnnouncement,
            );
          }
          return;
        }
        lastFrameAt = time;
        setAspect(frame.width / frame.height || 4 / 3);
        if (checking) return;
        checking = true;
        void localDetector
          .detect(frame)
          .then((result) => {
            if (!running.current || token !== generation.current) return;
            setInference(Math.round(result.inferenceMs));
            setDevice(localDetector.device);
            // Never re-stamp an old frame as current, or build a frame queue.
            if (performance.now() - frame.timestamp > TRACK_TTL) {
              if (++staleFrames >= 3) {
                pause();
                setError(
                  "This device is taking too long to check current frames. Close other apps and retry.",
                );
                audio.current.status(
                  "Sensing is too slow on this device. Close other apps and tap Start again.",
                  prefRef.current,
                  setAnnouncement,
                );
              }
              return;
            }
            staleFrames = 0;
            latest.current = tracker.current.update(
              result.candidates,
              frame.timestamp,
            );
            setObjects(latest.current);
            audio.current.update(
              latest.current,
              prefRef.current,
              setAnnouncement,
            );
          })
          .catch((e) => {
            if (token !== generation.current) return;
            pause();
            setError(`Detection stopped: ${errorText(e)}`);
            audio.current.status(
              "Sensing stopped. Tap Start to retry.",
              prefRef.current,
              setAnnouncement,
            );
          })
          .finally(() => {
            checking = false;
          });
      };
      frameId.current = requestAnimationFrame(loop);
    } catch (e) {
      camera.stop();
      if (token === generation.current) {
        pause();
        setError(errorText(e));
        audio.current.status(
          "Sensing could not start. Check camera permission and your connection, then tap Start again.",
          prefRef.current,
          setAnnouncement,
        );
      }
    }
  }
  async function demo() {
    pause();
    setError("");
    setScene("");
    const token = generation.current;
    await audio.current.unlock();
    if (token !== generation.current) return;
    setState("demo");
    setAnnouncement(
      "Audio demonstration. These are sample objects, not live detections.",
    );
  }
  function demoCue(label: string, direction: Direction) {
    const o: Observation = {
      timestamp: performance.now(),
      trackId: `demo-${label}`,
      label,
      score: 1,
      box: {
        x: direction === "left" ? 0.1 : direction === "right" ? 0.7 : 0.4,
        y: 0.25,
        width: 0.2,
        height: 0.5,
      },
      direction,
      horizontalPosition:
        direction === "left" ? 0.2 : direction === "right" ? 0.8 : 0.5,
      distanceMetres: null,
      depthSource: "none",
      depthState: "unavailable",
    };
    setObjects([o]);
    audio.current.say(o, prefs, setAnnouncement);
  }
  async function describe() {
    if (!video.current || !running.current) return;
    const token = generation.current;
    setDescribing(true);
    setScene("");
    audio.current.status(
      "Describing this view.",
      prefRef.current,
      setAnnouncement,
    );
    try {
      const frame = provider.current?.frame(true);
      if (!frame) throw new Error("Camera frame unavailable.");
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(768, frame.width);
      canvas.height = Math.round((canvas.width * frame.height) / frame.width);
      canvas
        .getContext("2d")!
        .drawImage(frame.image, 0, 0, canvas.width, canvas.height);
      const result = await api<{ description: string }>("/scene", {
        imageBase64: canvas.toDataURL("image/jpeg", 0.72).split(",")[1],
        mimeType: "image/jpeg",
        observations: latest.current
          .filter((o) => performance.now() - o.timestamp <= TRACK_TTL)
          .map((o) => ({
            label: o.label,
            confidence: o.score,
            position: o.direction === "centre" ? "center" : o.direction,
          })),
      });
      if (token !== generation.current || !running.current) return;
      setScene(result.description);
      audio.current.status(
        result.description,
        prefRef.current,
        setAnnouncement,
      );
    } catch (e) {
      if (token !== generation.current || !running.current) return;
      setScene(errorText(e));
      audio.current.status(
        `Scene description unavailable. ${errorText(e)}`,
        prefRef.current,
        setAnnouncement,
      );
    } finally {
      if (token === generation.current) setDescribing(false);
    }
  }
  const isActive = state === "live" || state === "demo" || state === "loading";
  return (
    <main className="main">
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-line" /> YOUR SURROUNDINGS, THROUGH SOUND
          </p>
          <h1>Hear what’s here.</h1>
          <p>Point your camera forward. Let the little details come to you.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            pause();
            setCalibrate(true);
          }}
        >
          <Headphones size={18} /> Calibrate earbuds <ArrowUpRight size={15} />
        </button>
      </section>
      <div className="workspace">
        <div className="left-column">
          <section className="camera-card">
            <div className="card-toolbar">
              <span>
                <Camera size={17} /> Camera view
              </span>
              <span
                className={`status-pill ${state === "live" ? "green" : ""}`}
              >
                <span />
                {state === "live"
                  ? "Live sensing"
                  : state === "loading"
                    ? "Starting camera"
                    : state === "demo"
                      ? "Audio demo"
                      : "Camera off"}
              </span>
            </div>
            <div
              className={`viewfinder ${state === "live" ? "is-live" : ""}`}
              style={state === "live" ? { aspectRatio: aspect } : undefined}
            >
              <video
                ref={video}
                muted
                playsInline
                aria-label="Live rear camera preview"
                className={state === "live" ? "visible" : ""}
              />
              {state === "live" && (
                <div className="bounding-layer" aria-hidden="true">
                  {objects.map((o) => (
                    <div
                      className="bounding-box"
                      key={o.trackId}
                      style={{
                        left: `${o.box.x * 100}%`,
                        top: `${o.box.y * 100}%`,
                        width: `${o.box.width * 100}%`,
                        height: `${o.box.height * 100}%`,
                      }}
                    >
                      <span>
                        {o.label} · {Math.round(o.score * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {state !== "live" && (
                <div className="camera-placeholder">
                  <div
                    className={`radar ${state === "loading" ? "loading" : ""}`}
                  >
                    <div className="radar-ring ring-one" />
                    <div className="radar-ring ring-two" />
                    <div className="radar-ring ring-three" />
                    <div className="radar-centre">
                      {state === "loading" ? (
                        <LoaderCircle className="spin" size={30} />
                      ) : state === "demo" ? (
                        <Headphones size={30} />
                      ) : (
                        <ScanLine size={30} />
                      )}
                    </div>
                    <span className="radar-dot dot-one" />
                    <span className="radar-dot dot-two" />
                  </div>
                  <h2>
                    {state === "loading"
                      ? "Getting your camera ready…"
                      : state === "demo"
                        ? "Explore the sound."
                        : state === "paused"
                          ? "Take your time."
                          : "A new way to notice."}
                  </h2>
                  <p>
                    {state === "loading"
                      ? loadingMessage
                      : state === "demo"
                        ? "Sample cues only. Your camera is off."
                        : state === "paused"
                          ? "Your camera and audio are paused."
                          : "Start sensing to hear people, chairs, backpacks, gates, and doors."}
                  </p>
                  {state === "demo" && (
                    <div className="demo-cues">
                      <button onClick={() => demoCue("person", "left")}>
                        Person · left
                      </button>
                      <button onClick={() => demoCue("chair", "centre")}>
                        Chair · centre
                      </button>
                      <button onClick={() => demoCue("backpack", "right")}>
                        Backpack · right
                      </button>
                      <button onClick={() => demoCue("gate", "left")}>
                        Gate · left
                      </button>
                      <button onClick={() => demoCue("door", "centre")}>
                        Door · centre
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="viewfinder-corners" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="camera-bottom">
                <span>
                  <ShieldCheck size={14} /> Processed on your device
                </span>
                <span>{state === "demo" ? "SAMPLE AUDIO" : "REAR CAMERA"}</span>
              </div>
            </div>
            <div className="camera-actions">
              <button
                className={`button ${isActive ? "pause-button" : "primary"} start-button`}
                onClick={() => {
                  if (isActive) {
                    pause();
                    audio.current.status(
                      "Sensing paused.",
                      prefRef.current,
                      setAnnouncement,
                    );
                  } else void start();
                }}
              >
                {isActive ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
                {state === "loading"
                  ? "Cancel start"
                  : isActive
                    ? "Pause sensing"
                    : "Start sensing"}
              </button>
              <button
                className="button icon-button repeat"
                aria-label="Repeat current observation"
                disabled={state !== "live" || !objects.length}
                onClick={() => {
                  const item = latest.current.find(
                    (o) => performance.now() - o.timestamp <= TRACK_TTL,
                  );
                  if (item) audio.current.say(item, prefs, setAnnouncement);
                }}
              >
                <RotateCcw size={20} />
              </button>
            </div>
            {error && (
              <div className="error-message" role="alert">
                {error}{" "}
                <button onClick={() => void demo()}>Try audio demo</button>
              </div>
            )}
          </section>
          <section className="announcement">
            <div className="announcement-icon">
              <AudioLines size={24} />
            </div>
            <div>
              <p className="eyebrow">
                {state === "demo" ? "DEMONSTRATION CUE" : "LATEST ANNOUNCEMENT"}
              </p>
              <p aria-live="polite" aria-atomic="true">
                {announcement}
              </p>
            </div>
            <span className="mini-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </section>
          <div className="privacy-note">
            <ShieldCheck size={16} />
            <p>
              {gemini ? (
                <>
                  Live sensing stays on your device. Only{" "}
                  <strong>Describe scene</strong> sends a single photo for an AI
                  description.
                </>
              ) : (
                "Live sensing stays on your device. Camera images are not uploaded."
              )}
            </p>
          </div>
        </div>
        <aside className="right-column">
          <section className="panel observations">
            <div className="panel-heading">
              <h2>
                <Eye size={19} /> In view
              </h2>
              <span className="count">{objects.length}</span>
            </div>
            <p className="panel-subtitle">
              {state === "demo"
                ? "Sample object · not a live detection"
                : "Recently observed, camera-relative"}
            </p>
            <div className="object-list">
              {objects.length ? (
                objects.map((o) => (
                  <div className="object-row" key={o.trackId}>
                    <span className="object-icon">
                      {o.label === "person" ? (
                        <UserRound />
                      ) : o.label === "chair" ? (
                        <Armchair />
                      ) : o.label === "gate" || o.label === "door" ? (
                        <DoorOpen />
                      ) : (
                        <Backpack />
                      )}
                    </span>
                    <div>
                      <strong>
                        {o.label === "gate" || o.label === "door"
                          ? `Possible ${o.label}`
                          : o.label}
                      </strong>
                      <small>
                        {o.distanceMetres === null
                          ? "Distance unavailable"
                          : `About ${o.distanceMetres.toFixed(1)} m`}
                      </small>
                    </div>
                    <span className="direction">
                      {o.direction === "left"
                        ? "↖"
                        : o.direction === "right"
                          ? "↗"
                          : "↑"}{" "}
                      {o.direction}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-objects">
                  <div className="empty-icon">
                    <ScanLine size={25} />
                  </div>
                  <strong>
                    {state === "live"
                      ? "No selected objects detected"
                      : "Ready when you are"}
                  </strong>
                  <p>
                    {state === "live"
                      ? "This does not mean the path is clear."
                      : "Objects will appear here once you start sensing."}
                  </p>
                </div>
              )}
            </div>
            <div className="depth-note">
              <span className="amber-dot" />
              <div>
                <strong>Distance unavailable</strong>
                <p>Object names and directions work without depth.</p>
              </div>
              <Link to="/probe" aria-label="Check distance capability">
                <Info size={17} />
              </Link>
            </div>
          </section>
          <section className="panel listening">
            <div className="panel-heading">
              <h2>
                <SlidersHorizontal size={19} /> Your listening preferences
              </h2>
            </div>
            <label className="slider-label" htmlFor="volume">
              <span>
                <Volume2 size={17} /> Volume
              </span>
              <strong>{Math.round(prefs.volume * 100)}%</strong>
            </label>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={prefs.volume}
              onChange={(e) =>
                setPrefs({ ...prefs, volume: Number(e.target.value) })
              }
            />
            <label className="frequency-label" htmlFor="frequency">
              Announcement pace
            </label>
            <select
              id="frequency"
              value={prefs.announcementIntervalMs}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  announcementIntervalMs: Number(e.target.value),
                })
              }
            >
              <option value={3000}>Frequent · at least 3 seconds apart</option>
              <option value={5000}>Balanced · at least 5 seconds apart</option>
              <option value={8000}>Relaxed · at least 8 seconds apart</option>
            </select>
            <p className="setting-hint">
              Only new or meaningfully changed observations are announced.
            </p>
            <label className="frequency-label" htmlFor="voice">
              Guidance voice
            </label>
            <select
              id="voice"
              value={
                voices.some((v) => v.voiceURI === prefs.voiceURI)
                  ? prefs.voiceURI
                  : ""
              }
              onChange={(e) => setPrefs({ ...prefs, voiceURI: e.target.value })}
            >
              <option value="">Automatic · recommended device voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
            <p className="setting-hint">
              {selectedVoice
                ? `Using ${selectedVoice.name}.`
                : "Uses your device's speech voice."}{" "}
              Voice quality depends on the voices installed on your phone.
            </p>
            <label className="frequency-label" htmlFor="speech-speed">
              Speaking speed
            </label>
            <select
              id="speech-speed"
              value={prefs.speechRate ?? 0.9}
              onChange={(e) =>
                setPrefs({ ...prefs, speechRate: Number(e.target.value) })
              }
            >
              <option value={0.8}>Slow</option>
              <option value={0.9}>Gentle · default</option>
              <option value={1}>Normal</option>
              <option value={1.1}>Slightly faster</option>
            </select>
            <button
              className="button secondary voice-preview"
              onClick={() =>
                audio.current.status(
                  "Take your time. Possible door, centre.",
                  prefs,
                  setAnnouncement,
                )
              }
            >
              <Volume2 size={17} /> Preview guidance voice
            </button>
            <details>
              <summary>
                <Settings2 size={14} /> Audio mode
              </summary>
              <label className="sr-only" htmlFor="mode">
                Spatial audio mode
              </label>
              <select
                id="mode"
                value={prefs.spatialMode}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    spatialMode: e.target.value as Preferences["spatialMode"],
                  })
                }
              >
                <option value="stereo">Stereo · left / centre / right</option>
                <option value="hrtf">Spatial HRTF · experimental</option>
              </select>
            </details>
          </section>
          {gemini && (
            <section className="scene-panel">
              <div className="scene-icon">
                <Sparkles size={20} />
              </div>
              <div>
                <h2>A little more context.</h2>
                <p>
                  {gemini
                    ? "Get a brief AI description of one camera snapshot."
                    : "Optional AI scene descriptions need a backend Gemini key."}
                </p>
              </div>
              <button
                className="button scene-button full"
                disabled={!gemini || state !== "live" || describing}
                onClick={() => void describe()}
              >
                {describing ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                {describing ? "Describing…" : "Describe scene"}
                <ArrowUpRight size={16} />
              </button>
              {scene && (
                <p className="scene-result" role="status">
                  {scene}
                </p>
              )}
              <small>
                {gemini
                  ? "One photo sent only when you tap."
                  : "Local sensing works without this feature."}
              </small>
            </section>
          )}
        </aside>
      </div>
      <section className="bottom-note">
        <Info size={19} />
        <p>
          <strong>A companion for awareness.</strong> For stationary, supervised
          indoor use. Only selected visible objects are detected; this is not a
          navigation or obstacle-avoidance system. A detected gate or door may
          be locked or lead elsewhere; it is not a confirmed exit.
        </p>
        <Link to="/guide">
          Know the limits <ChevronRight size={16} />
        </Link>
      </section>
      <div className="utility-row">
        <button className="text-button" onClick={() => void demo()}>
          <Headphones size={15} /> Try the audio demo
        </button>
        <Link className="text-button" to="/examples">
          Try detector example photos
        </Link>
        <button
          className="text-button"
          onClick={() => setDiagnostics(!diagnostics)}
        >
          <Activity size={15} /> {diagnostics ? "Hide" : "Show"} diagnostics
        </button>
      </div>
      {diagnostics && (
        <pre className="diagnostics">
          {JSON.stringify(
            {
              mode: state,
              provider: "getUserMedia",
              depth: "unavailable (no aligned XR depth)",
              model: "YOLOE-26s · fixed prompts",
              device,
              classes: LIVE_LABELS,
              inferenceMs: inference,
              inferenceNote:
                "Inference duration only; not camera-to-audio latency",
              objects: objects.map((o) => ({
                id: o.trackId,
                label: o.label,
                score: o.score,
              })),
              secureContext: window.isSecureContext,
            },
            null,
            2,
          )}
        </pre>
      )}
      {calibrate && (
        <Calibration
          audio={audio.current}
          prefs={prefs}
          onClose={() => setCalibrate(false)}
        />
      )}
    </main>
  );
}
function Probe() {
  const [report, setReport] = useState(newReport);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [calibrate, setCalibrate] = useState(false);
  const [copied, setCopied] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef(new VideoProvider());
  const xr = useRef(new XRProbe());
  const audio = useRef(new AudioGuide());
  const root = useRef<HTMLDivElement>(null);
  const testGeneration = useRef(0);
  const checkingDepth =
    report.phase === "requesting" || report.phase === "running";
  function stopTests() {
    testGeneration.current++;
    camera.current.stop();
    xr.current.stop();
    setBusy(false);
    setReport((r) => ({
      ...r,
      phase:
        r.phase === "requesting" || r.phase === "running"
          ? "cancelled"
          : r.phase,
      xr:
        r.phase === "requesting" || r.phase === "running"
          ? "Depth check stopped"
          : r.xr,
      centreDepthMetres: null,
    }));
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        stopTests();
        audio.current.cancel();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      testGeneration.current++;
      camera.current.stop();
      xr.current.stop();
      audio.current.dispose();
    };
  }, []);
  async function cameraTest() {
    stopTests();
    const token = testGeneration.current;
    setError("");
    setBusy(true);
    try {
      await camera.current.start(video.current!);
      if (token !== testGeneration.current) return;
      const track = (
        video.current!.srcObject as MediaStream
      ).getVideoTracks()[0];
      const s = track.getSettings();
      setReport((r) => ({
        ...r,
        camera: `Granted · ${s.facingMode ?? "facing direction unreported"} · ${s.width} × ${s.height}`,
        checkedAt: new Date().toISOString(),
      }));
    } catch (e) {
      if (token !== testGeneration.current) return;
      setError(errorText(e));
      setReport((r) => ({ ...r, camera: `Failed: ${errorText(e)}` }));
    } finally {
      if (token === testGeneration.current) setBusy(false);
    }
  }
  async function xrTest() {
    stopTests();
    const token = testGeneration.current;
    setBusy(true);
    setError("");
    try {
      await xr.current.start(report, setReport, root.current!);
    } catch (e) {
      if (token !== testGeneration.current) return;
      setError(depthFailure(e));
      audio.current.status(
        "Depth is unavailable. Camera and voice guidance can still work.",
        readPreferences(),
        () => {},
      );
    } finally {
      if (token === testGeneration.current) setBusy(false);
    }
  }
  return (
    <main className="main narrow" ref={root}>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Back to sensing
      </Link>
      <p className="eyebrow">ON YOUR ACTUAL PHONE</p>
      <h1>Meet your device.</h1>
      <p className="intro">
        Check your camera and listening cues here. Depth is an optional,
        experimental check; normal sensing does not require it and currently
        announces object names and directions without distances.
      </p>
      <div className="probe-actions">
        <button
          className="button primary"
          disabled={busy || checkingDepth}
          onClick={() => void cameraTest()}
        >
          <Camera size={18} /> Test rear camera
        </button>
        <button
          className="button secondary"
          disabled={busy || checkingDepth}
          onClick={() => void xrTest()}
        >
          <ScanLine size={18} /> Check depth (optional)
        </button>
        <button
          className="button secondary"
          onClick={() => {
            stopTests();
            setCalibrate(true);
          }}
        >
          <Headphones size={18} /> Test stereo cues
        </button>
        <button
          className="button pause-button"
          onClick={() => {
            stopTests();
            audio.current.status(
              "Checks stopped.",
              readPreferences(),
              () => {},
            );
          }}
        >
          Stop tests
        </button>
      </div>
      <video
        ref={video}
        muted
        playsInline
        className="probe-video"
        aria-label="Rear camera test preview"
      />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <section className="panel probe-results">
        <h2>Device results</h2>
        <dl>
          {Object.entries({
            HTTPS: report.secure
              ? "Secure context"
              : "Not secure — camera/XR require HTTPS",
            Camera: report.camera,
            "Immersive AR": report.xr,
            "Raw camera pixels": report.pixels,
            "Depth readings": report.depth,
            "Depth access mode": report.depthUsage,
            "Depth buffer frames": report.depthBufferFrames,
            "AR tracking frames": report.poseFrames,
            "Frames with both": report.simultaneousFrames,
            "Valid depth frames": report.validDepthFrames,
            "Centre optical-axis depth":
              report.centreDepthMetres === null
                ? "Unavailable"
                : `${report.centreDepthMetres.toFixed(2)} metres (probe only)`,
            "Camera image size": report.dimensions,
            "Earbud output": "Requires your listening confirmation",
          }).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="note" role="status">
          {report.note}
        </p>
        <button
          className="button secondary"
          onClick={() => {
            void navigator.clipboard
              .writeText(JSON.stringify(report, null, 2))
              .then(() => setCopied(true))
              .catch(() =>
                setError(
                  "Clipboard unavailable. Select the diagnostics below to copy.",
                ),
              );
          }}
        >
          <Copy size={17} />
          {copied ? "Copied diagnostics" : "Copy diagnostics"}
        </button>
        <details>
          <summary>Full diagnostics</summary>
          <pre className="diagnostics">{JSON.stringify(report, null, 2)}</pre>
        </details>
      </section>
      <section className="panel test-steps">
        <h2>Checking depth on Android</h2>
        <ol>
          <li>
            Open this HTTPS page directly in current Chrome. On Android, check
            that Google Play Services for AR is installed and updated.
          </li>
          <li>Test the rear camera and confirm its preview faces forward.</li>
          <li>
            Tap Check depth. Allow permissions and slowly move the phone around
            a well-lit, textured indoor scene for 20 seconds. The test ends
            automatically after 25 seconds.
          </li>
          <li>
            Copy results. Depth is now tested even when the browser cannot
            supply raw camera images. Both are needed for future live object
            distances.
          </li>
          <li>
            Play each stereo cue and check left / centre / right by listening.
          </li>
        </ol>
        <p>
          Google lists the Nord CE5 as supporting ARCore Depth, but browser
          access is a separate requirement. Live object distance remains
          unavailable; no depth setup is needed to use camera and voice
          guidance.
        </p>
      </section>
      {calibrate && (
        <Calibration
          audio={audio.current}
          prefs={readPreferences()}
          onClose={() => setCalibrate(false)}
        />
      )}
    </main>
  );
}
function Guide() {
  return (
    <main className="main narrow">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Back to sensing
      </Link>
      <p className="eyebrow">A CALMER FIRST START</p>
      <h1>Point. Listen. Notice.</h1>
      <p className="intro">
        EchoGuide turns selected objects in your camera’s view into short
        directional audio cues. No account needed.
      </p>
      <div className="guide-grid">
        {[
          {
            icon: <Headphones />,
            title: "01 · Get comfortable",
            text: "Pair your earbuds. Start at a low volume and use Calibrate earbuds to confirm each direction.",
          },
          {
            icon: <Camera />,
            title: "02 · Face the same way",
            text: "Hold the rear camera facing forward. Left and right refer to the camera, so keep your head facing that direction too.",
          },
          {
            icon: <Ear />,
            title: "03 · Listen for a cue",
            text: "Tap Start sensing and allow camera access. A directional tone is followed by a brief spoken object label.",
          },
          {
            icon: <Pause />,
            title: "04 · Pause any time",
            text: "The large Pause button stops camera capture, tones, and speech. Backgrounding the app pauses sensing too.",
          },
        ].map((item) => (
          <section className="panel" key={item.title}>
            <div className="feature-icon">{item.icon}</div>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </section>
        ))}
      </div>
      <section className="panel limits">
        <h2>
          <ShieldCheck /> Honest about its limits
        </h2>
        <p>
          This prototype recognises people, chairs, backpacks, gates, and doors.
          It can miss or misidentify objects. No detections never means a clear
          path.
        </p>
        <p>
          Tap Start sensing once. Gates and doors are included automatically,
          with short cues such as “Possible door, centre.” A visible opening
          does not confirm a usable exit. First use loads a model of about 38 MB
          plus browser runtime files.
        </p>
        <p>
          Directions are camera-relative. There is no head tracking, awareness
          behind you, or road-crossing guidance. Use stationary, supervised
          indoor demonstrations.
        </p>
        <p>
          Metric distance is unavailable in standard camera mode. The device
          check tests AR depth independently of optional raw camera access. It
          does not enable distances in live sensing. Browser access, image
          alignment and measured accuracy still require phone verification.
        </p>
        <p>
          Guidance uses a gentle speaking speed and softer directional tones.
          Choose an installed English voice or preview it in listening
          preferences. The final sound depends on your phone's speech engine.
        </p>
        <p>
          Continuous detection is local. Describe scene, when configured, sends
          one selected JPEG to the backend and Gemini. Images are not saved by
          EchoGuide.
        </p>
      </section>
      <p className="note">
        Model: YOLOE-26s by Ultralytics, AGPL-3.0.{" "}
        <a
          href="https://github.com/SamsDevForge/EchoGuide"
          target="_blank"
          rel="noreferrer"
        >
          Full source and export instructions
        </a>{" "}
        ·{" "}
        <a href={import.meta.env.BASE_URL + "live-models/LICENSE"}>
          Model licence
        </a>
      </p>
      <Link className="button primary" to="/">
        Ready to try <ArrowUpRight size={18} />
      </Link>
    </main>
  );
}
export default App;
