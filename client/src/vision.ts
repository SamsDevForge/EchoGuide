import type { Box, CameraProvider, Direction, Observation } from "./contracts";
// Bounded capture age includes inference and the spoken cue; slow frames still expire.
export const TRACK_TTL = 2500;
export const directionFor = (x: number): Direction =>
  x < 0.38 ? "left" : x > 0.62 ? "right" : "centre";
export const depthMedian = (samples: number[]): number | null => {
  const valid = samples
    .filter((v) => Number.isFinite(v) && v > 0.15 && v < 8)
    .sort((a, b) => a - b);
  if (valid.length < 5 || valid.length < samples.length * 0.6) return null;
  const med = valid[Math.floor(valid.length / 2)];
  const deviations = valid.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length / 2)] >
    Math.max(0.12, med * 0.12) ||
    valid[Math.floor(valid.length * 0.8)] -
      valid[Math.floor(valid.length * 0.2)] >
      Math.max(0.3, med * 0.3)
    ? null
    : med;
};
export const axialToRange = (z: number, x: number, y: number): number =>
  z * Math.sqrt(1 + x * x + y * y);
export function iou(a: Box, b: Box) {
  const w = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const h = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return (w * h) / (a.width * a.height + b.width * b.height - w * h || 1);
}
export class Tracker {
  private tracks: Observation[] = [];
  private serial = 0;
  update(items: Omit<Observation, "trackId">[], now: number) {
    const candidates = this.tracks.filter(
      (t) => now - t.timestamp <= TRACK_TTL,
    );
    const used = new Set<string>();
    this.tracks = items.map((item) => {
      const match = candidates
        .filter(
          (t) =>
            !used.has(t.trackId) &&
            t.label === item.label &&
            iou(t.box, item.box) > 0.2,
        )
        .sort((a, b) => iou(b.box, item.box) - iou(a.box, item.box))[0];
      const trackId = match?.trackId ?? `object-${++this.serial}`;
      used.add(trackId);
      return { ...item, trackId };
    });
    return this.tracks;
  }
  clear() {
    this.tracks = [];
  }
}
export class VideoProvider implements CameraProvider {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private generation = 0;
  private lastVideoTime = -1;
  private capturedAt = 0;
  async start(video: HTMLVideoElement) {
    this.stop();
    const token = this.generation;
    if (!window.isSecureContext)
      throw new Error("Camera access needs HTTPS or localhost.");
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "This browser does not support camera access. Try Chrome on your phone.",
      );
    this.video = video;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 960 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    if (token !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Camera start cancelled.", "AbortError");
    }
    this.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      if (token === this.generation) this.stop();
      throw error;
    }
    if (token !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Camera start cancelled.", "AbortError");
    }
  }
  frame(allowDuplicate = false) {
    const v = this.video;
    if (
      !v ||
      v.readyState < 2 ||
      !this.stream?.active ||
      !v.videoWidth ||
      !v.videoHeight
    )
      return null;
    if (v.currentTime === this.lastVideoTime && !allowDuplicate) return null;
    if (v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      this.capturedAt = performance.now();
    }
    if (performance.now() - this.capturedAt > TRACK_TTL) return null;
    return {
      image: v,
      timestamp: this.capturedAt,
      width: v.videoWidth,
      height: v.videoHeight,
      depthSource: "none" as const,
    };
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.lastVideoTime = -1;
    this.capturedAt = 0;
  }
}
