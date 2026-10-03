export type VoiceCommand =
  "pause" | "repeat" | "summary" | "status" | "openings" | "all";

export function parseCommand(text: string): VoiceCommand | null {
  const command = text
    .toLowerCase()
    .replace(/[.!?,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^echo\s*guide /, "");
  // Match whole phrases; an unrelated sentence containing "stop" is not a command.
  const phrases: Record<string, VoiceCommand> = {
    pause: "pause",
    stop: "pause",
    "pause sensing": "pause",
    "stop sensing": "pause",
    repeat: "repeat",
    "repeat guidance": "repeat",
    "read view": "summary",
    "current view": "summary",
    "what is here": "summary",
    "what's here": "summary",
    status: "status",
    "read status": "status",
    "find doors": "openings",
    "find gates": "openings",
    "gates and doors": "openings",
    "all objects": "all",
    "find all objects": "all",
  };
  return Object.hasOwn(phrases, command) ? phrases[command] : null;
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export type RecognitionFactory = new () => Recognition;
export function recognitionFactory(): RecognitionFactory | undefined {
  const browser = window as Window & {
    SpeechRecognition?: RecognitionFactory;
    webkitSpeechRecognition?: RecognitionFactory;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export class CommandListener {
  private active: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  start(
    factory: RecognitionFactory,
    onCommand: (command: VoiceCommand) => void,
    onDone: (message: string) => void,
  ) {
    this.cancel();
    let recognition: Recognition;
    try {
      recognition = new factory();
    } catch {
      onDone("Voice command could not start. Use the buttons instead.");
      return;
    }
    this.active = recognition;
    recognition.lang = navigator.language?.startsWith("en")
      ? navigator.language
      : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const finish = (message: string, command?: VoiceCommand) => {
      if (this.active !== recognition) return;
      this.cancel();
      onDone(message);
      if (command) onCommand(command);
    };
    recognition.onresult = (event) => {
      const result = event.results[0];
      if (!result?.isFinal) return;
      const command = parseCommand(result[0]?.transcript ?? "");
      finish(
        command
          ? "Voice command received."
          : "Command not recognised. Use the buttons or try again.",
        command ?? undefined,
      );
    };
    recognition.onerror = (event) =>
      finish(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was not allowed. All actions are available as buttons."
          : "Voice command unavailable. Use the buttons or try again.",
      );
    recognition.onend = () =>
      finish("No command heard. Use the buttons or try again.");
    this.timer = setTimeout(
      () => finish("Listening timed out. Use the buttons or try again."),
      8000,
    );
    try {
      recognition.start();
    } catch {
      finish("Voice command could not start. Use the buttons instead.");
    }
  }
  cancel() {
    const recognition = this.active;
    this.active = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* Browser may already have stopped. */
      }
    }
  }
}
