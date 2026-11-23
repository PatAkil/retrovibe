export interface Crt {
  render(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number): void;
}

export interface CrtOptions {
  scanlineAlpha?: number;
  vignetteAlpha?: number;
  flicker?: number;
  halation?: number;
  lift?: string;
}

interface Size {
  width: number;
  height: number;
}

const PHOSPHOR_LIFT = 'rgb(15,17,28)';
const HALATION_ALPHA = 0.09;

function createSnapshot(): (source: HTMLCanvasElement) => HTMLCanvasElement | null {
  let snap: HTMLCanvasElement | null = null;
  let snapCtx: CanvasRenderingContext2D | null = null;
  function ensure(source: HTMLCanvasElement): CanvasRenderingContext2D | null {
    if (snap?.width === source.width && snap.height === source.height) {return snapCtx;}
    snap = document.createElement('canvas');
    snap.width = source.width;
    snap.height = source.height;
    snapCtx = snap.getContext('2d');
    if (snapCtx) {snapCtx.imageSmoothingEnabled = false;}
    return snapCtx;
  }
  return (source) => {
    const target = ensure(source);
    if (!target) {return null;}
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'copy';
    target.drawImage(source, 0, 0);
    target.globalCompositeOperation = 'source-over';
    return target.canvas;
  };
}

function createVignette(alpha: number): (ctx: CanvasRenderingContext2D, size: Size) => CanvasGradient {
  let grad: CanvasGradient | null = null;
  let gradW = -1;
  let gradH = -1;
  return (ctx, { width, height }) => {
    if (grad && gradW === width && gradH === height) {return grad;}
    const cx = width / 2;
    const cy = height / 2;
    const outer = Math.max(width, height) * 0.86;
    const g = ctx.createRadialGradient(cx, cy, outer * 0.42, cx, cy, outer);
    g.addColorStop(0, 'rgba(4,6,14,0)');
    g.addColorStop(0.62, `rgba(4,6,14,${(alpha * 0.3).toFixed(4)})`);
    g.addColorStop(1, `rgba(4,6,14,${alpha.toFixed(4)})`);
    grad = g;
    gradW = width;
    gradH = height;
    return g;
  };
}

function drawHalation(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, alpha: number): void {
  const dw = ctx.canvas.width;
  const dh = ctx.canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(source, 1, 0, dw - 1, dh, 0, 0, dw - 1, dh);
  ctx.drawImage(source, dw - 1, 0, 1, dh, dw - 1, 0, 1, dh);
  ctx.drawImage(source, 0, 0, dw - 1, dh, 1, 0, dw - 1, dh);
  ctx.drawImage(source, 0, 0, 1, dh, 0, 0, 1, dh);
  ctx.restore();
}

function fillComposite(ctx: CanvasRenderingContext2D, size: Size, mode: GlobalCompositeOperation, fill: string): void {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D, size: Size, fill: string): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = fill;
  for (let y = 0; y < size.height; y += 2) {
    ctx.fillRect(0, y, size.width, 1);
  }
  ctx.restore();
}

export function createCrt(opts: CrtOptions = {}): Crt {
  const scanlineAlpha = opts.scanlineAlpha ?? 0.09;
  const flickerPeak = opts.flicker ?? 0.03;
  const halationAlpha = opts.halation ?? HALATION_ALPHA;
  const lift = opts.lift ?? PHOSPHOR_LIFT;
  const scanGrey = Math.max(0, Math.round(255 * (1 - scanlineAlpha)));
  const scanFill = `rgb(${scanGrey},${scanGrey},${scanGrey})`;
  const snapshot = createSnapshot();
  const vignette = createVignette(opts.vignetteAlpha ?? 0.35);
  let clock = 0;
  function halation(ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas;
    if (halationAlpha <= 0 || canvas.width <= 0 || canvas.height <= 0) {return;}
    const source = snapshot(canvas);
    if (source) {drawHalation(ctx, source, halationAlpha);}
  }
  return {
    render(ctx, width, height, dt) {
      clock += dt;
      const size = { width, height };
      halation(ctx);
      if (lift !== '') {fillComposite(ctx, size, 'lighter', lift);}
      if (scanlineAlpha > 0) {drawScanlines(ctx, size, scanFill);}
      ctx.save();
      ctx.fillStyle = vignette(ctx, size);
      ctx.fillRect(0, 0, width, height);
      if (flickerPeak > 0) {
        const a = flickerPeak * (0.5 + 0.5 * Math.sin(clock * 40));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    },
  };
}
