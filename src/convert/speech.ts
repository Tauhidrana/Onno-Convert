import { outputName } from "@/lib/utils";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { ConverterModule } from "./types";

type ModelSize = "tiny" | "base" | "small";
type Language = "en" | "bn";
type GeneratedTensor = { tolist: () => unknown };

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let currentModelSize: ModelSize | null = null;

function isGeneratedTensor(value: unknown): value is GeneratedTensor {
  return typeof value === "object" && value !== null && "tolist" in value && typeof value.tolist === "function";
}

function getTranscriber(size: ModelSize, onProgress: (progress: number) => void) {
  if (currentModelSize === size && transcriberPromise) return transcriberPromise;

  const previous = transcriberPromise;
  currentModelSize = size;
  transcriberPromise = (async () => {
    if (previous) await (await previous).dispose();
    const { pipeline } = await import("@huggingface/transformers");
    return pipeline("automatic-speech-recognition", `onnx-community/whisper-${size}`, {
      dtype: "q8",
      progress_callback: (info) => {
        if (info.status === "progress_total") {
          onProgress(0.05 + Math.min(info.progress, 100) / 100 * 0.4);
        }
      },
    });
  })().catch((error: unknown) => {
    if (currentModelSize === size) {
      currentModelSize = null;
      transcriberPromise = null;
    }
    throw error;
  });
  return transcriberPromise;
}

async function detectLanguage(
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
): Promise<Language> {
  const inputs = await transcriber.processor(audio);
  const startToken = transcriber.model.generation_config?.decoder_start_token_id;
  if (startToken === null || startToken === undefined) {
    throw new Error("Whisper language detection is unavailable for this model.");
  }

  const generated = await transcriber.model.generate({
    inputs: inputs.input_features,
    decoder_input_ids: [startToken],
    max_new_tokens: 1,
  });
  const sequences =
    isGeneratedTensor(generated)
      ? generated
      : typeof generated === "object" && generated !== null && "sequences" in generated
        ? generated.sequences
        : null;
  if (!isGeneratedTensor(sequences)) throw new Error("Whisper language detection returned no tokens.");
  const rows = sequences.tolist();
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0].length < 2) {
    throw new Error("Whisper language detection returned an invalid token sequence.");
  }
  const tokenId = Number(rows[0][1]);
  if (!Number.isSafeInteger(tokenId)) throw new Error("Whisper language detection returned an invalid token ID.");
  const firstToken = transcriber.tokenizer.decode([tokenId], { skip_special_tokens: false });
  const detected = firstToken.match(/^<\|([a-z]{2,3})\|>$/)?.[1];
  if (detected === "en" || detected === "bn") return detected;
  throw new Error("Auto detected a language other than Bangla or English. Choose a language manually.");
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
  const languageOption = opts.language;
  if (languageOption !== "en" && languageOption !== "bn" && languageOption !== "auto") {
    throw new Error("Choose Bangla, English, or Auto for this recording.");
  }
  const modelSize = opts.modelSize;
  if (modelSize !== "tiny" && modelSize !== "base" && modelSize !== "small") {
    throw new Error("Choose a Whisper model size.");
  }
  const audioUrl = URL.createObjectURL(file);
  try {
    const { load_audio } = await import("@huggingface/transformers");
    onProgress(0.02);
    const audio = await load_audio(audioUrl, 16_000);
    if (!audio.length) throw new Error("The audio file is empty or could not be decoded.");

    const transcriber = await getTranscriber(modelSize, onProgress);
    onProgress(0.5);
    const language =
      languageOption === "auto" ? await detectLanguage(transcriber, audio) : languageOption;
    onProgress(0.58);
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
