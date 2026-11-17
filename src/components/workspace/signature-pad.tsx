"use client";

import { Eraser, ImageUp, PenTool, Type } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const fonts = ["Segoe Script", "Snell Roundhand", "Brush Script MT", "cursive"];

export function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [font, setFont] = useState(fonts[0]);
  const [typed, setTyped] = useState("");
  const [removeWhite, setRemoveWhite] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const imageRef = useRef<HTMLInputElement>(null);

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d")!;
    const p = position(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d")!;
    const p = position(event);
    context.strokeStyle = "#17171b";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setTyped("");
  }

  function saveDrawn() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  }

  function saveTyped() {
    if (!typed.trim()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#17171b";
    context.font = `64px ${font}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(typed, 320, 90);
    onSave(canvas.toDataURL("image/png"));
  }

  async function loadImage(file: File | undefined) {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (removeWhite) {
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const brightness = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
        if (brightness > 225) image.data[i + 3] = 0;
      }
      context.putImageData(image, 0, 0);
    }
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "draw" ? "primary" : "secondary"} onClick={() => setMode("draw")}><PenTool className="h-4 w-4" /> Draw</Button>
        <Button size="sm" variant={mode === "type" ? "primary" : "secondary"} onClick={() => setMode("type")}><Type className="h-4 w-4" /> Type</Button>
        <Button size="sm" variant="secondary" onClick={() => imageRef.current?.click()}><ImageUp className="h-4 w-4" /> Upload image</Button>
        <input ref={imageRef} type="file" accept="image/*" className="sr-only" aria-label="Upload signature image" onChange={(event) => { void loadImage(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => { drawingRef.current = false; }}
          onPointerLeave={() => { drawingRef.current = false; }}
          className="w-full touch-none rounded-xl border border-line bg-white"
          aria-label="Draw your signature"
        />
      ) : (
        <div className="rounded-xl border border-line bg-white p-4">
          <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type your name" aria-label="Signature text" className="w-full border-0 bg-transparent text-center text-4xl text-ink outline-none" style={{ fontFamily: font }} />
          <select value={font} onChange={(event) => setFont(event.target.value)} aria-label="Handwriting style" className="mx-auto mt-2 block rounded-lg border border-line bg-surface px-2 py-1 text-xs">
            {fonts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={removeWhite} onChange={(event) => setRemoveWhite(event.target.checked)} className="accent-brand" />
        Remove white background from uploaded images
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={clear}><Eraser className="h-4 w-4" /> Clear</Button>
        <Button size="sm" onClick={mode === "draw" ? saveDrawn : saveTyped}>Use this signature</Button>
      </div>
      <p className={cn("text-xs text-subtle")}>Signatures are saved only in local storage in this browser.</p>
    </div>
  );
}
