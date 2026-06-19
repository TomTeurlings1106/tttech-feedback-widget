"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';

// src/FeedbackWidget.tsx
function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const w = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
var MAX_SCREENSHOT_BYTES = 22e4;
var SCREENSHOT_MAX_DIMENSION = 1600;
var DEFAULT_LABELS = {
  triggerLabel: "Feedback",
  modalTitle: "Geef feedback",
  placeholder: "Wat liep er anders dan verwacht? Wat zou je willen?",
  recordStart: "Spreek in",
  recordStop: "Stop opname",
  recording: "Luisteren\u2026",
  screenshotAdd: "Screenshot toevoegen",
  screenshotReplace: "Andere screenshot",
  screenshotRemove: "Verwijderen",
  submit: "Verstuur",
  sending: "Versturen\u2026",
  cancel: "Annuleer",
  sentTitle: "Bedankt \u2014 je feedback is opgeslagen.",
  sentBody: "We kijken ernaar en passen de tool aan.",
  errorEmpty: "Schrijf of spreek eerst iets in.",
  errorNoSpeech: "Spraakinvoer niet ondersteund in deze browser.",
  errorMicDenied: "Geen microfoon-toegang. Geef toestemming in de browser.",
  errorScreenshotTooBig: "Afbeelding te groot om te versturen.",
  errorImageOnly: "Alleen afbeeldingen worden ondersteund."
};
function FeedbackWidget({
  endpoint,
  apiKey,
  lang = "nl-NL",
  contextHook,
  labels: labelOverrides
}) {
  const t = { ...DEFAULT_LABELS, ...labelOverrides ?? {} };
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("");
  const [transcriptRaw, setTranscriptRaw] = useState("");
  const [interim, setInterim] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [screenshotName, setScreenshotName] = useState(null);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  useEffect(() => {
    if (open && phase === "idle") {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open, phase]);
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
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
    rec.onresult = (e) => {
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
    rec.onerror = (e) => {
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
    }
  }
  async function compressImage(file) {
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
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Kon bestand niet lezen."));
      reader.readAsDataURL(file);
    });
  }
  async function handleFile(e) {
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
          "x-tt-key": apiKey
        },
        body: JSON.stringify({
          message: message.trim(),
          transcript: transcriptRaw || null,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
          screenshotDataUrl,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
          viewportHeight: typeof window !== "undefined" ? window.innerHeight : null,
          context: contextHook?.() ?? null
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server gaf status ${res.status}`);
      }
      setPhase("sent");
      setTimeout(closeWidget, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt.");
      setPhase("idle");
    }
  }, [message, transcriptRaw, screenshotDataUrl, phase, endpoint, apiKey, contextHook, t.errorEmpty]);
  const supportsSpeech = !!getSpeechRecognition();
  const isBusy = phase === "submitting";
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    !open && /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => setOpen(true),
        "aria-label": t.triggerLabel,
        style: triggerStyle,
        children: t.triggerLabel
      }
    ),
    open && /* @__PURE__ */ jsx(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "ttfw-title",
        onClick: (e) => {
          if (e.target === e.currentTarget && !isBusy) closeWidget();
        },
        style: backdropStyle,
        children: /* @__PURE__ */ jsxs("div", { style: cardStyle, children: [
          /* @__PURE__ */ jsxs("div", { style: headerStyle, children: [
            /* @__PURE__ */ jsx("h2", { id: "ttfw-title", style: titleStyle, children: t.modalTitle }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: closeWidget,
                disabled: isBusy,
                "aria-label": "Sluit",
                style: closeButtonStyle,
                children: "\xD7"
              }
            )
          ] }),
          phase === "sent" ? /* @__PURE__ */ jsxs("div", { style: sentBoxStyle, children: [
            /* @__PURE__ */ jsx("div", { style: sentCheckStyle, children: "\u2713" }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: 14, fontWeight: 600 }, children: t.sentTitle }),
            /* @__PURE__ */ jsx("p", { style: { fontSize: 12, color: "#777169", margin: 0 }, children: t.sentBody })
          ] }) : /* @__PURE__ */ jsxs("div", { style: bodyStyle, children: [
            /* @__PURE__ */ jsx(
              "textarea",
              {
                ref: textareaRef,
                value: message + (interim ? " " + interim : ""),
                onChange: (e) => {
                  setMessage(e.target.value);
                  setInterim("");
                },
                rows: 4,
                placeholder: t.placeholder,
                disabled: isBusy,
                style: textareaStyle
              }
            ),
            /* @__PURE__ */ jsxs("div", { style: controlsRowStyle, children: [
              supportsSpeech && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: phase === "recording" ? stopRecording : startRecording,
                  disabled: isBusy,
                  style: phase === "recording" ? recordingButtonStyle : actionButtonStyle,
                  children: phase === "recording" ? t.recordStop : t.recordStart
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => fileInputRef.current?.click(),
                  disabled: isBusy,
                  style: actionButtonStyle,
                  children: screenshotName ? t.screenshotReplace : t.screenshotAdd
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  ref: fileInputRef,
                  type: "file",
                  accept: "image/*",
                  style: { display: "none" },
                  onChange: handleFile
                }
              )
            ] }),
            phase === "recording" && /* @__PURE__ */ jsxs("div", { style: recordingHintStyle, children: [
              "\u25CF ",
              t.recording
            ] }),
            screenshotDataUrl && /* @__PURE__ */ jsxs("div", { style: screenshotPreviewStyle, children: [
              /* @__PURE__ */ jsx(
                "img",
                {
                  src: screenshotDataUrl,
                  alt: screenshotName || "Screenshot",
                  style: { width: 64, height: 64, objectFit: "cover", borderRadius: 6 }
                }
              ),
              /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0, fontSize: 12 }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: "#0e0e0e" }, children: screenshotName || "Screenshot" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setScreenshotDataUrl(null);
                      setScreenshotName(null);
                    },
                    style: linkButtonStyle,
                    children: t.screenshotRemove
                  }
                )
              ] })
            ] }),
            error && /* @__PURE__ */ jsx("p", { style: errorStyle, children: error }),
            /* @__PURE__ */ jsxs("div", { style: footerRowStyle, children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: closeWidget,
                  disabled: isBusy,
                  style: cancelButtonStyle,
                  children: t.cancel
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: submit,
                  disabled: isBusy || !message.trim(),
                  style: submitButtonStyle,
                  children: isBusy ? t.sending : t.submit
                }
              )
            ] })
          ] })
        ] })
      }
    )
  ] });
}
var triggerStyle = {
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
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};
var backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(14,14,14,0.4)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};
var cardStyle = {
  width: "100%",
  maxWidth: 480,
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
  overflow: "hidden"
};
var headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 20px",
  borderBottom: "1px solid #ebe9e6",
  background: "#f2efe9"
};
var titleStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "#0e0e0e"
};
var closeButtonStyle = {
  background: "transparent",
  border: "none",
  fontSize: 20,
  color: "#777169",
  cursor: "pointer",
  padding: 4,
  lineHeight: 1
};
var bodyStyle = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12
};
var textareaStyle = {
  width: "100%",
  padding: "12px 16px",
  background: "#faf8f6",
  border: "1px solid #ebe9e6",
  borderRadius: 12,
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
  outline: "none"
};
var controlsRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8
};
var actionButtonStyle = {
  padding: "8px 14px",
  background: "#ebe9e6",
  color: "#0e0e0e",
  fontSize: 12,
  fontWeight: 600,
  border: "none",
  borderRadius: 8,
  cursor: "pointer"
};
var recordingButtonStyle = {
  ...actionButtonStyle,
  background: "#ff4704",
  color: "#fff"
};
var recordingHintStyle = {
  fontSize: 12,
  color: "#ff4704"
};
var screenshotPreviewStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#f2efe9",
  border: "1px solid #ebe9e6",
  borderRadius: 8,
  padding: 8
};
var linkButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#777169",
  fontSize: 11,
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  marginTop: 4
};
var errorStyle = {
  fontSize: 12,
  color: "#ff4704",
  background: "rgba(255,71,4,0.08)",
  border: "1px solid rgba(255,71,4,0.3)",
  borderRadius: 6,
  padding: "8px 12px",
  margin: 0
};
var footerRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 4,
  alignItems: "center"
};
var cancelButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#777169",
  fontSize: 13,
  cursor: "pointer",
  padding: "8px 12px"
};
var submitButtonStyle = {
  background: "#ff4704",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 16px",
  cursor: "pointer"
};
var sentBoxStyle = {
  padding: "32px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center"
};
var sentCheckStyle = {
  width: 40,
  height: 40,
  borderRadius: 9999,
  background: "#ff4704",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1
};

export { FeedbackWidget };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map