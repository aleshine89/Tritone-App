export type Riquadro = { x: number; y: number; w: number; h: number };

/** Riquadro iniziale dai bordi del documento. Se non li vede, un margine interno. */
export function bordoDocumento(data: Uint8ClampedArray, width: number, height: number): { riquadro: Riquadro; rilevato: boolean } {
  const n = width * height;
  const lumi = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    lumi[i] = data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
  }
  const campioni: number[] = [];
  const margine = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < margine || y < margine || x >= width - margine || y >= height - margine) campioni.push(lumi[y * width + x]);
    }
  }
  campioni.sort((a, b) => a - b);
  const sfondo = campioni[Math.floor(campioni.length / 2)] ?? 128;
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = Math.abs(lumi[i + 1] - lumi[i - 1]);
      const gy = Math.abs(lumi[i + width] - lumi[i - width]);
      if (gx + gy > 36 || Math.abs(lumi[i] - sfondo) > 42) {
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const piena = width * height;
  const area = maxX >= 0 ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
  if (count < piena * 0.01 || maxX < 0 || area > piena * 0.93 || area < piena * 0.04) {
    const insetX = Math.max(1, Math.round(width * 0.06));
    const insetY = Math.max(1, Math.round(height * 0.06));
    return {
      rilevato: false,
      riquadro: { x: insetX, y: insetY, w: Math.max(1, width - insetX * 2), h: Math.max(1, height - insetY * 2) },
    };
  }
  return { rilevato: true, riquadro: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

export function scalaRiquadro(box: Riquadro, daW: number, daH: number, aW: number, aH: number, rilevato: boolean): Riquadro {
  const sx = aW / Math.max(1, daW);
  const sy = aH / Math.max(1, daH);
  let x = Math.round(box.x * sx);
  let y = Math.round(box.y * sy);
  let w = Math.max(1, Math.round(box.w * sx));
  let h = Math.max(1, Math.round(box.h * sy));
  if (rilevato) {
    const px = Math.round(aW * 0.015);
    const py = Math.round(aH * 0.015);
    x = Math.max(0, x - px);
    y = Math.max(0, y - py);
    w = Math.min(aW - x, w + px * 2);
    h = Math.min(aH - y, h + py * 2);
  }
  x = Math.min(Math.max(0, x), Math.max(0, aW - 1));
  y = Math.min(Math.max(0, y), Math.max(0, aH - 1));
  w = Math.min(Math.max(1, w), aW - x);
  h = Math.min(Math.max(1, h), aH - y);
  return { x, y, w, h };
}
