import assert from "node:assert/strict";
import test from "node:test";
import { interpreta } from "./leggi-documento.ts";

test("il codice SNSI viene letto per intero", () => {
  const letto = interpreta("SNSI\nOWDN114007359IT\nOpen Water Diver\nProfondità 18 m", "brevetto");
  assert.equal(letto.numero, "OWDN114007359IT");
  assert.equal(letto.didattica, "SNSI");
  assert.equal(letto.livello, "Open Water Diver");
  assert.equal(letto.profondita, "18");
});

test("il codice spezzato da spazi o da un a capo si ricompone", () => {
  assert.equal(interpreta("Numero brevetto OWDN 114007359 IT", "brevetto").numero, "OWDN114007359IT");
  assert.equal(interpreta("OWDN114007359\nIT", "brevetto").numero, "OWDN114007359IT");
  assert.equal(interpreta("OWD N114007359 IT", "brevetto").numero, "OWDN114007359IT");
});

test("uno zero o un 1 letti al posto di O e I non tagliano il codice", () => {
  assert.equal(interpreta("0WDN114007359IT", "brevetto").numero, "OWDN114007359IT");
  assert.equal(interpreta("OWDN1140073591T", "brevetto").numero, "OWDN114007359IT");
});

test("senza la sigla del paese restano prefisso e numero, non solo le cifre", () => {
  assert.equal(interpreta("Codice OWDN114007359", "brevetto").numero, "OWDN114007359");
});

test("gli altri numeri, e le scansioni che non sono brevetti, restano come prima", () => {
  assert.equal(interpreta("Certificato 1234567", "brevetto").numero, "1234567");
  assert.equal(interpreta("CMAS/1234567", "brevetto").numero, "CMAS/1234567");
  assert.equal(interpreta("Polizza 987654321\nScadenza 12/05/2027", "assicurazione").numero, "987654321");
  assert.equal(interpreta("Certificato medico\nDott. Rossi\nScadenza 01/06/2027", "medico").numero, "");
});
