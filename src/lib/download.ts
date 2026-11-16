import JSZip from "jszip";

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveZip(files: { blob: Blob; name: string }[], zipName: string) {
  const zip = new JSZip();
  const seen = new Map<string, number>();
  for (const f of files) {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    zip.file(n ? f.name.replace(/(\.[^.]+)$/, `-${n}$1`) : f.name, f.blob);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), zipName);
}
