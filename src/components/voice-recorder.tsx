"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

export function VoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("Microphone audio stays on this device.");
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const disposedRef = useRef(false);
  const playbackRef = useRef<string | null>(null);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    timerRef.current = null;
    frameRef.current = null;
    void audioRef.current?.close();
    audioRef.current = null;
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
      cleanup();
      if (playbackRef.current) URL.revokeObjectURL(playbackRef.current);
    };
  }, []);

  async function startRecording() {
    setError("");
    setSeconds(0);
    setLevel(0);
    setStatus("Requesting microphone access…");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Try a recent Chrome, Edge or Firefox.");
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
        cleanup();
        recorderRef.current = null;
        setRecording(false);
        setLevel(0);
        if (!blob.size) {
          setError("No audio was captured. Check the microphone and try again.");
          setStatus("");
          return;
        }

        const type = blob.type || recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        if (playbackRef.current) URL.revokeObjectURL(playbackRef.current);
        const url = URL.createObjectURL(blob);
        playbackRef.current = url;
        setPlayback(url);
        onRecorded(new File([blob], `voice-recording.${extension}`, { type }));
        setStatus(`Recording ready — preview it below, then choose MP3 or WAV and convert.`);
      };
      recorder.onerror = () => {
        cleanup();
        recorderRef.current = null;
        setRecording(false);
        setError("Recording failed. Check the microphone and try again.");
        setStatus("");
      };
      recorder.start();
      setRecording(true);
      setStatus("Recording…");

      const context = new AudioContext();
      audioRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const readLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += ((value - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        frameRef.current = requestAnimationFrame(readLevel);
      };
      readLevel();
      const started = Date.now();
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 200);
    } catch (cause) {
      cleanup();
      if (!disposedRef.current) {
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone access was denied. Allow the microphone in your browser's site settings, then try again."
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

  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-[var(--accent-text)] ${recording ? "animate-pulse" : ""}`}>
          <Mic className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-lg font-semibold">Record a voice note</p>
        <p className="text-sm text-muted" role="status" aria-live="polite">{status}</p>
        {recording && (
          <div className="w-full max-w-xs">
            <p className="font-mono text-2xl tabular-nums" aria-label={`Recording time ${timer}`}>{timer}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-2 text-sm text-danger" role="alert">{error}</p>
        )}
        {recording ? (
          <Button size="lg" variant="secondary" onClick={stopRecording} className="min-w-48">
            <Square className="h-4 w-4" /> Stop recording
          </Button>
        ) : (
          <Button size="lg" onClick={startRecording} loading={starting} className="min-w-48">
            <Mic className="h-4 w-4" /> {starting ? "Requesting microphone…" : "Start recording"}
          </Button>
        )}
        {playback && <audio controls src={playback} className="w-full max-w-sm" aria-label="Preview your recording" />}
        <p className="text-xs text-subtle">Recording and conversion happen on this device. Nothing is uploaded.</p>
      </div>
    </section>
  );
}
