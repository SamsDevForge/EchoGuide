import type { Preferences } from "./contracts";
import { defaults } from "./contracts";

export function readPreferences(): Preferences {
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
      speechOutput:
        p.speechOutput === "screen-reader" ? "screen-reader" : "device",
      announcementMode:
        p.announcementMode === "on-request" ? "on-request" : "automatic",
      focusMode: p.focusMode === "openings" ? "openings" : "all",
    };
  } catch {
    return defaults;
  }
}
