import type { Observation, Preferences, Direction } from "./contracts";
import { TRACK_TTL } from "./vision";
import { selectGuidanceVoice } from "./voices";

function speechRate(prefs: Preferences): number {
  const rate = prefs.speechRate ?? 0.9;
  return Number.isFinite(rate) ? Math.max(0.8, Math.min(1.1, rate)) : 0.9;
}

function guidanceUtterance(
  text: string,
  prefs: Preferences,
): SpeechSynthesisUtterance | null {
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices?.() ?? [];
  } catch {
    // Enumeration can fail before the browser's voice engine is ready.
  }
  // Prefer local English speech. A local voice in another language is still
  // preferable to silence; if no local voice exists, retain the browser's
  // default speech behavior rather than explicitly choosing a remote voice.
  const voice =
    selectGuidanceVoice(voices, prefs.voiceURI) ??
    voices.find(
      (candidate) => candidate.localService === true && candidate.default,
    ) ??
    voices.find((candidate) => candidate.localService === true) ??
    null;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.volume = prefs.volume;
  utterance.rate = speechRate(prefs);
  utterance.pitch = 1;
  utterance.lang =
    voice && /^en(?:[-_]|$)/i.test(voice.lang) ? voice.lang : "en-US";
  if (voice) utterance.voice = voice;
  return utterance;
}
export function phraseFor(o: Observation) {
  return `${o.label === "gate" || o.label === "door" ? "Possible " : ""}${o.label}, ${o.direction}${o.depthState === "valid" && o.distanceMetres !== null ? `, about ${(Math.round(o.distanceMetres * 2) / 2).toFixed(1)} metres` : ""}.`;
}
export function signature(o: Observation) {
  return `${o.trackId}:${o.direction}:${o.depthState}:${o.distanceMetres === null ? "none" : Math.round(o.distanceMetres * 2)}`;
}
export class AnnouncementGate {
  private lastAt = -Infinity;
  private spoken = new Map<string, string>();
  choose(items: Observation[], now: number, interval: number) {
    const fresh = items.filter((o) => now - o.timestamp <= TRACK_TTL);
    const ids = new Set(fresh.map((o) => o.trackId));
    for (const key of this.spoken.keys())
      if (!ids.has(key)) this.spoken.delete(key);
    if (now - this.lastAt < interval) return null;
    const item = [...fresh]
      .sort(
        (a, b) =>
          Number(b.label === "gate" || b.label === "door") -
          Number(a.label === "gate" || a.label === "door"),
      )
      .find((o) => this.spoken.get(o.trackId) !== signature(o));
    if (item) {
      this.lastAt = now;
      this.spoken.set(item.trackId, signature(item));
    }
    return item ?? null;
  }
  reset() {
    this.lastAt = -Infinity;
    this.spoken.clear();
  }
  forget(trackId: string) {
    this.spoken.delete(trackId);
  }
}
export class AudioGuide {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private busy = false;
  private activeTrack: string | null = null;
  private activeSignature: string | null = null;
  gate = new AnnouncementGate();
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  status(text: string, prefs: Preferences, onText: (text: string) => void) {
    this.cancel(false);
    onText(text);
    if (!("speechSynthesis" in window)) return;
    this.busy = true;
    const generation = this.generation;
    const utterance = guidanceUtterance(text, prefs);
    if (!utterance) {
      this.busy = false;
      return;
    }
    utterance.onend = utterance.onerror = () => {
      if (generation === this.generation) this.busy = false;
    };
    window.speechSynthesis.speak(utterance);
  }
  dispose() {
    this.cancel();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") void context.close();
  }
  tone(direction: Direction, prefs: Preferences) {
    if (!this.context || this.context.state !== "running") return;
    this.oscillator?.stop();
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const x = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    if (prefs.spatialMode === "hrtf") {
      const pan = ctx.createPanner();
      pan.panningModel = "HRTF";
      pan.positionX.value = x;
      pan.positionZ.value = -1;
      osc.connect(gain).connect(pan).connect(ctx.destination);
    } else {
      const pan = ctx.createStereoPanner();
      pan.pan.value = x;
      osc.connect(gain).connect(pan).connect(ctx.destination);
    }
    osc.frequency.value = direction === "centre" ? 660 : 520;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
      prefs.volume * 0.17,
      ctx.currentTime + 0.03,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    this.oscillator = osc;
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      if (this.oscillator === osc) this.oscillator = null;
    };
  }
  say(
    item: Observation,
    prefs: Preferences,
    onText: (text: string) => void,
    spokenText?: string,
  ) {
    this.cancel(false);
    this.busy = true;
    this.activeTrack = item.trackId;
    this.activeSignature = signature(item);
    const generation = this.generation;
    this.tone(item.direction, prefs);
    const phrase = spokenText ?? phraseFor(item);
    onText(phrase);
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      if (!spokenText && performance.now() - item.timestamp > TRACK_TTL) {
        this.cancel(false);
        return;
      }
      if (!("speechSynthesis" in window)) {
        this.busy = false;
        return;
      }
      const utterance = guidanceUtterance(phrase, prefs);
      if (!utterance) {
        this.busy = false;
        return;
      }
      utterance.onend = utterance.onerror = () => {
        if (generation === this.generation) this.busy = false;
      };
      window.speechSynthesis.speak(utterance);
    }, 260);
  }
  update(
    items: Observation[],
    prefs: Preferences,
    onText: (text: string) => void,
  ) {
    if (
      this.activeTrack &&
      !items.some(
        (o) =>
          o.trackId === this.activeTrack &&
          signature(o) === this.activeSignature &&
          performance.now() - o.timestamp <= TRACK_TTL,
      )
    )
      this.cancel(false);
    if (this.busy) return;
    const item = this.gate.choose(
      items,
      performance.now(),
      prefs.announcementIntervalMs,
    );
    if (item) this.say(item, prefs, onText);
  }
  cancel(reset = true) {
    if (this.busy && this.activeTrack) this.gate.forget(this.activeTrack);
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.oscillator?.stop();
    this.oscillator = null;
    window.speechSynthesis?.cancel();
    this.busy = false;
    this.activeTrack = null;
    this.activeSignature = null;
    if (reset) this.gate.reset();
  }
}
