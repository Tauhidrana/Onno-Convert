type Job = { samples: Float32Array; strength: number };
type Reply =
  | { type: "progress"; value: number }
  | { type: "done"; samples: Float32Array }
  | { type: "error"; message: string };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage: (data: Reply, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (event: MessageEvent<Job>) => {
  try {
    const { samples, strength } = event.data;
    const url = "/rnnoise/rnnoise.js";
    const rnnoiseModule = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as typeof import("@shiguredo/rnnoise-wasm");
    const rnnoise = await rnnoiseModule.Rnnoise.load();
    const state = rnnoise.createDenoiseState();
    const frameSize = rnnoise.frameSize;
    const output = new Float32Array(samples.length);
    for (let offset = 0; offset < samples.length; offset += frameSize) {
      const frame = new Float32Array(frameSize);
      frame.set(samples.subarray(offset, Math.min(offset + frameSize, samples.length)));
      // RNNoise's WASM build works on 16-bit PCM scaled into floats.
      for (let i = 0; i < frame.length; i++) frame[i] *= 32767;
      state.processFrame(frame);
      for (let i = 0; i < frame.length && offset + i < samples.length; i++) {
        const cleaned = Math.max(-1, Math.min(1, frame[i] / 32767));
        output[offset + i] = cleaned * strength + samples[offset + i] * (1 - strength);
      }
      if ((offset / frameSize) % 200 === 0) ctx.postMessage({ type: "progress", value: Math.min(0.95, offset / samples.length) });
    }
    state.destroy();
    ctx.postMessage({ type: "done", samples: output }, [output.buffer]);
  } catch (error) {
    ctx.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
