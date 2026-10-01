import { describe, expect, it } from "vitest";
import {
  GATE_PROMPTS,
  GATE_THRESHOLD,
  gateCandidates,
  gatePhrase,
  type GatePrediction,
} from "./gates";

const prediction = (
  label: string,
  score: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): GatePrediction => ({ label, score, box: { xmin, ymin, xmax, ymax } });

describe("captured-image gate candidates", () => {
  it("uses distinct supported labels at the inclusive 0.25 threshold without inventing a distance", () => {
    expect(GATE_THRESHOLD).toBe(0.25);
    expect(GATE_PROMPTS).toContain("gate");
    expect(GATE_PROMPTS).toContain("exit sign");
    expect(GATE_PROMPTS).toContain("door");
    const result = gateCandidates(
      [
        prediction("gate", 0.25, 0.05, 0.1, 0.25, 0.7),
        prediction("gate", 0.8, 0.4, 0.1, 0.6, 0.7),
        prediction("door", 0.7, 0.75, 0.1, 0.95, 0.7),
        prediction("exit sign", 0.249, 0.1, 0.75, 0.3, 0.9),
      ],
      1234,
    );
    expect(result.map((candidate) => candidate.label)).toEqual([
      "gate",
      "door",
      "gate",
    ]);
    expect(result.map((candidate) => candidate.direction)).toEqual([
      "centre",
      "right",
      "left",
    ]);
    expect(result.map((candidate) => candidate.timestamp)).toEqual([
      1234, 1234, 1234,
    ]);
    expect(
      result.every(
        (candidate) =>
          candidate.distanceMetres === null &&
          candidate.depthState === "unavailable" &&
          candidate.depthSource === "none",
      ),
    ).toBe(true);
    expect(
      result.every((candidate) =>
        candidate.trackId.startsWith("gate-snapshot-"),
      ),
    ).toBe(true);
  });

  it("rejects non-finite scores and boxes, inverted boxes, and out-of-frame boxes while clipping partial boxes", () => {
    const result = gateCandidates(
      [
        prediction("door", Number.NaN, 0.1, 0.1, 0.3, 0.5),
        prediction("door", Number.POSITIVE_INFINITY, 0.1, 0.1, 0.3, 0.5),
        prediction("door", 1.01, 0.1, 0.1, 0.3, 0.5),
        prediction("door", 0.9, Number.NaN, 0.1, 0.3, 0.5),
        prediction("door", 0.9, 0.1, 0.1, Number.POSITIVE_INFINITY, 0.5),
        prediction("door", 0.9, 0.3, 0.1, 0.1, 0.5),
        prediction("door", 0.9, 1.1, 0.1, 1.3, 0.5),
        prediction("door", 0.9, 0.1, 0.1, 0.11, 0.11),
        prediction("gate", 0.6, -0.1, 0.2, 0.2, 0.6),
      ],
      10,
    );
    expect(result).toHaveLength(1);
    expect(result[0].box).toEqual({
      x: 0,
      y: 0.2,
      width: 0.2,
      height: 0.39999999999999997,
    });
    expect(result[0].horizontalPosition).toBe(0.1);
    expect(result[0].direction).toBe("left");
  });

  it("lets higher-scoring fence, window, and wall boxes suppress overlapping gates or doors above IoU 0.45", () => {
    const result = gateCandidates(
      [
        prediction("gate", 0.6, 0.05, 0.05, 0.25, 0.35),
        prediction("fence", 0.9, 0.05, 0.05, 0.25, 0.35),
        prediction("door", 0.6, 0.4, 0.05, 0.6, 0.35),
        prediction("window", 0.9, 0.4, 0.05, 0.6, 0.35),
        prediction("gate", 0.6, 0.75, 0.05, 0.95, 0.35),
        prediction("wall", 0.9, 0.75, 0.05, 0.95, 0.35),
        prediction("door", 0.7, 0.4, 0.6, 0.6, 0.9),
      ],
      20,
    );
    expect(result.map((candidate) => candidate.label)).toEqual(["door"]);
    expect(result[0].box.y).toBe(0.6);
  });

  it("returns at most six candidates, ordered by score and retaining their camera-relative direction", () => {
    const predictions = Array.from({ length: 8 }, (_, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = [0.02, 0.34, 0.6, 0.8][column];
      return prediction(
        index % 2 ? "door" : "gate",
        0.99 - index * 0.05,
        x,
        0.1 + row * 0.5,
        x + 0.15,
        0.4 + row * 0.5,
      );
    });
    const result = gateCandidates([...predictions].reverse(), 30);
    expect(result).toHaveLength(6);
    expect(result.map((candidate) => candidate.score)).toEqual([
      0.99, 0.94, 0.89, 0.84, 0.79, 0.74,
    ]);
    expect(result.map((candidate) => candidate.direction)).toEqual([
      "left",
      "centre",
      "right",
      "right",
      "left",
      "centre",
    ]);
  });
});

describe("gate announcement wording", () => {
  it("qualifies the observation as an image snapshot and never confirms an exit or distance", () => {
    const candidate = gateCandidates(
      [prediction("door", 0.8, 0.7, 0.1, 0.95, 0.8)],
      40,
    )[0];
    const phrase = gatePhrase(candidate);
    expect(phrase).toBe(
      "Possible door, right, in this image. Exit unconfirmed.",
    );
    expect(phrase).not.toMatch(/metres|meters|safe|clear path|confirmed exit/i);
  });
});
