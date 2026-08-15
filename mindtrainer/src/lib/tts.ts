// Thin wrapper over the browser's built-in speech synthesis, used for the
// "Listen" mode. No network, no API key — works entirely on-device.

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, onEnd?: () => void): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  // Chunk long text so the utterance doesn't get cut off on some engines.
  const chunks = text.match(/[^.!?]+[.!?]+|\s*\S+\s*$/g) ?? [text];
  let i = 0;
  const next = () => {
    if (i >= chunks.length) {
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i++].trim());
    u.rate = 1;
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
  };
  next();
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
