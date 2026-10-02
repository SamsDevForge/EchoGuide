import { describe, expect, it } from "vitest";
import { GATE_THRESHOLD, type GatePrediction } from "./gates";
import { liveCandidates } from "./liveVision";
import { Tracker } from "./vision";
import { phraseFor } from "./audio";

const prediction = (label: string, score: number, xmin: number, ymin: number, xmax: number, ymax: number): GatePrediction =>
  ({ label, score, box: { xmin, ymin, xmax, ymax } });

describe("live opening validation", () => {
  it("accepts the threshold, preserves captured time, and never infers a distance", () => {
    expect(GATE_THRESHOLD).toBe(.25);
    const candidates = liveCandidates([
      prediction("gate", .25, .05, .1, .25, .7),
      prediction("door", .8, .4, .1, .6, .7),
      prediction("gate", .249, .75, .1, .95, .7),
      prediction("exit sign", .9, .75, .75, .95, .95),
    ], 1234);
    expect(candidates.map(item => item.label)).toEqual(["door", "gate"]);
    expect(candidates.map(item => item.direction)).toEqual(["centre", "left"]);
    expect(candidates.every(item => item.timestamp === 1234 && item.distanceMetres === null && item.depthState === "unavailable")).toBe(true);
  });
  it("rejects non-finite, inverted, tiny and outside boxes, while clipping a partial box", () => {
    const candidates = liveCandidates([
      prediction("door", NaN, .1, .1, .3, .5),
      prediction("door", Infinity, .1, .1, .3, .5),
      prediction("door", 1.01, .1, .1, .3, .5),
      prediction("door", .9, NaN, .1, .3, .5),
      prediction("door", .9, .1, .1, Infinity, .5),
      prediction("door", .9, .3, .1, .1, .5),
      prediction("door", .9, 1.1, .1, 1.3, .5),
      prediction("door", .9, .1, .1, .11, .11),
      prediction("gate", .6, -.1, .2, .2, .6),
    ], 10);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].box).toEqual({ x: 0, y: .2, width: .2, height: .39999999999999997 });
    expect(candidates[0].direction).toBe("left");
  });
  it("does not announce a lower-scoring opening over an overlapping fence, window or wall", () => {
    expect(liveCandidates([
      prediction("gate", .6, .05, .05, .25, .35), prediction("fence", .9, .05, .05, .25, .35),
      prediction("door", .6, .4, .05, .6, .35), prediction("window", .9, .4, .05, .6, .35),
      prediction("gate", .6, .75, .05, .95, .35), prediction("wall", .9, .75, .05, .95, .35),
    ], 20)).toEqual([]);
  });
  it("merges duplicate gate descriptions while retaining separate openings", () => {
    const candidates = liveCandidates([
      prediction("gate", .8, .1, .1, .3, .8),
      prediction("gate", .7, .1, .1, .3, .8),
      prediction("door", .6, .7, .1, .9, .8),
    ], 30);
    expect(candidates.map(item => item.label)).toEqual(["gate", "door"]);
  });
  it("uses brief live wording without an exit or distance claim", () => {
    const candidates = liveCandidates([prediction("door", .8, .7, .1, .95, .8)], 40);
    const observation = new Tracker().update(candidates, 40)[0];
    expect(phraseFor(observation)).toBe("Possible door, right.");
  });
});
