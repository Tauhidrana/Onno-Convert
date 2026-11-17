"use client";

import { Check, Copy, Download, Mail, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

export function ShareBar({ blob, name, note }: { blob: Blob; name: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const url = URL.createObjectURL(blob);
  const canShare = typeof navigator.canShare === "function" && typeof navigator.share === "function";

  async function webShare() {
    try {
      const file = new File([blob], name, { type: blob.type || "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        setShared(true);
      }
    } catch {
      // The user may cancel the native sheet; nothing left to clean up.
    }
  }

  return (
    <div className="rounded-2xl border border-success/40 bg-success-soft/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success text-[var(--success-contrast)]"><Check className="h-5 w-5" aria-hidden="true" /></span>
        <div className="flex-1">
          <p className="font-semibold" role="status">{name} is ready</p>
          <p className="text-sm text-muted">{(blob.size / 1024).toFixed(1)} KB · created on this device</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="success" onClick={() => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }}><Download className="h-4 w-4" /> Download</Button>
        {canShare && <Button variant="secondary" onClick={() => void webShare()}><Share2 className="h-4 w-4" /> {shared ? "Shared" : "Share file"}</Button>}
        <Button variant="secondary" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent("I'm sharing a PDF. Download it from your device, then attach it here — email links cannot attach files automatically.")}`; }}>
          <Mail className="h-4 w-4" /> Open in email
        </Button>
        <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(name).then(() => setCopied(true)).catch(() => {}); }}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy filename"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">{note ?? "No upload, no hosted link, no account. Email apps cannot attach a local file from a link; attach the downloaded file yourself."}</p>
    </div>
  );
}
