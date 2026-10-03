export type Direction = "left" | "centre" | "right";
export type DepthState = "unavailable" | "invalid" | "valid" | "unaligned";
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Observation {
  timestamp: number;
  trackId: string;
  label: string;
  score: number;
  box: Box;
  direction: Direction;
  horizontalPosition: number;
  distanceMetres: number | null;
  depthSource: "none" | "webxr";
  depthState: DepthState;
}
export interface Preferences {
  volume: number;
  announcementIntervalMs: number;
  spatialMode: "stereo" | "hrtf";
  voiceURI?: string;
  speechRate?: number;
  speechOutput?: "device" | "screen-reader";
  announcementMode?: "automatic" | "on-request";
  focusMode?: "all" | "openings";
}
export const defaults: Preferences = {
  volume: 0.55,
  announcementIntervalMs: 5000,
  spatialMode: "stereo",
  voiceURI: "",
  speechRate: 0.9,
  speechOutput: "device",
  announcementMode: "automatic",
  focusMode: "all",
};
export interface ProviderFrame {
  image: HTMLVideoElement | HTMLCanvasElement;
  timestamp: number;
  width: number;
  height: number;
  depthSource: "none" | "webxr";
}
export interface CameraProvider {
  start(video: HTMLVideoElement): Promise<void>;
  frame(): ProviderFrame | null;
  stop(): void;
}
