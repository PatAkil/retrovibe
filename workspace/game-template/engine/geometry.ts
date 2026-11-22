export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CenterRow {
  width: number;
  y: number;
}

export function snapRect(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
}

export function solidRect(r: Rect): Rect | null {
  const s = snapRect(r);
  return s.w <= 0 || s.h <= 0 ? null : s;
}
