"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Web Speech shims (kept local so the package has zero runtime deps) ──
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognition;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type Phase = "idle" | "recording" | "submitting" | "sent";

const MAX_SCREENSHOT_BYTES = 220_000;
const SCREENSHOT_MAX_DIMENSION = 1600;

export type FeedbackWidgetProps = {
  /** TT Tech portal ingest endpoint, e.g. https://tt-tech-portal.vercel.app/api/v1/feedback/ingest */
  endpoint: string;
  /** Workspace+app-scoped API key (NEXT_PUBLIC, raw key with tt_ prefix). */
  apiKey: string;
  /** Speech recognition language. Default "nl-NL". */
  lang?: string;
  /** Optional context to attach to every submission (sessieId, starter, etc.). */
  contextHook?: () => Record<string, unknown>;
  /** Override Dutch labels (defaults below). */
  labels?: Partial<Labels>;
};

type Labels = {
  triggerLabel: string;
  modalTitle: string;
  placeholder: string;
  recordStart: string;
  recordStop: string;
  recording: string;
  screenshotAdd: string;
  screenshotReplace: string;
  screenshotRemove: string;
  submit: string;
  sending: string;
  cancel: string;
  sentTitle: string;
  sentBody: string;
  errorEmpty: string;
  errorNoSpeech: string;
  errorMicDenied: string;
  errorScreenshotTooBig: string;
  errorImageOnly: string;
};

const DEFAULT_LABELS: Labels = {
  triggerLabel: "Feedback",
  modalTitle: "Geef feedback",
  placeholder: "Wat liep er anders dan verwacht? Wat zou je willen?",
  recordStart: "Spreek in",
  recordStop: "Stop opname",
  recording: "Luisteren…",
  screenshotAdd: "Screenshot toevoegen",
  screenshotReplace: "Andere screenshot",
  screenshotRemove: "Verwijderen",
  submit: "Verstuur",
  sending: "Versturen…",
  cancel: "Annuleer",
  sentTitle: "Bedankt — je feedback is opgeslagen.",
  sentBody: "We kijken ernaar en passen de tool aan.",
  errorEmpty: "Schrijf of spreek eerst iets in.",
  errorNoSpeech: "Spraakinvoer niet ondersteund in deze browser.",
  errorMicDenied: "Geen microfoon-toegang. Geef toestemming in de browser.",
  errorScreenshotTooBig: "Afbeelding te groot om te versturen.",
  errorImageOnly: "Alleen afbeeldingen worden ondersteund.",
};

export function FeedbackWidget({
  endpoint,
  apiKey,
  lang = "nl-NL",
  contextHook,
  labels: labelOverrides,
}: FeedbackWidgetProps) {
  const t = { ...DEFAULT_LABELS, ...(labelOverrides ?? {}) };

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [transcriptRaw, setTranscriptRaw] = useState("");
  const [interim, setInterim] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus textarea on open
  useEffect(() => {
    if (open && phase === "idle") {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open, phase]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  function resetForm() {
    setMessage("");
    setTranscriptRaw("");
    setInterim("");
    setScreenshotDataUrl(null);
    setScreenshotName(null);
    setError(null);
    setPhase("idle");
  }

  function closeWidget() {
    if (phase === "recording") {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    }
    setOpen(false);
    setTimeout(resetForm, 200);
  }

  function startRecording() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(t.errorNoSpeech);
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (r.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) {
        setMessage((prev) => {
          const sep = prev && !prev.endsWith(" ") ? " " : "";
          return prev + sep + finalChunk.trim();
        });
        setTranscriptRaw((prev) => prev + (prev ? " " : "") + finalChunk.trim());
      }
      setInterim(interimChunk);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(e.error === "not-allowed" ? t.errorMicDenied : `Spraakherkenning faalde (${e.error}).`);
      setPhase("idle");
      setInterim("");
    };

    rec.onend = () => {
      setPhase("idle");
      setInterim("");
    };

    recognitionRef.current = rec;
    setError(null);
    setInterim("");
    setPhase("recording");
    try {
      rec.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon opname niet starten.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }

  async function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const { width, height } = img;
          const max = SCREENSHOT_MAX_DIMENSION;
          const scale = Math.min(1, max / Math.max(width, height));
          const w = Math.round(width * scale);
          const h = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas-context-mislukt"));
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL("image/jpeg", 0.78);
          if (dataUrl.length > MAX_SCREENSHOT_BYTES) {
            dataUrl = canvas.toDataURL("image/jpeg", 0.55);
          }
          if (dataUrl.length > MAX_SCREENSHOT_BYTES) {
            dataUrl = canvas.toDataURL("image/jpeg", 0.35);
          }
          if (dataUrl.length > MAX_SCREENSHOT_BYTES) {
            return reject(new Error(t.errorScreenshotTooBig));
          }
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Kon afbeelding niet laden."));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Kon bestand niet lezen."));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.errorImageOnly);
      return;
    }
    setError(null);
    try {
      const dataUrl = await compressImage(file);
      setScreenshotDataUrl(dataUrl);
      setScreenshotName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon afbeelding niet verwerken.");
    }
  }

  const submit = useCallback(async () => {
    if (!message.trim()) {
      setError(t.errorEmpty);
      return;
    }
    if (phase === "recording") stopRecording();
    setError(null);
    setPhase("submitting");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tt-key": apiKey,
        },
        body: JSON.stringify({
          message: message.trim(),
          transcript: transcriptRaw || null,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
          screenshotDataUrl,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
          viewportHeight: typeof window !== "undefined" ? window.innerHeight : null,
          context: contextHook?.() ?? null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Server gaf status ${res.status}`);
      }
      setPhase("sent");
      setTimeout(closeWidget, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt.");
      setPhase("idle");
    }
    // closeWidget is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, transcriptRaw, screenshotDataUrl, phase, endpoint, apiKey, contextHook, t.errorEmpty]);

  const supportsSpeech = !!getSpeechRecognition();
  const isBusy = phase === "submitting";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.triggerLabel}
          style={triggerStyle}
        >
          {t.triggerLabel}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ttfw-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isBusy) closeWidget();
          }}
          style={backdropStyle}
        >
          <div style={cardStyle}>
            <div style={headerStyle}>
              <h2 id="ttfw-title" style={titleStyle}>
                {t.modalTitle}
              </h2>
              <button
                type="button"
                onClick={closeWidget}
                disabled={isBusy}
                aria-label="Sluit"
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            {phase === "sent" ? (
              <div style={sentBoxStyle}>
                <div style={sentCheckStyle}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.sentTitle}</div>
                <p style={{ fontSize: 12, color: "#777169", margin: 0 }}>{t.sentBody}</p>
              </div>
            ) : (
              <div style={bodyStyle}>
                <textarea
                  ref={textareaRef}
                  value={message + (interim ? " " + interim : "")}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setInterim("");
                  }}
                  rows={4}
                  placeholder={t.placeholder}
                  disabled={isBusy}
                  style={textareaStyle}
                />

                <div style={controlsRowStyle}>
                  {supportsSpeech && (
                    <button
                      type="button"
                      onClick={phase === "recording" ? stopRecording : startRecording}
                      disabled={isBusy}
                      style={phase === "recording" ? recordingButtonStyle : actionButtonStyle}
                    >
                      {phase === "recording" ? t.recordStop : t.recordStart}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    style={actionButtonStyle}
                  >
                    {screenshotName ? t.screenshotReplace : t.screenshotAdd}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFile}
                  />
                </div>

                {phase === "recording" && <div style={recordingHintStyle}>● {t.recording}</div>}

                {screenshotDataUrl && (
                  <div style={screenshotPreviewStyle}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotDataUrl}
                      alt={screenshotName || "Screenshot"}
                      style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }}
                    />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: "#0e0e0e" }}>
                        {screenshotName || "Screenshot"}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScreenshotDataUrl(null);
                          setScreenshotName(null);
                        }}
                        style={linkButtonStyle}
                      >
                        {t.screenshotRemove}
                      </button>
                    </div>
                  </div>
                )}

                {error && <p style={errorStyle}>{error}</p>}

                <div style={footerRowStyle}>
                  <button
                    type="button"
                    onClick={closeWidget}
                    disabled={isBusy}
                    style={cancelButtonStyle}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isBusy || !message.trim()}
                    style={submitButtonStyle}
                  >
                    {isBusy ? t.sending : t.submit}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Styles (inline so consumers don't need to import a CSS file) ──

const triggerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 9999,
  padding: "10px 20px",
  borderRadius: 9999,
  background: "#0e0e0e",
  color: "#faf8f6",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(14,14,14,0.4)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 480,
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 20px",
  borderBottom: "1px solid #ebe9e6",
  background: "#f2efe9",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "#0e0e0e",
};

const closeButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 20,
  color: "#777169",
  cursor: "pointer",
  padding: 4,
  lineHeight: 1,
};

const bodyStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "#faf8f6",
  border: "1px solid #ebe9e6",
  borderRadius: 12,
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
  outline: "none",
};

const controlsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#ebe9e6",
  color: "#0e0e0e",
  fontSize: 12,
  fontWeight: 600,
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const recordingButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "#ff4704",
  color: "#fff",
};

const recordingHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#ff4704",
};

const screenshotPreviewStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#f2efe9",
  border: "1px solid #ebe9e6",
  borderRadius: 8,
  padding: 8,
};

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#777169",
  fontSize: 11,
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  marginTop: 4,
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#ff4704",
  background: "rgba(255,71,4,0.08)",
  border: "1px solid rgba(255,71,4,0.3)",
  borderRadius: 6,
  padding: "8px 12px",
  margin: 0,
};

const footerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 4,
  alignItems: "center",
};

const cancelButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#777169",
  fontSize: 13,
  cursor: "pointer",
  padding: "8px 12px",
};

const submitButtonStyle: React.CSSProperties = {
  background: "#ff4704",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 16px",
  cursor: "pointer",
};

const sentBoxStyle: React.CSSProperties = {
  padding: "32px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const sentCheckStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 9999,
  background: "#ff4704",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1,
};
