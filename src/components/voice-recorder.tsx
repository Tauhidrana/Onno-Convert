"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function VoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("Microphone audio stays on this device.");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const disposedRef = useRef(false);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      releaseStream();
    };
  }, []);

  async function startRecording() {
    setError("");
    setStatus("Requesting microphone access…");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording.");
      setStatus("");
      return;
    }

    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        releaseStream();
        recorderRef.current = null;
        setRecording(false);
        if (!blob.size) {
          setError("No audio was captured. Check the microphone and try again.");
          setStatus("");
          return;
        }

        const type = blob.type || recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        onRecorded(new File([blob], `voice-recording.${extension}`, { type }));
        setStatus("Recording ready. Choose MP3 or WAV and convert.");
      };
      recorder.onerror = () => {
        releaseStream();
        recorderRef.current = null;
        setRecording(false);
        setError("Recording failed. Check the microphone and try again.");
        setStatus("");
      };
      recorder.start();
      setRecording(true);
      setStatus("Recording…");
    } catch (cause) {
      releaseStream();
      if (!disposedRef.current) {
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone access was denied."
            : cause instanceof Error
              ? cause.message
              : "Could not start microphone recording.",
        );
        setStatus("");
      }
    } finally {
      if (!disposedRef.current) setStarting(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-black/15 bg-white px-6 py-10 text-center dark:border-white/15 dark:bg-white/[0.03]">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand/20 dark:text-violet-300">
          <Mic className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium">Record a voice note with your microphone</p>
        <p className="text-xs text-black/45 dark:text-white/45" role="status" aria-live="polite">
          {status}
        </p>
        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Square className="h-4 w-4" /> Stop recording
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:bg-white dark:text-black"
          >
            <Mic className="h-4 w-4" /> {starting ? "Requesting microphone…" : "Start recording"}
          </button>
        )}
      </div>
    </section>
  );
}
