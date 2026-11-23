export interface PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  clear(color?: string): void;
}

export interface CreatePixelCanvasOptions {
  width: number;
  height: number;
  scale?: number;
  parent?: HTMLElement | null;
}
export function createPixelCanvas(opts: CreatePixelCanvasOptions): PixelCanvas {
  if (opts.parent === null) {
    throw new Error(
      'createPixelCanvas: parent is null — mount point not found (check the id passed to getElementById against index.html)',
    );
  }
  const { width, height } = opts;
  const scale = opts.scale ?? 3;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {throw new Error('2D canvas context unavailable');}
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  (opts.parent ?? document.body).appendChild(canvas);
  return {
    canvas,
    ctx,
    width,
    height,
    scale,
    clear(color = '#000000') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
    },
  };
}
