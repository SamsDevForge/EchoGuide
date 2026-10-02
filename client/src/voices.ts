/** English voices that the browser reports as installed on this device. */
export function availableGuidanceVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return [];
  try {
    return (
      window.speechSynthesis.getVoices?.().filter(isLocalEnglishVoice) ?? []
    );
  } catch {
    // Some browsers cannot enumerate voices until their speech engine is ready.
    return [];
  }
}

function isLocalEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.localService === true && /^en(?:[-_]|$)/i.test(voice.lang);
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const locale =
    typeof navigator === "undefined"
      ? ""
      : navigator.language.toLowerCase().replace("_", "-");
  const lang = voice.lang.toLowerCase().replace("_", "-");
  // Voice quality has priority; locale and the OS default settle close choices.
  return (
    (/(natural|neural)/.test(name) ? 40 : 0) +
    (/(enhanced|premium)/.test(name) ? 20 : 0) +
    (lang === locale ? 8 : 0) +
    (voice.default ? 2 : 0)
  );
}

/** A saved choice wins while installed; otherwise choose the best local English voice. */
export function selectGuidanceVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredURI?: string,
): SpeechSynthesisVoice | null {
  const localEnglish = voices.filter(isLocalEnglishVoice);
  if (preferredURI) {
    const preferred = localEnglish.find(
      (voice) => voice.voiceURI === preferredURI,
    );
    if (preferred) return preferred;
  }
  return (
    [...localEnglish].sort(
      (a, b) =>
        voiceScore(b) - voiceScore(a) ||
        a.name.localeCompare(b.name) ||
        a.voiceURI.localeCompare(b.voiceURI),
    )[0] ?? null
  );
}
