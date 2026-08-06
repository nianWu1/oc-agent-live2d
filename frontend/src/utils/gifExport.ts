import GIF from 'gif.js';
import type { Offset } from './spriteUtils';
import { drawFrameWithOffset } from './spriteUtils';

export interface ExportOptions {
  frames: HTMLCanvasElement[];
  frameOrder: number[];
  offsets: Offset[];
  fps: number;
  useOffsets: boolean;
  workerPath?: string;
}

function hasTransparency(frames: HTMLCanvasElement[], frameOrder: number[]): boolean {
  for (const idx of frameOrder) {
    const canvas = frames[idx];
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) return true;
    }
  }
  return false;
}

function findUnusedColor(frames: HTMLCanvasElement[], frameOrder: number[]): number {
  const used = new Set<number>();
  for (const idx of frameOrder) {
    const canvas = frames[idx];
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 128) {
        used.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      }
    }
  }
  const candidates = [0x00ff00, 0xff00ff, 0x00ffff, 0xff0000, 0x0000ff, 0xffffff, 0x010101];
  for (const c of candidates) {
    if (!used.has(c)) return c;
  }
  for (let c = 0; c <= 0xffffff; c++) {
    if (!used.has(c)) return c;
  }
  return 0x00ff00;
}

function flattenToGifCanvas(
  source: HTMLCanvasElement,
  keyR: number,
  keyG: number,
  keyB: number
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d')!;

  ctx.fillStyle = `rgb(${keyR},${keyG},${keyB})`;
  ctx.fillRect(0, 0, out.width, out.height);

  const srcCtx = source.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const outData = ctx.getImageData(0, 0, out.width, out.height);
  const s = srcData.data;
  const d = outData.data;

  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3]!;
    if (a >= 128) {
      d[i]     = s[i]!;
      d[i + 1] = s[i + 1]!;
      d[i + 2] = s[i + 2]!;
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(outData, 0, 0);
  return out;
}

export function exportGif(options: ExportOptions): Promise<Blob> {
  const { frames, frameOrder, offsets, fps, useOffsets, workerPath = '/gif.worker.js' } = options;

  return new Promise((resolve, reject) => {
    if (frames.length === 0) {
      reject(new Error('No frames'));
      return;
    }

    const frameW = frames[0].width;
    const frameH = frames[0].height;
    const delay = Math.round(1000 / fps);

    const transparent = hasTransparency(frames, frameOrder);
    const keyColor = transparent ? findUnusedColor(frames, frameOrder) : null;
    const kr = keyColor !== null ? (keyColor >> 16) & 0xff : 0;
    const kg = keyColor !== null ? (keyColor >> 8) & 0xff : 0;
    const kb = keyColor !== null ? keyColor & 0xff : 0;

    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: workerPath,
      width: frameW,
      height: frameH,
      transparent: keyColor as unknown as string | null,
    });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frameW;
    tempCanvas.height = frameH;
    const tempCtx = tempCanvas.getContext('2d')!;

    for (const idx of frameOrder) {
      const frame = frames[idx];
      const offset = useOffsets ? offsets[idx] : { dx: 0, dy: 0 };

      if (transparent && keyColor !== null) {
        const intermediateCanvas = document.createElement('canvas');
        intermediateCanvas.width = frameW;
        intermediateCanvas.height = frameH;
        const intermediateCtx = intermediateCanvas.getContext('2d')!;
        drawFrameWithOffset(intermediateCtx, frame, offset, frameW, frameH, true);

        const flatCanvas = flattenToGifCanvas(intermediateCanvas, kr, kg, kb);
        gif.addFrame(flatCanvas, { delay, copy: true });
      } else {
        tempCtx.clearRect(0, 0, frameW, frameH);
        drawFrameWithOffset(tempCtx, frame, offset, frameW, frameH, true);
        gif.addFrame(tempCanvas, { delay, copy: true });
      }
    }

    gif.on('finished', (blob: Blob) => resolve(blob));
    // @ts-expect-error gif.js supports 'error' event but @types/gif.js omits it
    gif.on('error', (err: Error) => reject(err));
    gif.render();
  });
}
