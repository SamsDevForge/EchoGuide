import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioGuide } from "./audio";
import { liveCandidates } from "./liveVision";
import { Tracker, TRACK_TTL } from "./vision";
import type { Observation, Preferences } from "./contracts";

const prefs: Preferences = {
  volume: 0.5,
  announcementIntervalMs: 2000,
  spatialMode: "stereo",
};
const item = (patch: Partial<Observation> = {}): Observation => ({
  timestamp: performance.now(),
  trackId: "chair-1",
  label: "chair",
  score: 0.9,
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  direction: "left",
  horizontalPosition: 0.25,
  distanceMetres: null,
  depthSource: "none",
  depthState: "unavailable",
  ...patch,
});

class MockNode {
  connect = vi.fn((next: unknown) => next);
  disconnect = vi.fn();
}
class MockOscillator extends MockNode {
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class MockUtterance {
  volume = 1;
  rate = 1;
  pitch = 1;
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
let oscillators: MockOscillator[];
let spoken: MockUtterance[];
let cancelSpeech: ReturnType<typeof vi.fn>;
let installedVoices: SpeechSynthesisVoice[];
const voice = (
  name: string,
  localService = true,
  lang = "en-US",
  isDefault = false,
): SpeechSynthesisVoice =>
  ({
    name,
    voiceURI: name,
    lang,
    localService,
    default: isDefault,
  }) as SpeechSynthesisVoice;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - 1_000_000);
  vi.setSystemTime(1_000_000);
  oscillators = [];
  spoken = [];
  installedVoices = [];
  cancelSpeech = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: {
      speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)),
      cancel: cancelSpeech,
      getVoices: vi.fn(() => installedVoices),
    },
  });
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 0;
      destination = new MockNode();
      resume = vi.fn(async () => undefined);
      createOscillator() {
        const osc = new MockOscillator();
        oscillators.push(osc);
        return osc;
      }
      createGain() {
        return Object.assign(new MockNode(), {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
        });
      }
      createStereoPanner() {
        return Object.assign(new MockNode(), { pan: { value: 0 } });
      }
    },
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audio cancellation across scene changes", () => {
  it("keeps a normal CPU-result cue audible while newer frames are arriving", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    const opening = item({
      label: "gate",
      timestamp: performance.now() - 1120,
    });
    guide.update([opening], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken[0].text).toBe("Possible gate, left.");
    const cancels = cancelSpeech.mock.calls.length;
    vi.advanceTimersByTime(400);
    guide.update([opening], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(cancels);
    guide.update([item({ label: "gate" })], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(cancels);
    guide.cancel();
  });

  it("cancels a label if its frame expires between the tone and speech", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update(
      [item({ label: "door", timestamp: performance.now() - TRACK_TTL + 200 })],
      prefs,
      vi.fn(),
    );
    vi.advanceTimersByTime(260);
    expect(spoken).toHaveLength(0);
  });
  it("automatically speaks a gate and then a door from the same live pipeline used for ordinary objects", async () => {
    const guide = new AudioGuide();
    const tracker = new Tracker();
    await guide.unlock();
    const observe = (label: string, x: number, score = 0.8) =>
      liveCandidates(
        [
          {
            label,
            score,
            box: { xmin: x, ymin: 0.1, xmax: x + 0.2, ymax: 0.8 },
          },
          {
            label: "person",
            score: 0.95,
            box: { xmin: 0.75, ymin: 0.1, xmax: 0.95, ymax: 0.8 },
          },
        ],
        performance.now(),
      );
    guide.update(
      tracker.update(observe("gate", 0.05), performance.now()),
      prefs,
      vi.fn(),
    );
    vi.advanceTimersByTime(260);
    expect(spoken[0].text).toBe("Possible gate, left.");
    spoken[0].onend!();
    vi.advanceTimersByTime(2000);
    guide.update(
      tracker.update(observe("door", 0.4), performance.now()),
      prefs,
      vi.fn(),
    );
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Possible gate, left.",
      "Possible door, centre.",
    ]);
    guide.cancel();
  });

  it("never speaks an opening from an expired frame", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update(
      [item({ label: "door", timestamp: performance.now() - TRACK_TTL - 100 })],
      prefs,
      vi.fn(),
    );
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(0);
  });

  it("speaks startup and pause status while cancelling pending object speech", async () => {
    const guide = new AudioGuide();
    const text = vi.fn();
    await guide.unlock();
    guide.status("Sensing started.", prefs, text);
    expect(spoken[0].text).toBe("Sensing started.");
    spoken[0].onend!();
    guide.update([item({ label: "gate" })], prefs, text);
    guide.status("Sensing paused.", prefs, text);
    vi.advanceTimersByTime(1000);
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Sensing started.",
      "Sensing paused.",
    ]);
    expect(spoken.every((utterance) => utterance.volume === prefs.volume)).toBe(
      true,
    );
    expect(
      spoken.every(
        (utterance) =>
          utterance.rate === 0.9 &&
          utterance.pitch === 1 &&
          utterance.lang === "en-US",
      ),
    ).toBe(true);
    guide.cancel();
  });

  it("uses a newly loaded local voice for later speech and keeps status and observations at the chosen rate", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.status("Ready.", prefs, vi.fn());
    expect(spoken[0].voice).toBeNull();
    spoken[0].onend!();
    const installed = voice("Natural Local");
    installedVoices.push(installed);
    const calmer = { ...prefs, voiceURI: installed.voiceURI, speechRate: 0.85 };
    guide.update([item()], calmer, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken[1].voice).toBe(installed);
    expect(spoken[1].rate).toBe(0.85);
    spoken[1].onend!();
    guide.status("Paused.", calmer, vi.fn());
    expect(spoken[2].voice).toBe(installed);
    expect(spoken[2].rate).toBe(0.85);
    guide.cancel();
  });

  it("speaks with a local default voice if no local English voice exists", () => {
    const localFrench = voice("Local French", true, "fr-FR", true);
    installedVoices.push(voice("Remote Natural", false), localFrench);
    const guide = new AudioGuide();
    guide.status("Ready.", prefs, vi.fn());
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice).toBe(localFrench);
    expect(spoken[0].lang).toBe("en-US");
    guide.cancel();
  });

  it("uses browser default speech when only remote voices are enumerated", () => {
    installedVoices.push(voice("Remote Natural", false));
    const guide = new AudioGuide();
    guide.status("Ready.", prefs, vi.fn());
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice).toBeNull();
    expect(spoken[0].lang).toBe("en-US");
    guide.cancel();
  });
  it("speaks the qualified example wording and allows Pause to cancel it", async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    const phrase = "Example photo. Possible gate, left.";
    await guide.unlock();
    guide.say(item({ label: "gate" }), prefs, onText, phrase);
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual([phrase]);
    expect(onText).toHaveBeenCalledWith(phrase);
    guide.cancel();
    expect(cancelSpeech).toHaveBeenCalled();
  });

  it("pause stops a pending tone and prevents its delayed spoken label; resume permits the same observation", async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    await guide.unlock();
    guide.update([item()], prefs, onText);
    const firstOscillator = oscillators[0];
    vi.advanceTimersByTime(100);
    guide.cancel();
    expect(firstOscillator.stop).toHaveBeenCalledWith();
    expect(cancelSpeech).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(0);
    guide.update([item()], prefs, onText);
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual(["chair, left."]);
    expect(onText).toHaveBeenCalledTimes(2);
  });

  it("cancels an outdated pending label when the tracked object changes direction", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: "right" })], prefs, vi.fn());
    vi.advanceTimersByTime(300);
    expect(spoken).toHaveLength(0);
    // Scene changes preserve the pace limit; the correct label arrives after it.
    vi.advanceTimersByTime(1600);
    guide.update([item({ direction: "right" })], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "chair, right.",
    ]);
  });

  it("cancels active speech when its object disappears or becomes stale", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken).toHaveLength(1);
    const previousCancels = cancelSpeech.mock.calls.length;
    guide.update([], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(previousCancels + 1);
    guide.cancel();
    const observation = item();
    guide.update([observation], prefs, vi.fn());
    vi.advanceTimersByTime(TRACK_TTL + 100);
    const staleCancels = cancelSpeech.mock.calls.length;
    guide.update([observation], prefs, vi.fn());
    expect(cancelSpeech).toHaveBeenCalledTimes(staleCancels + 1);
    vi.advanceTimersByTime(3000);
    expect(spoken).toHaveLength(2);
  });

  it("still announces the original direction after left-right-left changes cancel its pending label", async () => {
    const guide = new AudioGuide();
    await guide.unlock();
    guide.update([item()], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: "right" })], prefs, vi.fn());
    vi.advanceTimersByTime(100);
    guide.update([item({ direction: "left" })], prefs, vi.fn());
    vi.advanceTimersByTime(1800);
    expect(spoken).toHaveLength(0);
    guide.update([item({ direction: "left" })], prefs, vi.fn());
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual(["chair, left."]);
  });

  it("screen reader output updates the transcript without app speech or directional tones", async () => {
    const guide = new AudioGuide(),
      onText = vi.fn();
    await guide.unlock();
    const screenReader = { ...prefs, speechOutput: "screen-reader" as const };
    guide.status("Sensing started.", screenReader, onText);
    guide.update([item()], screenReader, onText);
    vi.advanceTimersByTime(300);
    expect(onText).toHaveBeenCalledWith("chair, left.");
    expect(spoken).toHaveLength(0);
    expect(oscillators).toHaveLength(0);
  });

  it("on request mode suppresses automatic speech while keeping manual guidance usable", async () => {
    const guide = new AudioGuide(),
      onText = vi.fn();
    await guide.unlock();
    const onRequest = { ...prefs, announcementMode: "on-request" as const };
    guide.update([item()], onRequest, onText);
    vi.advanceTimersByTime(300);
    expect(spoken).toHaveLength(0);
    guide.say(item(), onRequest, onText);
    vi.advanceTimersByTime(260);
    expect(spoken[0].text).toBe("chair, left.");
  });

  it("cancels a requested summary when any included object changes, even in on request mode", () => {
    const guide = new AudioGuide();
    const onRequest = { ...prefs, announcementMode: "on-request" as const };
    const first = item(),
      second = item({ trackId: "door", label: "door" });
    guide.readView(
      [first, second],
      "Current view. Chair, left. Possible door, left.",
      onRequest,
      vi.fn(),
    );
    const cancels = cancelSpeech.mock.calls.length;
    guide.update(
      [first, { ...second, direction: "right" }],
      onRequest,
      vi.fn(),
    );
    expect(cancelSpeech).toHaveBeenCalledTimes(cancels + 1);
  });

  it("expires requested summaries rather than letting an old captured view continue speaking", () => {
    const guide = new AudioGuide();
    const observation = item();
    guide.readView([observation], "Current view. Chair, left.", prefs, vi.fn());
    const cancels = cancelSpeech.mock.calls.length;
    vi.advanceTimersByTime(TRACK_TTL + 1);
    guide.update(
      [observation],
      { ...prefs, announcementMode: "on-request" },
      vi.fn(),
    );
    expect(cancelSpeech).toHaveBeenCalledTimes(cancels + 1);
  });

  it("ignores completion events from cancelled speech while a new utterance is active", async () => {
    const guide = new AudioGuide();
    const onText = vi.fn();
    await guide.unlock();
    guide.update([item()], prefs, onText);
    vi.advanceTimersByTime(260);
    const oldEnd = spoken[0].onend!;
    guide.cancel();
    guide.update(
      [item({ trackId: "person-2", label: "person" })],
      prefs,
      onText,
    );
    vi.advanceTimersByTime(260);
    oldEnd();
    vi.advanceTimersByTime(2100);
    guide.update(
      [
        item({ trackId: "person-2", label: "person" }),
        item({ trackId: "backpack-3", label: "backpack" }),
      ],
      prefs,
      onText,
    );
    vi.advanceTimersByTime(260);
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "chair, left.",
      "person, left.",
    ]);
    expect(onText).toHaveBeenCalledTimes(2);
  });
});
