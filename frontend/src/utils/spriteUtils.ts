// Slice sprite sheet into individual frames
export function sliceSprite(
  image: HTMLImageElement,
  cols: number,
  rows: number
): HTMLCanvasElement[] {
  const frameW = Math.floor(image.naturalWidth / cols);
  const frameH = Math.floor(image.naturalHeight / rows);
  const frames: HTMLCanvasElement[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = frameW;
      canvas.height = frameH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, c * frameW, r * frameH, frameW, frameH, 0, 0, frameW, frameH);
      frames.push(canvas);
    }
  }

  return frames;
}

function getRegionPixels(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(x, y, w, h).data;
}

function computeSAD(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum;
}

export interface Offset {
  dx: number;
  dy: number;
}

export function findOffset(
  baseFrame: HTMLCanvasElement,
  targetFrame: HTMLCanvasElement,
  templateRegion: { x: number; y: number; w: number; h: number },
  searchRadius = 8
): Offset {
  const { x, y, w, h } = templateRegion;
  const template = getRegionPixels(baseFrame, x, y, w, h);

  let bestDx = 0;
  let bestDy = 0;
  let bestSAD = Infinity;

  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx + w > targetFrame.width || ny + h > targetFrame.height) continue;
      const candidate = getRegionPixels(targetFrame, nx, ny, w, h);
      const sad = computeSAD(template, candidate);
      if (sad < bestSAD) {
        bestSAD = sad;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return { dx: bestDx, dy: bestDy };
}

export function computeAllOffsets(
  frames: HTMLCanvasElement[],
  templateRegion: { x: number; y: number; w: number; h: number },
  searchRadius = 8
): Offset[] {
  if (frames.length === 0) return [];
  const base = frames[0];
  return frames.map((frame, i) => {
    if (i === 0) return { dx: 0, dy: 0 };
    return findOffset(base, frame, templateRegion, searchRadius);
  });
}

export function drawFrameWithOffset(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  offset: Offset,
  canvasW: number,
  canvasH: number,
  clearFirst = true
) {
  if (clearFirst) ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(frame, -offset.dx, -offset.dy);
}

export function getDefaultTemplateRegion(frameW: number, frameH: number) {
  return {
    x: Math.floor(frameW * 0.1),
    y: Math.floor(frameH * 0.6),
    w: Math.floor(frameW * 0.8),
    h: Math.floor(frameH * 0.25),
  };
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export interface ChromaKeyColor { r: number; g: number; b: number }

export interface ChromaKeyOptions {
  keyColor: ChromaKeyColor;
  tolerance: number;
  smoothness: number;
  spill: number;
  erosion: number;
}

export function applyChromaKey(
  source: HTMLCanvasElement,
  opts: ChromaKeyOptions
): HTMLCanvasElement {
  const { keyColor, tolerance, smoothness, spill, erosion } = opts;
  const { r: kr, g: kg, b: kb } = keyColor;

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  const thresh = (tolerance / 100) * 100;
  const smooth = 50 + (smoothness / 100) * 120;
  const spillStr = spill / 100;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const dr = r - kr, dg = g - kg, db = b - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    let alpha: number;
    if (dist <= thresh) {
      alpha = 0;
    } else if (dist < thresh + smooth) {
      alpha = (dist - thresh) / smooth;
      alpha = Math.min(1, alpha);
    } else {
      alpha = 1;
    }

    if (spillStr > 0 && alpha > 0) {
      const baseMask = Math.max(0, dist - thresh);
      const spillVal = Math.pow(Math.min(1, baseMask / Math.max(1, spillStr * 120)), 1.5);
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      let rr = gray * (1 - spillVal) + r * spillVal;
      let gg = gray * (1 - spillVal) + g * spillVal;
      let bb = gray * (1 - spillVal) + b * spillVal;
      const strength = Math.min(1, spillStr * (1.2 - spillVal * 0.4));
      if (kg >= kr && kg >= kb && g > Math.max(r, b)) {
        const limit = (rr + bb) / 2;
        gg = gg - strength * (gg - limit);
      }
      if (kb >= kr && kb >= kg && b > Math.max(r, g)) {
        const limit = (rr + gg) / 2;
        bb = bb - strength * (bb - limit);
      }
      data[i]     = Math.round(Math.max(0, Math.min(255, rr)));
      data[i + 1] = Math.round(Math.max(0, Math.min(255, gg)));
      data[i + 2] = Math.round(Math.max(0, Math.min(255, bb)));
    }

    data[i + 3] = Math.round(alpha * 255);
  }

  ctx.putImageData(imageData, 0, 0);

  const erodePasses = Math.floor((erosion / 100) * 5);
  if (erodePasses > 0) {
    return erodeAlpha(out, erodePasses);
  }
  return out;
}

function erodeAlpha(canvas: HTMLCanvasElement, passes: number): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const dx = [-1, -1, -1, 0, 0, 1, 1, 1];
  const dy = [-1,  0,  1, -1, 1, -1, 0, 1];

  let read = ctx.getImageData(0, 0, w, h);
  let write = new ImageData(new Uint8ClampedArray(read.data), w, h);

  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        write.data[i]     = read.data[i]!;
        write.data[i + 1] = read.data[i + 1]!;
        write.data[i + 2] = read.data[i + 2]!;
        let minA = read.data[i + 3]!;
        for (let k = 0; k < 8; k++) {
          const nx = x + dx[k]!;
          const ny = y + dy[k]!;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            minA = Math.min(minA, read.data[(ny * w + nx) * 4 + 3]!);
          }
        }
        write.data[i + 3] = minA;
      }
    }
    [read, write] = [write, read];
  }

  ctx.putImageData(read, 0, 0);
  return canvas;
}

export function groupFramesByRow(
  frames: HTMLCanvasElement[],
  cols: number,
  rows: number
): HTMLCanvasElement[][] {
  const result: HTMLCanvasElement[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: HTMLCanvasElement[] = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < frames.length) row.push(frames[idx]);
    }
    result.push(row);
  }
  return result;
}
