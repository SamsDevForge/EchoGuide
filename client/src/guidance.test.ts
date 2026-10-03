import { describe, expect, it } from "vitest";
import { currentObservations, viewSummary } from "./guidance";
import { defaults } from "./contracts";
import type { Observation } from "./contracts";
import { TRACK_TTL } from "./vision";
const item = (
  label: string,
  patch: Partial<Observation> = {},
): Observation => ({
  trackId: label,
  label,
  timestamp: 1000,
  score: 0.8,
  direction: "centre",
  horizontalPosition: 0.5,
  box: { x: 0.4, y: 0.2, width: 0.2, height: 0.5 },
  distanceMetres: null,
  depthSource: "none",
  depthState: "unavailable",
  ...patch,
});
describe("requested guidance and object focus", () => {
  it("never repeats expired, future or invalid observations", () => {
    const items = [
      item("chair", { timestamp: 999 - TRACK_TTL }),
      item("person", { timestamp: 1001 }),
      item("backpack", { timestamp: NaN }),
      item("door"),
    ];
    expect(
      currentObservations(items, defaults, 1000).map((o) => o.label),
    ).toEqual(["door"]);
  });
  it("keeps doors and gates in the default feed and filters ordinary objects only in opening focus", () => {
    const items = [item("chair"), item("door"), item("gate"), item("person")];
    expect(
      currentObservations(items, defaults, 1000).map((o) => o.label),
    ).toEqual(["door", "gate", "chair", "person"]);
    expect(
      currentObservations(
        items,
        { ...defaults, focusMode: "openings" },
        1000,
      ).map((o) => o.label),
    ).toEqual(["door", "gate"]);
  });
  it("keeps summaries brief, removes duplicate cues and preserves uncertainty", () => {
    const summary = viewSummary([
      item("door"),
      item("door", { trackId: "door-2" }),
      item("gate"),
      item("person"),
      item("chair"),
    ]);
    expect(summary.items).toHaveLength(3);
    expect(summary.text).toContain("Possible door, centre.");
    expect(summary.text.match(/Possible door/g)).toHaveLength(1);
    expect(summary.text).toContain("More objects are listed below.");
    expect(summary.text).not.toContain("metres");
    expect(summary.text).not.toContain("exit");
  });
  it("empty summaries never claim the route is clear", () => {
    expect(viewSummary([]).text).toContain(
      "This does not mean the path is clear",
    );
  });
});
