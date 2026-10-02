import { afterEach, describe, expect, it, vi } from "vitest";
import { availableGuidanceVoices, selectGuidanceVoice } from "./voices";

const voice = (name: string, lang: string, localService = true) =>
  ({
    name,
    lang,
    localService,
    voiceURI: name,
    default: false,
  }) as SpeechSynthesisVoice;

afterEach(() => vi.unstubAllGlobals());

describe("local guidance voices", () => {
  it("only offers installed English voices, never remote-service voices", () => {
    const local = voice("English Local", "en-US");
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => [
          voice("Remote Natural", "en-US", false),
          voice("French Local", "fr-FR"),
          local,
        ],
      },
    });
    expect(availableGuidanceVoices()).toEqual([local]);
    expect(
      selectGuidanceVoice([voice("Remote Natural", "en-US", false)]),
    ).toBeNull();
  });

  it("honours an installed saved voice and otherwise favours higher quality", () => {
    const basic = voice("Basic", "en-US");
    const natural = voice("Natural Enhanced", "en-GB");
    expect(selectGuidanceVoice([basic, natural])?.voiceURI).toBe(
      natural.voiceURI,
    );
    expect(selectGuidanceVoice([basic, natural], basic.voiceURI)).toBe(basic);
    expect(selectGuidanceVoice([basic, natural], "missing")).toBe(natural);
    expect(
      selectGuidanceVoice(
        [basic, natural],
        voice("Remote", "en-US", false).voiceURI,
      ),
    ).toBe(natural);
  });
});
