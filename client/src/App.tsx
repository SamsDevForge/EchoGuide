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
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Volume2,
  X,
  Armchair,
  Activity,
  DoorOpen,
  Mic,
} from "lucide-react";
import type { Direction, Observation, Preferences } from "./contracts";
import { readPreferences } from "./preferences";
import { AudioGuide, phraseFor } from "./audio";
import { availableGuidanceVoices, selectGuidanceVoice } from "./voices";
import { Tracker, TRACK_TTL, VideoProvider } from "./vision";
import { LiveVision, LIVE_LABELS } from "./liveVision";
import { api } from "./api";
import { depthFailure, newReport, XRProbe } from "./probe";
import GateScan from "./GateScan";
import { DisplayTools, RouteFocus } from "./Accessibility";
import { currentObservations, viewSummary } from "./guidance";
import { CommandListener, recognitionFactory } from "./commands";
import type { VoiceCommand } from "./commands";

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
        <AudioLines aria-hidden="true" size={23} />
      </span>
      echo<span>guide</span>
      <span className="beta">PROTOTYPE</span>
    </Link>
  );
}
function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <RouteFocus />
      <header className="header">
        <div className="header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <NavLink to="/" end>
              <ScanLine aria-hidden="true" size={17} /> Sensing
            </NavLink>
            <NavLink to="/probe">
              <Activity aria-hidden="true" size={17} /> Device check
            </NavLink>
            <NavLink to="/guide">
              <Info aria-hidden="true" size={17} /> Quick guide
            </NavLink>
          </nav>
        </div>
      </header>
      <DisplayTools />
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
          <AudioLines aria-hidden="true" size={16} /> A little more awareness.
          One sound at a time.
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
  const dialog = useRef<HTMLDialogElement>(null);
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
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      modal?.close();
      audio.cancel();
      previous?.focus();
    };
  }, [audio]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="calibration-title"
      aria-describedby="calibration-description"
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
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
      }}
    >
      <button
        autoFocus
        className="icon-button close"
        aria-label="Close calibration"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
      <div className="feature-icon">
        <Headphones aria-hidden="true" />
      </div>
      <p className="eyebrow">MAKE YOURSELF COMFORTABLE</p>
      <h2 id="calibration-title">Find your left and right.</h2>
      <p id="calibration-description">
        Pair your earbuds, turn off mono audio in your phone’s accessibility
        settings, and try each cue at a comfortable volume.
      </p>
      <div className="cue-grid">
        {(["left", "centre", "right"] as Direction[]).map((d) => (
          <button
            className={active === d ? "cue selected" : "cue"}
            key={d}
            aria-pressed={active === d}
            onClick={() => void cue(d)}
          >
            <Volume2 aria-hidden="true" />
            <strong>{d}</strong>
            <small>{tested.includes(d) ? "Played" : "Tap to listen"}</small>
          </button>
        ))}
      </div>
      <p className="note">
        You should hear left in your left ear, right in your right ear, and
        centre in both. Spoken labels play normally after the directional tone.
      </p>
      <button className="button primary full" onClick={onClose}>
        Done <Check aria-hidden="true" size={18} />
      </button>
    </dialog>
  );
}
function Sensing() {
  const video = useRef<HTMLVideoElement>(null);
  const startControl = useRef<HTMLButtonElement>(null);
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
  const [announcement, setAnnouncementText] = useState(
    "Your next observation will appear here.",
  );
  const [announcementVersion, setAnnouncementVersion] = useState(0);
  function setAnnouncement(text: string) {
    setAnnouncementText(text);
    setAnnouncementVersion((version) => version + 1);
  }
  const [inference, setInference] = useState<number | null>(null);
  const [scene, setScene] = useState("");
  const [describing, setDescribing] = useState(false);
  const [gemini, setGemini] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const [loadingMessage, setLoadingMessage] = useState(
    "Getting sensing ready…",
  );
  const [device, setDevice] = useState<string | null>(null);
  const commandListener = useRef(new CommandListener());
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  const [commandMessage, setCommandMessage] = useState("");
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
    commandListener.current.cancel();
    setListening(false);
    listeningRef.current = false;
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
      commandListener.current.cancel();
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
        if (!listeningRef.current)
          audio.current.update(
            currentObservations(latest.current, prefRef.current, time),
            prefRef.current,
            setAnnouncement,
          );
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
            if (!listeningRef.current)
              audio.current.update(
                currentObservations(
                  latest.current,
                  prefRef.current,
                  performance.now(),
                ),
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
    audio.current.say(
      o,
      prefs,
      setAnnouncement,
      `Sample audio. ${phraseFor(o)}`,
    );
  }
  async function describe() {
    if (!video.current || !running.current) return;
    stopListening();
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
  function changePreferences(next: Preferences, message?: string) {
    commandListener.current.cancel();
    listeningRef.current = false;
    setListening(false);
    prefRef.current = next;
    setPrefs(next);
    audio.current.cancel();
    if (message) audio.current.status(message, next, setAnnouncement);
  }
  function stopSensing() {
    pause();
    startControl.current?.focus();
    audio.current.status(
      "Sensing paused. Camera off.",
      prefRef.current,
      setAnnouncement,
    );
  }
  function repeatCurrent() {
    stopListening();
    if (!running.current) {
      audio.current.status(
        "Sensing is paused. Start sensing to hear current objects.",
        prefRef.current,
        setAnnouncement,
      );
      return;
    }
    const items = currentObservations(
      latest.current,
      prefRef.current,
      performance.now(),
    );
    if (items[0]) audio.current.say(items[0], prefRef.current, setAnnouncement);
    else
      audio.current.status(
        viewSummary([]).text,
        prefRef.current,
        setAnnouncement,
      );
  }
  function readView() {
    stopListening();
    if (!running.current) {
      audio.current.status(
        "Camera off. Start sensing to read the current view.",
        prefRef.current,
        setAnnouncement,
      );
      return;
    }
    const summary = viewSummary(
      currentObservations(latest.current, prefRef.current, performance.now()),
    );
    audio.current.readView(
      summary.items,
      summary.text,
      prefRef.current,
      setAnnouncement,
    );
  }
  function readStatus() {
    stopListening();
    const status = running.current
      ? "Sensing is running."
      : state === "loading"
        ? "Sensing is starting. You can cancel with the main button."
        : state === "demo"
          ? "Audio demonstration. Camera off."
          : "Sensing is paused. Camera off.";
    audio.current.status(
      `${status} ${prefRef.current.focusMode === "openings" ? "Looking for gates and doors." : "Looking for people, chairs, backpacks, gates and doors."} Distance is unavailable.`,
      prefRef.current,
      setAnnouncement,
    );
  }
  function executeCommand(command: VoiceCommand) {
    if (command === "pause") stopSensing();
    else if (command === "repeat") repeatCurrent();
    else if (command === "summary") readView();
    else if (command === "status") readStatus();
    else
      changePreferences(
        {
          ...prefRef.current,
          focusMode: command === "openings" ? "openings" : "all",
        },
        command === "openings"
          ? "Gate and door focus selected. Possible openings are not confirmed exits."
          : "All selected objects will be announced.",
      );
  }
  function stopListening() {
    commandListener.current.cancel();
    listeningRef.current = false;
    setListening(false);
    setCommandMessage("Microphone off.");
  }
  function listenForCommand() {
    const factory = recognitionFactory();
    if (!factory || !voiceEnabled) return;
    audio.current.cancel(false);
    void audio.current.unlock().catch(() => {});
    listeningRef.current = true;
    setListening(true);
    setCommandMessage(
      "Listening for one command. Microphone stops after eight seconds.",
    );
    commandListener.current.start(factory, executeCommand, (message) => {
      listeningRef.current = false;
      setListening(false);
      setCommandMessage(message);
      if (message !== "Voice command received.")
        audio.current.status(message, prefRef.current, setAnnouncement);
    });
  }
  const keyboardActions = useRef({
    start,
    stopSensing,
    repeatCurrent,
    readView,
    readStatus,
  });
  keyboardActions.current = {
    start,
    stopSensing,
    repeatCurrent,
    readView,
    readStatus,
  };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.closest("dialog")) return;
      if (event.key === "Escape" && provider.current) {
        event.preventDefault();
        keyboardActions.current.stopSensing();
      } else if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        if (
          target?.closest("input, select, textarea, [contenteditable='true']")
        )
          return;
        const key = event.key.toLowerCase();
        if (!["s", "r", "v", "i"].includes(key)) return;
        event.preventDefault();
        if (key === "s") {
          if (provider.current) keyboardActions.current.stopSensing();
          else void keyboardActions.current.start();
        } else if (key === "r") keyboardActions.current.repeatCurrent();
        else if (key === "v") keyboardActions.current.readView();
        else keyboardActions.current.readStatus();
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  const isActive = state === "live" || state === "demo" || state === "loading";
  const visibleObjects =
    state === "demo"
      ? objects
      : currentObservations(objects, prefs, performance.now());
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`main sensing-main ${isActive ? "sensing-active" : ""}`}
    >
      <section className="page-heading">
        <div>
          <p className="eyebrow">CAMERA AWARENESS</p>
          <h1>Listen to your surroundings.</h1>
          <p id="camera-instructions">
            Hold the rear camera facing forward. Directions follow your camera.
          </p>
        </div>
      </section>

      <section
        className="sensing-controls panel"
        aria-labelledby="sensing-controls-title"
      >
        <div className="control-heading">
          <h2 id="sensing-controls-title">Sensing controls</h2>
          <span className={`status-pill ${state === "live" ? "green" : ""}`}>
            <span aria-hidden="true" />
            {state === "live"
              ? "Camera on"
              : state === "loading"
                ? "Starting"
                : "Camera off"}
          </span>
        </div>
        <button
          ref={startControl}
          className={`button ${isActive ? "pause-button" : "primary"} start-button`}
          aria-describedby="camera-instructions"
          aria-keyshortcuts="Alt+Shift+S"
          onClick={() => {
            if (isActive) stopSensing();
            else void start();
          }}
        >
          {isActive ? (
            <Pause aria-hidden="true" size={26} />
          ) : (
            <Play aria-hidden="true" size={26} fill="currentColor" />
          )}
          {state === "loading"
            ? "Cancel start"
            : isActive
              ? "Pause sensing"
              : "Start sensing"}
        </button>
        {state === "loading" && (
          <p className="loading-message">{loadingMessage}</p>
        )}
        <div
          className="quick-actions"
          role="group"
          aria-label="Guidance actions"
        >
          <button
            className="button secondary"
            aria-keyshortcuts="Alt+Shift+R"
            disabled={state !== "live"}
            onClick={repeatCurrent}
          >
            <RotateCcw aria-hidden="true" size={21} /> Repeat current object
          </button>
          <button
            className="button secondary"
            aria-keyshortcuts="Alt+Shift+V"
            disabled={state !== "live"}
            onClick={readView}
          >
            <Eye aria-hidden="true" size={21} /> Read current view
          </button>
          <button
            className="button secondary"
            aria-keyshortcuts="Alt+Shift+I"
            onClick={readStatus}
          >
            <Info aria-hidden="true" size={21} /> Read sensing status
          </button>
          <button
            className="button secondary"
            aria-pressed={prefs.speechOutput === "screen-reader"}
            onClick={() =>
              changePreferences(
                {
                  ...prefs,
                  speechOutput:
                    prefs.speechOutput === "screen-reader"
                      ? "device"
                      : "screen-reader",
                },
                prefs.speechOutput === "screen-reader"
                  ? "App voice and tones selected."
                  : "Screen reader output selected. App speech and tones are off.",
              )
            }
          >
            <Ear aria-hidden="true" size={21} /> Screen reader output
          </button>
          <button
            className="button secondary"
            onClick={() => {
              pause();
              setCalibrate(true);
            }}
          >
            <Headphones aria-hidden="true" size={21} /> Test earbud directions
          </button>
          {gemini && (
            <button
              className="button secondary"
              aria-describedby="scene-privacy"
              disabled={state !== "live" || describing}
              onClick={() => void describe()}
            >
              {describing ? (
                <LoaderCircle aria-hidden="true" className="spin" size={21} />
              ) : (
                <Sparkles aria-hidden="true" size={21} />
              )}
              {describing ? "Describing scene…" : "Describe scene"}
            </button>
          )}
        </div>
        <fieldset className="focus-selector">
          <legend>Objects to announce</legend>
          <div className="choice-row">
            <label>
              <input
                type="radio"
                name="object-focus"
                checked={prefs.focusMode !== "openings"}
                onChange={() =>
                  changePreferences(
                    { ...prefs, focusMode: "all" },
                    "All selected objects will be announced.",
                  )
                }
              />{" "}
              All selected objects
            </label>
            <label>
              <input
                type="radio"
                name="object-focus"
                checked={prefs.focusMode === "openings"}
                onChange={() =>
                  changePreferences(
                    { ...prefs, focusMode: "openings" },
                    "Gate and door focus selected. Possible openings are not confirmed exits.",
                  )
                }
              />{" "}
              Gates and doors
            </label>
          </div>
          <p className="setting-hint">
            Gates and doors are included in both modes. A possible opening is
            not a confirmed exit.
          </p>
        </fieldset>
      </section>

      <section className="announcement" aria-labelledby="announcement-title">
        <AudioLines aria-hidden="true" size={28} />
        <div>
          <h2 id="announcement-title">
            {state === "demo" ? "Sample audio" : "Latest guidance"}
          </h2>
          <p
            role="status"
            aria-live={
              prefs.speechOutput === "screen-reader" ? "polite" : "off"
            }
            aria-atomic="true"
          >
            <span key={announcementVersion}>{announcement}</span>
          </p>
        </div>
      </section>
      {error && (
        <div
          className="error-message"
          role={prefs.speechOutput === "screen-reader" ? "alert" : undefined}
        >
          <p>{error}</p>
          <button className="button secondary" onClick={() => void demo()}>
            Try audio demo
          </button>
        </div>
      )}
      <p className="distance-banner">
        <Info aria-hidden="true" size={21} />
        <span>
          <strong>Distance unavailable.</strong> Guidance gives object names and
          directions.
        </span>
      </p>

      <div className="workspace accessible-workspace">
        <div className="left-column">
          <section
            className="panel observations"
            aria-labelledby="objects-title"
          >
            <div className="panel-heading">
              <h2 id="objects-title">
                <Eye aria-hidden="true" size={22} />{" "}
                {state === "demo" ? "Sample object" : "Objects in view"}
              </h2>
            </div>
            <p className="panel-subtitle">
              {state === "demo"
                ? "Demonstration only. Camera off."
                : "Current selected detections. Use Read current view to hear a summary."}
            </p>
            <ul className="object-list">
              {visibleObjects.map((o) => (
                <li className="object-row" key={o.trackId}>
                  <span className="object-icon" aria-hidden="true">
                    {o.label === "person" ? (
                      <UserRound aria-hidden="true" />
                    ) : o.label === "chair" ? (
                      <Armchair aria-hidden="true" />
                    ) : o.label === "gate" || o.label === "door" ? (
                      <DoorOpen aria-hidden="true" />
                    ) : (
                      <Backpack aria-hidden="true" />
                    )}
                  </span>
                  <strong>
                    {o.label === "gate" || o.label === "door"
                      ? `Possible ${o.label}`
                      : o.label}
                  </strong>
                  <span className="direction">{o.direction}</span>
                </li>
              ))}
            </ul>
            {!visibleObjects.length && (
              <p className="empty-objects">
                {state === "live"
                  ? "No selected objects detected. This does not mean the path is clear."
                  : "Start sensing to check the current camera view."}
              </p>
            )}
          </section>

          <details className="camera-card camera-preview">
            <summary>
              <Camera aria-hidden="true" size={22} /> Camera preview and visual
              detections
            </summary>
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
                  {visibleObjects.map((o) => (
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
                      <span>{o.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {state !== "live" && (
                <div className="camera-placeholder">
                  <Camera aria-hidden="true" size={40} />
                  <h2>Camera off</h2>
                  <p>
                    Use Start sensing to begin. Audio demonstrations do not use
                    your camera.
                  </p>
                </div>
              )}
            </div>
          </details>

          <details className="panel help-panel">
            <summary>
              <Headphones aria-hidden="true" size={22} /> Audio demo and
              keyboard help
            </summary>
            <p>
              Hear sample cues without camera permission. These are not live
              detections.
            </p>
            <button
              className="button secondary full"
              onClick={() => void demo()}
            >
              Start audio demo
            </button>
            {state === "demo" && (
              <div
                className="demo-cues"
                role="group"
                aria-label="Sample audio cues"
              >
                <button onClick={() => demoCue("person", "left")}>
                  Sample person, left
                </button>
                <button onClick={() => demoCue("chair", "centre")}>
                  Sample chair, centre
                </button>
                <button onClick={() => demoCue("backpack", "right")}>
                  Sample backpack, right
                </button>
                <button onClick={() => demoCue("gate", "left")}>
                  Sample gate, left
                </button>
                <button onClick={() => demoCue("door", "centre")}>
                  Sample door, centre
                </button>
              </div>
            )}
            <p>
              Tab moves between controls. Enter or Space activates a button.
            </p>
            <dl className="shortcut-list">
              <div>
                <dt>Start or pause</dt>
                <dd>Alt + Shift + S</dd>
              </div>
              <div>
                <dt>Repeat current object</dt>
                <dd>Alt + Shift + R</dd>
              </div>
              <div>
                <dt>Read current view</dt>
                <dd>Alt + Shift + V</dd>
              </div>
              <div>
                <dt>Read status</dt>
                <dd>Alt + Shift + I</dd>
              </div>
              <div>
                <dt>Pause live sensing</dt>
                <dd>Escape</dd>
              </div>
            </dl>
            <p className="setting-hint">
              Your screen reader may use these shortcuts. The labelled buttons
              always work.
            </p>
            <Link className="text-button" to="/examples">
              Try detector example photos
            </Link>
          </details>

          <details className="panel voice-commands">
            <summary>
              <Mic aria-hidden="true" size={22} /> Optional voice commands
            </summary>
            <p id="voice-command-privacy">
              Tap to speak one command. Your browser may send microphone audio
              to its speech service and require an internet connection.
            </p>
            {recognitionFactory() ? (
              <>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={voiceEnabled}
                    aria-describedby="voice-command-privacy"
                    onChange={(e) => {
                      setVoiceEnabled(e.target.checked);
                      if (!e.target.checked) stopListening();
                    }}
                  />{" "}
                  Enable microphone commands for this session
                </label>
                <button
                  className="button secondary full"
                  disabled={!voiceEnabled || describing || state === "loading"}
                  onClick={() => {
                    if (listening) stopListening();
                    else listenForCommand();
                  }}
                  aria-describedby="voice-command-help"
                >
                  <Mic aria-hidden="true" size={21} />{" "}
                  {listening ? "Cancel listening" : "Speak a command"}
                </button>
              </>
            ) : (
              <p>
                Voice recognition is unavailable in this browser. Use the
                buttons above.
              </p>
            )}
            <p id="voice-command-help" className="setting-hint">
              Say “pause”, “repeat”, “read view”, “status”, “find doors”, or
              “all objects”. Listening stops after eight seconds.
            </p>
            <p
              role="status"
              aria-live={
                listening && prefs.speechOutput === "screen-reader"
                  ? "polite"
                  : "off"
              }
            >
              {commandMessage}
            </p>
          </details>
        </div>

        <aside className="right-column" aria-label="Guidance settings">
          <details className="panel listening">
            <summary>
              <SlidersHorizontal aria-hidden="true" size={22} /> Listening
              settings
            </summary>
            <label className="frequency-label" htmlFor="speech-output">
              Guidance output
            </label>
            <select
              id="speech-output"
              value={prefs.speechOutput ?? "device"}
              onChange={(e) =>
                changePreferences(
                  {
                    ...prefs,
                    speechOutput: e.target.value as Preferences["speechOutput"],
                  },
                  e.target.value === "screen-reader"
                    ? "Screen reader output selected. App speech and tones are off."
                    : "App voice and tones selected.",
                )
              }
            >
              <option value="device">App voice and directional tones</option>
              <option value="screen-reader">Screen reader announcements</option>
            </select>
            <p className="setting-hint">
              With TalkBack or another screen reader, select screen reader
              announcements to avoid competing voices. Directions are spoken as
              words.
            </p>
            <label className="frequency-label" htmlFor="announcement-mode">
              When to announce objects
            </label>
            <select
              id="announcement-mode"
              value={prefs.announcementMode ?? "automatic"}
              onChange={(e) =>
                changePreferences(
                  {
                    ...prefs,
                    announcementMode: e.target
                      .value as Preferences["announcementMode"],
                  },
                  e.target.value === "on-request"
                    ? "On request selected. Use Repeat current object or Read current view."
                    : "Automatic object guidance selected.",
                )
              }
            >
              <option value="automatic">Automatically as objects change</option>
              <option value="on-request">Only when I ask</option>
            </select>
            <label className="slider-label" htmlFor="volume">
              <span>App audio volume</span>
              <strong>{Math.round(prefs.volume * 100)}%</strong>
            </label>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={prefs.volume}
              aria-valuetext={`${Math.round(prefs.volume * 100)} percent`}
              onChange={(e) =>
                changePreferences({ ...prefs, volume: Number(e.target.value) })
              }
            />
            <div
              className="volume-buttons"
              role="group"
              aria-label="App volume buttons"
            >
              <button
                className="button secondary"
                disabled={prefs.volume <= 0}
                onClick={() =>
                  changePreferences({
                    ...prefs,
                    volume: Math.max(
                      0,
                      Math.round((prefs.volume - 0.1) * 100) / 100,
                    ),
                  })
                }
              >
                Volume down
              </button>
              <button
                className="button secondary"
                disabled={prefs.volume >= 1}
                onClick={() =>
                  changePreferences({
                    ...prefs,
                    volume: Math.min(
                      1,
                      Math.round((prefs.volume + 0.1) * 100) / 100,
                    ),
                  })
                }
              >
                Volume up
              </button>
            </div>
            <label className="frequency-label" htmlFor="frequency">
              Announcement pace
            </label>
            <select
              id="frequency"
              value={prefs.announcementIntervalMs}
              onChange={(e) =>
                changePreferences({
                  ...prefs,
                  announcementIntervalMs: Number(e.target.value),
                })
              }
            >
              <option value={3000}>Frequent · at least 3 seconds apart</option>
              <option value={5000}>Balanced · at least 5 seconds apart</option>
              <option value={8000}>Relaxed · at least 8 seconds apart</option>
            </select>
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
              onChange={(e) =>
                changePreferences({ ...prefs, voiceURI: e.target.value })
              }
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
              Voice quality depends on installed voices.
            </p>
            <label className="frequency-label" htmlFor="speech-speed">
              Speaking speed
            </label>
            <select
              id="speech-speed"
              value={prefs.speechRate ?? 0.9}
              onChange={(e) =>
                changePreferences({
                  ...prefs,
                  speechRate: Number(e.target.value),
                })
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
                  { ...prefs, speechOutput: "device" },
                  setAnnouncement,
                )
              }
            >
              <Volume2 aria-hidden="true" size={20} /> Preview app voice
            </button>
            <label className="frequency-label" htmlFor="mode">
              Directional tone mode
            </label>
            <select
              id="mode"
              value={prefs.spatialMode}
              onChange={(e) =>
                changePreferences({
                  ...prefs,
                  spatialMode: e.target.value as Preferences["spatialMode"],
                })
              }
            >
              <option value="stereo">Stereo · left / centre / right</option>
              <option value="hrtf">Spatial HRTF · experimental</option>
            </select>
          </details>
          <section
            className="panel privacy-panel"
            aria-labelledby="privacy-title"
          >
            <h2 id="privacy-title">
              <ShieldCheck aria-hidden="true" size={22} /> Camera privacy
            </h2>
            <p>Live object detection runs on your device.</p>
            {gemini && (
              <p id="scene-privacy">
                Describe scene sends one camera photo to Gemini through your
                local server when you choose it. EchoGuide does not save the
                photo.
              </p>
            )}
            {scene && <p className="scene-result">{scene}</p>}
          </section>
        </aside>
      </div>
      <section className="bottom-note">
        <Info aria-hidden="true" size={24} />
        <p>
          <strong>Awareness prototype.</strong> For stationary, supervised
          indoor use. Selected objects can be missed or misidentified. This app
          does not confirm a safe route or a usable exit.
        </p>
        <Link to="/guide">
          Quick guide <ChevronRight aria-hidden="true" size={20} />
        </Link>
      </section>
      <details className="panel diagnostics-panel">
        <summary>
          <Activity aria-hidden="true" size={20} /> Device diagnostics
        </summary>
        <Link className="text-button" to="/probe">
          Open device check
        </Link>
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
              secureContext: window.isSecureContext,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {calibrate && (
        <Calibration
          audio={audio.current}
          prefs={{ ...prefs, speechOutput: "device" }}
          onClose={() => setCalibrate(false)}
        />
      )}
      {isActive && (
        <div className="persistent-pause">
          <button className="button pause-button" onClick={stopSensing}>
            <Pause aria-hidden="true" size={24} />{" "}
            {state === "loading"
              ? "Cancel camera start"
              : "Pause camera and guidance"}
          </button>
        </div>
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
  const [testMessage, setTestMessage] = useState("");
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
        setTestMessage,
      );
    } finally {
      if (token === testGeneration.current) setBusy(false);
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="main narrow" ref={root}>
      <Link to="/" className="back-link">
        <ArrowLeft aria-hidden="true" size={16} /> Back to sensing
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
          <Camera aria-hidden="true" size={18} /> Test rear camera
        </button>
        <button
          className="button secondary"
          disabled={busy || checkingDepth}
          onClick={() => void xrTest()}
        >
          <ScanLine aria-hidden="true" size={18} /> Check depth (optional)
        </button>
        <button
          className="button secondary"
          onClick={() => {
            stopTests();
            setCalibrate(true);
          }}
        >
          <Headphones aria-hidden="true" size={18} /> Test stereo cues
        </button>
        <button
          className="button pause-button"
          onClick={() => {
            stopTests();
            audio.current.status(
              "Checks stopped.",
              readPreferences(),
              setTestMessage,
            );
          }}
        >
          Stop tests
        </button>
      </div>
      <p
        role="status"
        aria-live={
          readPreferences().speechOutput === "screen-reader" ? "polite" : "off"
        }
      >
        {testMessage}
      </p>
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
        <p
          className="note"
          role="status"
          aria-live={
            readPreferences().speechOutput === "screen-reader"
              ? "polite"
              : "off"
          }
        >
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
          <Copy aria-hidden="true" size={17} />
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
    <main id="main-content" tabIndex={-1} className="main narrow">
      <Link to="/" className="back-link">
        <ArrowLeft aria-hidden="true" size={16} /> Back to sensing
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
            icon: <Headphones aria-hidden="true" />,
            title: "01 · Get comfortable",
            text: "Pair your earbuds. Start at a low volume and use Test earbud directions to confirm each direction.",
          },
          {
            icon: <Camera aria-hidden="true" />,
            title: "02 · Face the same way",
            text: "Hold the rear camera facing forward. Left and right refer to the camera, so keep your head facing that direction too.",
          },
          {
            icon: <Ear aria-hidden="true" />,
            title: "03 · Listen for a cue",
            text: "Tap Start sensing and allow camera access. A directional tone is followed by a brief spoken object label.",
          },
          {
            icon: <Pause aria-hidden="true" />,
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
          <ShieldCheck aria-hidden="true" /> Honest about its limits
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
          With TalkBack or another screen reader, turn on Screen reader output
          in the main controls. This turns off automatic app speech and tones;
          your screen reader announces guidance with directions in words.
          Listening settings also lets you choose guidance only when you ask.
        </p>
        <p>
          Read current view gives a brief summary of fresh detections. Repeat
          current object reads the first current object, with gates and doors
          first. Select Gates and doors to focus announcements on possible
          openings. Distance remains unavailable.
        </p>
        <p>
          Display settings offers larger text and high contrast, saved on your
          device. Keyboard help and optional voice commands are below the main
          controls. Microphone commands listen only when you choose Speak a
          command; your browser may use an online speech service.
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
        Ready to try <ArrowUpRight aria-hidden="true" size={18} />
      </Link>
    </main>
  );
}
export default App;
