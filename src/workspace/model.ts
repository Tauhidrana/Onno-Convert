export type Point = { x: number; y: number };
export type OverlayKind =
  | "text" | "rect" | "ellipse" | "line" | "arrow" | "draw"
  | "image" | "signature" | "whiteout" | "redact" | "field";
export type FieldType = "text" | "multiline" | "checkbox" | "radio" | "dropdown" | "date" | "signature";

export interface FieldSpec {
  type: FieldType;
  name: string;
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  tooltip?: string;
  options?: string[];
  value?: string;
  signer?: string;
}

export interface Overlay {
  id: string;
  kind: OverlayKind;
  page: number;
  /** Normalised top-left position on the displayed page (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  width?: number;
  text?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  font?: "sans" | "bengali";
  points?: Point[];
  dataUrl?: string;
  field?: FieldSpec;
  label?: string;
}

export interface Signer {
  id: string;
  name: string;
  color: string;
}

export const signerColors = ["#6d5efc", "#e11d48", "#059669", "#d97706", "#0891b2"];

export function newId() {
  return crypto.randomUUID?.() ?? `o-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
