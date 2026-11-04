import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { AllegatoComunicazione } from "@/components/area-soci";
import { prepareFile } from "@/lib/prepare-file";
import {
  eliminaComunicazioneSoci,
  listaComunicazioniSoci,
  pubblicaComunicazioneSoci,
  type PaginaComunicazioniSoci,
} from "@/lib/fondale.functions";
import { formatDay } from "@/lib/format";
import { messaggioErrore, useT } from "@/lib/i18n";

export const Route = createFileRoute("/comunicazioni-soci")({ component: Page });

function Page() {
  return (
    <AppFrame>
      <Comunicazioni />
    </AppFrame>
  );
}

function leggiAllegato(file: File): Promise<{ name: string; data: string }> {
  const immagine = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
  if (immagine) {
    return prepareFile(file).then((pronto) => {
      if (!pronto.data.startsWith("data:image/")) throw new Error("Allega un PDF o un'immagine.");
      if (pronto.data.length > 2_200_000) throw new Error("Ogni allegato può pesare al massimo 1,5 MB.");
      return { name: pronto.name, data: pronto.data };
    });
  }
  return new Promise((resolve, reject) => {
    if (file.size > 1_500_000) {
      reject(new Error("Ogni allegato può pesare al massimo 1,5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let data = String(reader.result ?? "");
      if (!data.startsWith("data:application/pdf") && file.name.toLowerCase().endsWith(".pdf")) {
        const comma = data.indexOf(",");
        if (comma > 0) data = `data:application/pdf;base64,${data.slice(comma + 1)}`;
      }
      if (!data.startsWith("data:application/pdf")) {
        reject(new Error("Allega un PDF o un'immagine."));
        return;
      }
      resolve({ name: file.name, data });
    };
    reader.onerror = () => reject(new Error("Allega un PDF o un'immagine."));
    reader.readAsDataURL(file);
  });
}

function Comunicazioni() {
  const t = useT();
  const [dato, setDato] = useState<PaginaComunicazioniSoci | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [titolo, setTitolo] = useState("");
  const [testo, setTesto] = useState("");
  const [tutti, setTutti] = useState(true);
  const [scelti, setScelti] = useState<string[]>([]);
  const [file, setFile] = useState<{ name: string; data: string }[]>([]);
  const [busy, setBusy] = useState(false);

  function carica() {
    return listaComunicazioniSoci()
      .then(setDato)
      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Non riesco a leggere le comunicazioni.")));
  }

  useEffect(() => {
    let live = true;
    listaComunicazioniSoci()
      .then((value) => {
        if (live) setDato(value);
      })
      .catch((reason: unknown) => {
        if (live) setErrore(messaggioErrore(reason, "Non riesco a leggere le comunicazioni."));
      });
    return () => {
      live = false;
    };
  }, []);

  async function pubblica() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    try {
      await pubblicaComunicazioneSoci({ data: { titolo, testo, tutti, utenti: tutti ? [] : scelti, file } });
      setTitolo("");
      setTesto("");
      setTutti(true);
      setScelti([]);
      setFile([]);
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a pubblicare la comunicazione."));
    } finally {
      setBusy(false);
    }
  }

  async function elimina(id: number) {
    if (busy) return;
    if (!window.confirm(t("Eliminare questa comunicazione? I soci non la vedono più."))) return;
    setBusy(true);
    setErrore(null);
    try {
      await eliminaComunicazioneSoci({ data: { id } });
      await carica();
    } catch (reason) {
      setErrore(messaggioErrore(reason, "Non riesco a eliminare la comunicazione."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/soci" className="inline-flex min-h-11 items-center gap-2 text-sm text-mist">
        <ArrowLeft className="size-4" />
        {t("Soci")}
      </Link>
      <h1 className="mt-2 text-3xl leading-none">{t("Comunicazioni e documenti")}</h1>
      <p className="mt-2 text-sm text-mist">{t("Il messaggio arriva ai soci dell'anno in corso. PDF e immagini si aprono e si scaricano da I miei diving.")}</p>
      {errore ? <p className="mt-3 text-sm text-brass">{errore}</p> : null}
      {!dato ? <p className="mt-4 text-sm text-mist">{t("Carico…")}</p> : null}
      {dato ? (
        <>
          <div className="mt-4 rounded-2xl border border-line bg-deep px-4 py-4">
            <label className="block text-sm">
              <span className="mb-1 block text-mist">{t("Titolo")}</span>
              <input value={titolo} onChange={(event) => setTitolo(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-abyss px-3 outline-none focus-visible:border-lagoon" />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-mist">{t("Testo")}</span>
              <textarea value={testo} onChange={(event) => setTesto(event.target.value)} rows={5} className="w-full rounded-xl border border-line bg-abyss px-3 py-2 outline-none focus-visible:border-lagoon" />
            </label>
            <div className="mt-3">
              <p className="mb-2 text-sm text-mist">{t("PDF o immagini, massimo 4 file da 1,5 MB.")}</p>
              <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-full bg-lagoon px-4 text-sm font-medium text-ink">
                {t("Scegli file")}
                <input
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,.pdf"
                  multiple
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => {
                    const sceltiFile = [...(event.target.files ?? [])].slice(0, 4);
                    event.target.value = "";
                    void Promise.all(sceltiFile.map(leggiAllegato))
                      .then((letti) => setFile((current) => [...current, ...letti].slice(0, 4)))
                      .catch((reason: unknown) => setErrore(messaggioErrore(reason, "Allega un PDF o un'immagine.")));
                  }}
                />
              </label>
            </div>
            {file.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {file.map((voce, index) => (
                  <li key={`${voce.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                    {voce.data.startsWith("data:image/") ? <img src={voce.data} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : null}
                    <span className="min-w-0 flex-1 truncate">{voce.name}</span>
                    <button type="button" className="min-h-11 shrink-0 text-brass" onClick={() => setFile((current) => current.filter((_, i) => i !== index))}>
                      {t("Togli")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <fieldset className="mt-4">
              <legend className="text-sm text-mist">{t("Destinatari")}</legend>
              <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
                <input type="radio" name="destinatari" checked={tutti} onChange={() => setTutti(true)} />
                {t("Tutti i soci dell'anno in corso")} ({dato.anno})
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="radio" name="destinatari" checked={!tutti} onChange={() => setTutti(false)} />
                {t("Scegli i soci")}
              </label>
            </fieldset>
            {!tutti ? (
              dato.soci.length === 0 ? (
                <p className="mt-2 text-sm text-mist">{t("Non ci sono soci nell'anno in corso.")}</p>
              ) : (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {dato.soci.map((socio) => (
                    <li key={socio.userId}>
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={scelti.includes(socio.userId)}
                          onChange={() => setScelti((current) => (current.includes(socio.userId) ? current.filter((id) => id !== socio.userId) : [...current, socio.userId]))}
                        />
                        <span>{socio.cognome} {socio.nome}</span>
                        <span className="text-mist">{t("N. {numero}", { numero: socio.numero })}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            <button
              type="button"
              disabled={busy || !titolo.trim() || !testo.trim()}
              className="mt-4 min-h-11 rounded-full bg-lagoon px-4 text-sm font-medium disabled:opacity-60"
              onClick={() => void pubblica()}
            >
              {t("Pubblica")}
            </button>
          </div>
          <h2 className="mt-8 text-sm font-medium">{t("Storico")}</h2>
          {dato.inviate.length === 0 ? <p className="mt-2 text-sm text-mist">{t("Nessuna comunicazione inviata.")}</p> : null}
          <ul className="mt-3 grid gap-3">
            {dato.inviate.map((voce) => (
              <li key={voce.id} className="rounded-2xl border border-line bg-deep px-4 py-3">
                <p className="text-sm font-medium">{voce.titolo}</p>
                <p className="mt-1 text-xs text-mist">
                  {formatDay(voce.quando)} · {voce.tutti ? t("Tutti i soci del {anno}", { anno: voce.anno }) : t("{n} soci", { n: voce.destinatari })}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{voce.testo}</p>
                {voce.file.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {voce.file.map((allegato) => (
                      <AllegatoComunicazione key={allegato.id} id={allegato.id} nome={allegato.nome} />
                    ))}
                  </ul>
                ) : null}
                <button type="button" disabled={busy} className="mt-2 min-h-11 text-sm text-brass disabled:opacity-60" onClick={() => void elimina(voce.id)}>
                  {t("Elimina")}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
