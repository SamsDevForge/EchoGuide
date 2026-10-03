import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandListener, parseCommand } from "./commands";
import type { Recognition } from "./commands";

let instances: MockRecognition[];
class MockRecognition implements Recognition {
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 0;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() {
    instances.push(this);
  }
}
describe("optional single-command microphone lifecycle", () => {
  beforeEach(() => {
    instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { language: "en-IN" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("accepts whole supported phrases and rejects incidental command words", () => {
    expect(parseCommand(" EchoGuide, FIND DOORS! ")).toBe("openings");
    expect(parseCommand("Read view.")).toBe("summary");
    expect(parseCommand("pause sensing")).toBe("pause");
    expect(parseCommand("all objects")).toBe("all");
    expect(parseCommand("do not stop sensing")).toBeNull();
    expect(parseCommand("describe scene")).toBeNull();
    expect(parseCommand("start sensing")).toBeNull();
    expect(parseCommand("constructor")).toBeNull();
    expect(parseCommand("Echo guide, pause")).toBe("pause");
  });
  it("processes one final result, aborts the mic and ignores late results", () => {
    const listener = new CommandListener(),
      command = vi.fn(),
      done = vi.fn();
    listener.start(MockRecognition, command, done);
    const recognition = instances[0],
      callback = recognition.onresult!;
    const result = Object.assign([{ transcript: "repeat" }], { isFinal: true });
    callback({ results: [result] });
    callback({ results: [result] });
    expect(recognition.lang).toBe("en-IN");
    expect(recognition.continuous).toBe(false);
    expect(command).toHaveBeenCalledExactlyOnceWith("repeat");
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(9000);
    expect(done).toHaveBeenCalledOnce();
  });
  it("stops after eight seconds and gives a button fallback", () => {
    const listener = new CommandListener(),
      command = vi.fn(),
      done = vi.fn();
    listener.start(MockRecognition, command, done);
    vi.advanceTimersByTime(8000);
    expect(instances[0].abort).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0]).toContain("timed out");
    expect(command).not.toHaveBeenCalled();
  });
  it("cancellation prevents a late pause command from affecting a new session", () => {
    const listener = new CommandListener(),
      command = vi.fn(),
      done = vi.fn();
    listener.start(MockRecognition, command, done);
    const late = instances[0].onresult!;
    listener.cancel();
    listener.start(MockRecognition, command, done);
    late({
      results: [Object.assign([{ transcript: "pause" }], { isFinal: true })],
    });
    expect(command).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    listener.cancel();
  });
  it("handles denied permission without restarting or executing a command", () => {
    const listener = new CommandListener(),
      command = vi.fn(),
      done = vi.fn();
    listener.start(MockRecognition, command, done);
    instances[0].onerror!({ error: "not-allowed" });
    expect(done.mock.calls[0][0]).toContain("not allowed");
    expect(command).not.toHaveBeenCalled();
    expect(instances[0].start).toHaveBeenCalledOnce();
    expect(instances[0].abort).toHaveBeenCalledOnce();
  });
  it("recovers if the browser exposes recognition but cannot construct it", () => {
    class Unavailable extends MockRecognition {
      constructor() {
        super();
        throw new Error("Unavailable");
      }
    }
    const command = vi.fn(),
      done = vi.fn();
    new CommandListener().start(Unavailable, command, done);
    expect(done.mock.calls[0][0]).toContain("could not start");
    expect(command).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
