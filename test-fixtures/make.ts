// Regenerates the binary fixtures. Run: bun test-fixtures/make.ts
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const dir = "test-fixtures";
mkdirSync(dir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function makePng(width = 320, height = 200) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const i = 1 + x * 3;
      row[i] = Math.round((x / width) * 255);
      row[i + 1] = Math.round((y / height) * 255);
      row[i + 2] = 180;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = `${dir}/sample.png`;
writeFileSync(png, makePng());

for (const [format, name] of [
  ["jpeg", "sample.jpg"],
  ["tiff", "sample.tiff"],
  ["heic", "sample.heic"],
  ["avif", "sample.avif"],
  ["gif", "sample.gif"],
  ["bmp", "sample.bmp"],
] as const) {
  execFileSync("sips", ["-s", "format", format, png, "--out", `${dir}/${name}`], { stdio: "ignore" });
}

writeFileSync(
  `${dir}/sample.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#efeaff"/>
  <circle cx="100" cy="100" r="60" fill="#6d5efc"/>
  <rect x="160" y="45" width="110" height="110" rx="18" fill="#ffb4a2"/>
  <text x="160" y="30" font-family="Helvetica, Arial" font-size="20" fill="#141416">Onno</text>
</svg>`,
);

// 2-second sine wave, 44.1 kHz mono 16-bit.
const sampleRate = 44100;
const seconds = 2;
const samples = sampleRate * seconds;
const pcm = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) {
  const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
  pcm.writeInt16LE(v, i * 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
writeFileSync(`${dir}/sample.wav`, Buffer.concat([header, pcm]));

writeFileSync(`${dir}/sample.txt`, "Onno Convert\n\nHello from a text fixture.\nSecond line.\nBangla: অন্ন পথ\n");

writeFileSync(`${dir}/sample.csv`, "name,qty,price\npencil,3,1.50\nnotebook,1,4.00\nsharpener,2,0.75\n");

const sheet = XLSX.utils.aoa_to_sheet([
  ["name", "qty", "price"],
  ["pencil", 3, 1.5],
  ["notebook", 1, 4],
  ["sharpener", 2, 0.75],
]);
const second = XLSX.utils.aoa_to_sheet([["note"], ["second sheet"]]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, "Items");
XLSX.utils.book_append_sheet(book, second, "Notes");
XLSX.writeFile(book, `${dir}/sample.xlsx`);

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let page = 1; page <= 3; page++) {
  const p = pdf.addPage([595.28, 841.89]);
  p.drawText(`Onno Convert fixture`, { x: 60, y: 760, size: 22, font });
  p.drawText(`Page ${page} of 3`, { x: 60, y: 730, size: 12, font });
  p.drawRectangle({ x: 60, y: 640, width: 200, height: 60, color: rgb(0.43, 0.37, 0.99) });
  p.drawText("Extractable text layer.", { x: 60, y: 600, size: 12, font });
}
writeFileSync(`${dir}/sample.pdf`, await pdf.save());

const textPdf = await PDFDocument.create();
const textPage = textPdf.addPage([595.28, 841.89]);
textPage.drawText("Scanned-style page with no text layer.", { x: 60, y: 700, size: 14, font });
writeFileSync(`${dir}/sample-text.pdf`, await textPdf.save());

const epub = new JSZip();
epub.file("mimetype", "application/epub+zip");
epub.file(
  "META-INF/container.xml",
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
);
epub.file(
  "OEBPS/content.opf",
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>
  <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
);
epub.file("OEBPS/ch1.xhtml", `<html><body><h1>Chapter One</h1><p>Onno Convert reads this paragraph.</p><p>Second paragraph &amp; more.</p></body></html>`);
epub.file("OEBPS/ch2.xhtml", `<html><body><h1>Chapter Two</h1><p>Another chapter for the text test.</p></body></html>`);
writeFileSync(`${dir}/sample.epub`, await epub.generateAsync({ type: "nodebuffer" }));

console.log("fixtures written to", dir);
