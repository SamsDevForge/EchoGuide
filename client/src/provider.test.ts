import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoProvider } from "./vision";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("camera permission cancellation", () => {
  it("stops a late camera stream without playing after Stop during the permission prompt", async () => {
    let grantPermission!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      grantPermission = resolve;
    });
    const stopTrack = vi.fn();
    const stream = {
      active: true,
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => permission);
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const play = vi.fn(async () => undefined);
    const video = {
      srcObject: null,
      play,
      readyState: 2,
      videoWidth: 960,
      videoHeight: 720,
    } as unknown as HTMLVideoElement;
    const provider = new VideoProvider();
    const starting = provider.start(video);
    // Attach the rejection assertion before resolving the permission promise.
    const cancelled = expect(starting).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    provider.stop();
    grantPermission(stream);
    await cancelled;
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(provider.frame()).toBeNull();
  });
});

describe("camera frame freshness", () => {
  it("ignores a frozen video frame, accepts advancing video time, and clears capture on Stop", async () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const stopTrack = vi.fn();
    const stream = {
      active: true,
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
    });
    const video = {
      srcObject: null,
      play: vi.fn(async () => undefined),
      currentTime: 0,
      readyState: 2,
      videoWidth: 960,
      videoHeight: 720,
    } as unknown as HTMLVideoElement;
    const provider = new VideoProvider();
    await provider.start(video);
    const first = provider.frame();
    expect(first).toMatchObject({ timestamp: 100, width: 960, height: 720 });
    now = 200;
    expect(provider.frame()).toBeNull();
    expect(provider.frame(true)?.timestamp).toBe(first?.timestamp);
    video.currentTime = 0.1;
    expect(provider.frame()?.timestamp).toBe(200);
    expect(provider.frame()).toBeNull();
    provider.stop();
    expect(video.srcObject).toBeNull();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(provider.frame()).toBeNull();
    expect(provider.frame(true)).toBeNull();

    // Stopping resets frame state, so a new stream can start at video time zero.
    video.currentTime = 0;
    now = 300;
    await provider.start(video);
    expect(provider.frame()?.timestamp).toBe(300);
    provider.stop();
  });
});
