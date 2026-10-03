import type { Observation, Preferences } from "./contracts";
import { TRACK_TTL } from "./vision";
import { phraseFor } from "./audio";

export function currentObservations(
  items: Observation[],
  prefs: Preferences,
  now: number,
) {
  return items
    .filter(
      (o) =>
        Number.isFinite(o.timestamp) &&
        now >= o.timestamp &&
        now - o.timestamp <= TRACK_TTL &&
        (prefs.focusMode !== "openings" ||
          o.label === "gate" ||
          o.label === "door"),
    )
    .sort(
      (a, b) =>
        Number(b.label === "gate" || b.label === "door") -
        Number(a.label === "gate" || a.label === "door"),
    );
}

// Keep requested summaries brief; repeated detections of a class/direction add
// no useful directional information. These are fresh observations, not history.
export function viewSummary(items: Observation[]) {
  const seen = new Set<string>();
  const unique = items.filter((o) => {
    const key = `${o.label}:${o.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    items: unique.slice(0, 3),
    text: unique.length
      ? `Current view. ${unique.slice(0, 3).map(phraseFor).join(" ")}${unique.length > 3 ? " More objects are listed below." : ""}`
      : "No selected objects detected in the current view. This does not mean the path is clear.",
  };
}
