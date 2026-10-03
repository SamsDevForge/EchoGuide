import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  DoorOpen,
  LoaderCircle,
  Pause,
  Volume2,
} from "lucide-react";
import { AudioGuide, phraseFor } from "./audio";
import { readPreferences } from "./preferences";
import type { Observation } from "./contracts";
import { LiveVision } from "./liveVision";

const examples = {
  gate: {
    file: "examples/gate-entrance.jpg",
    credit: "Steve Hillebrand / USFWS · public domain",
    source:
      "https://commons.wikimedia.org/wiki/File:Entrance_gate_metal_gate.jpg",
  },
  door: {
    file: "examples/door-building.jpg",
    credit: "Poldo2018 · CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Door_in_a_building.jpg",
  },
};

export default function GateScan() {
  const model = useRef<LiveVision | null>(null);
  const audio = useRef(new AudioGuide());
  const generation = useRef(0);
  const [name, setName] = useState<keyof typeof examples | null>(null);
  const [objects, setObjects] = useState<Observation[]>([]);
  const [message, setMessage] = useState(
    "These examples use the same detector as Start sensing.",
  );
  const [busy, setBusy] = useState(false);
  const [inference, setInference] = useState<number | null>(null);
  const [error, setError] = useState("");
  function stop() {
    generation.current++;
    model.current?.stop();
    model.current = null;
    audio.current.cancel();
    setBusy(false);
    setObjects([]);
    setMessage("Example paused.");
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      generation.current++;
      model.current?.stop();
      audio.current.dispose();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function check(next: keyof typeof examples) {
    const token = ++generation.current;
    audio.current.cancel();
    setName(next);
    setObjects([]);
    setInference(null);
    setError("");
    setBusy(true);
    setMessage("Checking the example photo…");
    try {
      await audio.current.unlock();
      if (token !== generation.current) return;
      const detector =
        model.current ??
        new LiveVision((text) => {
          if (token === generation.current) setMessage(text);
        });
      model.current = detector;
      await detector.load();
      if (token !== generation.current) return;
      const photo = new Image();
      photo.src = import.meta.env.BASE_URL + examples[next].file;
      await photo.decode();
      if (token !== generation.current) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        960 / Math.max(photo.naturalWidth, photo.naturalHeight),
      );
      canvas.width = Math.round(photo.naturalWidth * scale);
      canvas.height = Math.round(photo.naturalHeight * scale);
      canvas
        .getContext("2d")!
        .drawImage(photo, 0, 0, canvas.width, canvas.height);
      const result = await detector.detect({
        image: canvas,
        width: canvas.width,
        height: canvas.height,
        timestamp: performance.now(),
        depthSource: "none",
      });
      if (token !== generation.current) return;
      const found = result.candidates.map((item, i) => ({
        ...item,
        trackId: "example-" + i,
      }));
      setObjects(found);
      setInference(result.inferenceMs);
      setBusy(false);
      if (found[0])
        audio.current.say(
          found[0],
          readPreferences(),
          setMessage,
          "Example photo. " + phraseFor(found[0]),
        );
      else
        setMessage(
          "No selected objects found in this example. The detector can miss objects.",
        );
    } catch (cause) {
      if (token !== generation.current) return;
      model.current?.stop();
      model.current = null;
      setBusy(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "The example could not be checked.",
      );
      setMessage("Example check failed. Try again.");
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="main narrow">
      <Link className="back-link" to="/">
        <ArrowLeft aria-hidden="true" size={16} /> Back to sensing
      </Link>
      <p className="eyebrow">DETECTOR EXAMPLES · CAMERA OFF</p>
      <h1>Try an example.</h1>
      <p className="intro">
        Start sensing automatically announces gates and doors in the camera
        view. These photos let you try the same detector without using your
        camera.
      </p>
      <div className="probe-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void check("gate")}
        >
          <DoorOpen aria-hidden="true" size={18} /> Try gate example
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void check("door")}
        >
          <DoorOpen aria-hidden="true" size={18} /> Try door example
        </button>
        <button className="button pause-button" onClick={stop}>
          <Pause aria-hidden="true" size={18} /> Pause
        </button>
      </div>
      <p
        className="note"
        role="status"
        aria-live={
          readPreferences().speechOutput === "screen-reader" ? "polite" : "off"
        }
      >
        {busy && <LoaderCircle aria-hidden="true" size={16} className="spin" />}{" "}
        {message}
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {name && (
        <section className="panel">
          <div className="gate-image">
            <img
              src={import.meta.env.BASE_URL + examples[name].file}
              alt={name + " detector example, not your surroundings"}
            />
            {objects.map((item) => (
              <div
                key={item.trackId}
                className="bounding-box"
                style={{
                  left: item.box.x * 100 + "%",
                  top: item.box.y * 100 + "%",
                  width: item.box.width * 100 + "%",
                  height: item.box.height * 100 + "%",
                }}
              >
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p>
            <a href={examples[name].source} target="_blank" rel="noreferrer">
              {examples[name].credit}
            </a>
          </p>
          {objects.map((item) => (
            <div className="object-row" key={item.trackId}>
              <strong>{phraseFor(item)}</strong>
              <button
                className="button secondary"
                onClick={() => {
                  const token = generation.current;
                  void audio.current.unlock().then(() => {
                    if (token === generation.current)
                      audio.current.say(
                        item,
                        readPreferences(),
                        setMessage,
                        "Example photo. " + phraseFor(item),
                      );
                  });
                }}
              >
                <Volume2 aria-hidden="true" size={16} /> Hear example
              </button>
            </div>
          ))}
          {inference !== null && (
            <details>
              <summary>Detector details</summary>
              <pre className="diagnostics">
                {JSON.stringify(
                  {
                    model: "YOLOE-26s · same as live sensing",
                    device: model.current?.device,
                    inferenceMs: inference,
                    source: "Example photo; camera off",
                    candidates: objects.map((item) => ({
                      label: item.label,
                      score: item.score,
                      direction: item.direction,
                    })),
                    confirmedExit: false,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </section>
      )}
      <p className="note">
        A gate or door may be locked or lead elsewhere. Detecting one does not
        confirm a usable exit.
      </p>
      <Link className="button primary" to="/">
        Return to Start sensing
      </Link>
    </main>
  );
}
