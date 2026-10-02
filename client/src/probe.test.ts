import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newReport, XRProbe, type ProbeReport } from "./probe";

class Session {
  depthUsage = "cpu-optimized";
  renderState: { baseLayer?: { framebuffer: object } } = {};
  callback: ((time: number, frame: XRFrame) => void) | null = null;
  listeners: (() => void)[] = [];
  updateRenderState = vi.fn((state) => {
    this.renderState = state;
  });
  requestReferenceSpace = vi.fn(async () => ({}));
  requestAnimationFrame = vi.fn((callback) => {
    this.callback = callback;
  });
  addEventListener = vi.fn((_name, callback) => {
    this.listeners.push(callback);
  });
  end = vi.fn(async () => {
    this.listeners.forEach((callback) => callback());
  });
}
let session: Session;
let requestSession: ReturnType<typeof vi.fn>;
let gl: Record<string, unknown>;
let reports: ProbeReport[];
const update = (report: ProbeReport) => reports.push(report);
const overlay = {} as HTMLElement;
const latest = () => reports[reports.length - 1];
const frame = (samples = 2, tracking = true) =>
  ({
    getViewerPose: () => (tracking ? { views: [{}] } : null),
    getDepthInformation: vi.fn(() => ({ getDepthInMeters: () => samples })),
  }) as unknown as XRFrame;

beforeEach(() => {
  vi.useFakeTimers();
  session = new Session();
  requestSession = vi.fn(async () => session);
  reports = [];
  gl = {
    makeXRCompatible: vi.fn(async () => {}),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
    bindFramebuffer: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
  };
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", {
    xr: { requestSession },
    userAgent: "test browser",
  });
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => gl }),
  });
  vi.stubGlobal(
    "XRWebGLLayer",
    class {
      framebuffer = {};
    },
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AR depth independent of optional raw camera access", () => {
  it("requests from the tap and reads CPU depth without a camera binding", async () => {
    const probe = new XRProbe();
    const started = probe.start(newReport(), update, overlay);
    // No asynchronous support probe consumes the gesture before requesting AR.
    expect(requestSession).toHaveBeenCalledOnce();
    const init = requestSession.mock.calls[0][1];
    expect(init.requiredFeatures).toEqual(["depth-sensing"]);
    expect(init.optionalFeatures).toContain("camera-access");
    await started;
    session.callback!(600, frame());
    expect(latest().centreDepthMetres).toBe(2);
    expect(latest().validDepthFrames).toBe(1);
    expect(latest().simultaneousFrames).toBe(0);
    expect(latest().pixels).toContain("depth checked independently");
    probe.stop();
  });
  it("keeps depth readings when camera shader setup fails", async () => {
    (window as unknown as Record<string, unknown>).XRWebGLBinding = class {
      getCameraImage() {
        return {};
      }
    };
    const probe = new XRProbe();
    await probe.start(newReport(), update, overlay);
    session.callback!(600, frame());
    expect(latest().pixels).toContain("Camera readback unavailable");
    expect(latest().validDepthFrames).toBe(1);
    expect(latest().centreDepthMetres).toBe(2);
    probe.stop();
  });
  it("reports GPU-only depth without inventing CPU metric readings", async () => {
    session.depthUsage = "gpu-optimized";
    (window as unknown as Record<string, unknown>).XRWebGLBinding = class {
      getDepthInformation() {
        return { width: 32, height: 24, texture: {} };
      }
    };
    const probe = new XRProbe();
    await probe.start(newReport(), update, overlay);
    const sampleFrame = frame();
    session.callback!(600, sampleFrame);
    expect(sampleFrame.getDepthInformation).not.toHaveBeenCalled();
    expect(latest().depthBufferFrames).toBe(1);
    expect(latest().validDepthFrames).toBe(0);
    expect(latest().centreDepthMetres).toBeNull();
    probe.stop();
  });
  it("clears previous readings and records unsupported-session errors", async () => {
    requestSession.mockRejectedValue(
      new DOMException("Requested feature unsupported", "NotSupportedError"),
    );
    const previous = {
      ...newReport(),
      centreDepthMetres: 2,
      validDepthFrames: 4,
    };
    await expect(
      new XRProbe().start(previous, update, overlay),
    ).rejects.toThrow("unsupported");
    expect(latest().phase).toBe("unavailable");
    expect(latest().centreDepthMetres).toBeNull();
    expect(latest().validDepthFrames).toBe(0);
    expect(latest().error).toContain("NotSupportedError");
    expect(latest().note).toContain("browser's AR service");
  });
  it("ends the session and reports unavailable when WebGL cannot initialize", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => null }),
    });
    await expect(
      new XRProbe().start(newReport(), update, overlay),
    ).rejects.toThrow("WebGL2");
    expect(session.end).toHaveBeenCalledOnce();
    expect(latest().phase).toBe("unavailable");
    expect(latest().note).toContain("Camera and voice guidance can still work");
  });
  it("distinguishes tracking with no depth from tracking never initialized", async () => {
    const probe = new XRProbe();
    await probe.start(newReport(), update, overlay);
    const noDepth = {
      getViewerPose: () => ({ views: [{}] }),
      getDepthInformation: () => null,
    } as unknown as XRFrame;
    session.callback!(600, noDepth);
    await session.end();
    expect(latest().phase).toBe("complete");
    expect(latest().note).toContain("tracked the scene but returned no depth");
    await probe.start(newReport(), update, overlay);
    session.callback!(600, frame(2, false));
    await session.end();
    expect(latest().note).toContain("tracking did not initialize");
  });
  it("finishes automatically, clears the last current reading and cancels the timer on stop", async () => {
    const probe = new XRProbe();
    await probe.start(newReport(), update, overlay);
    session.callback!(600, frame());
    await vi.advanceTimersByTimeAsync(25000);
    expect(latest().phase).toBe("complete");
    expect(latest().centreDepthMetres).toBeNull();
    expect(latest().note).toContain("Live object distances remain unavailable");
    await probe.start(newReport(), update, overlay);
    probe.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("closes late permission results without overwriting a stopped check", async () => {
    let resolve!: (s: Session) => void;
    requestSession.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const probe = new XRProbe();
    const pending = probe.start(newReport(), update, overlay);
    probe.stop();
    const count = reports.length;
    resolve(session);
    await expect(pending).rejects.toThrow("cancelled");
    expect(session.end).toHaveBeenCalledOnce();
    expect(reports).toHaveLength(count);
    expect(session.requestAnimationFrame).not.toHaveBeenCalled();
  });
  it("ignores old frames and end callbacks after restart", async () => {
    const probe = new XRProbe();
    await probe.start(newReport(), update, overlay);
    const previous = session;
    const oldCallback = previous.callback!;
    session = new Session();
    await probe.start(newReport(), update, overlay);
    const count = reports.length;
    oldCallback(900, frame());
    await previous.end();
    expect(reports).toHaveLength(count);
    session.callback!(600, frame());
    expect(latest().validDepthFrames).toBe(1);
    probe.stop();
  });
});
