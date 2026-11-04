import assert from "node:assert/strict";
import test from "node:test";
import { bordoDocumento } from "./ritaglio-documento.ts";

function immagine(width: number, height: number, tinta: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = tinta(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("il ritaglio iniziale segue i bordi del documento", () => {
  const data = immagine(120, 80, (x, y) => (x >= 20 && x < 70 && y >= 12 && y < 52 ? [244, 244, 240] : [12, 18, 24]));
  const letto = bordoDocumento(data, 120, 80);
  assert.equal(letto.rilevato, true);
  assert.ok(Math.abs(letto.riquadro.x - 20) <= 3, `x ${letto.riquadro.x}`);
  assert.ok(Math.abs(letto.riquadro.y - 12) <= 3, `y ${letto.riquadro.y}`);
  assert.ok(Math.abs(letto.riquadro.x + letto.riquadro.w - 70) <= 3);
  assert.ok(Math.abs(letto.riquadro.y + letto.riquadro.h - 52) <= 3);
});

test("senza bordi visibili il ritaglio resta un margine interno", () => {
  const data = immagine(100, 80, () => [40, 70, 80]);
  const letto = bordoDocumento(data, 100, 80);
  assert.equal(letto.rilevato, false);
  assert.ok(letto.riquadro.x > 0 && letto.riquadro.y > 0);
  assert.ok(letto.riquadro.x + letto.riquadro.w < 100);
  assert.ok(letto.riquadro.y + letto.riquadro.h < 80);
});
