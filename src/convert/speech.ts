import { outputName } from "@/lib/utils";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { ConvertOptions, ConverterModule } from "./types";

const MODEL = "onnx-community/whisper-base";
let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function getTranscriber(onProgress: (progress: number) => void) {
  transcriberPromise ??= (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    return pipeline("automatic-speech-recognition", MODEL, {
      dtype: "q8",
      progress_callback: (info) => {
        if (info.status === "progress_total") {
          onProgress(0.05 + Math.min(info.progress, 100) / 100 * 0.4);
        }
      },
    });
  })().catch((error: unknown) => {
    transcriberPromise = null;
    throw error;
  });
  return transcriberPromise;
}

function srtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export const convert: ConverterModule["convert"] = async (files, opts, onProgress) => {
  const file = files[0];
  if (!file) throw new Error("Choose an audio file to transcribe.");

  const format = opts.format === "srt" ? "srt" : "txt";
  const language = opts.language === "english" || opts.language === "bengali" ? opts.language : undefined;
  if (!language) throw new Error("Choose English or Bengali for this recording.");
  const audioUrl = URL.createObjectURL(file);
  try {
    const { load_audio } = await import("@huggingface/transformers");
    onProgress(0.02);
    const audio = await load_audio(audioUrl, 16_000);
    if (!audio.length) throw new Error("The audio file is empty or could not be decoded.");

    const transcriber = await getTranscriber(onProgress);
    onProgress(0.5);
    const result = await transcriber(audio, {
      task: "transcribe",
      language,
      return_timestamps: format === "srt",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = result.text.trim();
    if (!text) throw new Error("No speech was detected in this audio.");

    let output = text;
    if (format === "srt") {
      const chunks = result.chunks?.filter(
        (chunk) => chunk.text.trim() && chunk.timestamp[1] > chunk.timestamp[0],
      );
      output = chunks?.length
        ? chunks
            .map(({ timestamp, text: chunk }, index) =>
              `${index + 1}\n${srtTime(timestamp[0])} --> ${srtTime(timestamp[1])}\n${chunk.trim()}`,
            )
            .join("\n\n")
        : `1\n${srtTime(0)} --> ${srtTime(audio.length / 16_000)}\n${text}`;
    }

    onProgress(1);
    return [
      {
        blob: new Blob([output], { type: "text/plain;charset=utf-8" }),
        name: outputName(file.name, format),
      },
    ];
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
};
