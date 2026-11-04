export const INFORMATIVA_VERSION = "2026-10-06";

export type TitolareTesto = { nome: string; sede: string; email: string };

export function paragrafiInformativa(titolare: TitolareTesto): string[] {
  const nome = titolare.nome.trim();
  const chi = nome
    ? `${nome}${titolare.sede.trim() ? `, ${titolare.sede.trim()}` : ""}${titolare.email.trim() ? `, ${titolare.email.trim()}` : ""}`
    : "il gestore di Tritone. Nome e sede si inseriscono dalla Gestione, e da quel momento compaiono qui";
  return [
    `Titolare del trattamento dell'account, del logbook e dei Tools è ${chi}.`,
    "Quei dati servono a farti entrare, a tenere il diario e i documenti personali. Senza, l'app non funziona: è il contratto con te.",
    "La scheda che invii a una scuola è di quella scuola. Tritone la custodisce e non la passa ad altre scuole.",
    "Codice fiscale, numero del documento e contatto di emergenza sono chiusi con la chiave della scuola. Lo staff vede il nome e che il documento c'è. Il numero lo apre il titolare sul suo telefono.",
    "Le risposte sanitarie sono chiuse allo stesso modo. Lo staff vede solo se c'è una risposta positiva, non le singole domande.",
    "Certificato medico, assicurazione e foto del brevetto sono chiusi sul tuo telefono. Sul server resta la scadenza, che serve al registro.",
    "Il registro dell'uscita si conserva almeno sei mesi. Account, logbook e Tools restano finché non chiudi l'account. Le bozze le cancelli quando vuoi.",
    "Dal Profilo puoi scaricare una copia dei tuoi dati o eliminare l'account. Puoi anche chiedere di correggerli. Le schede già inviate restano alla scuola: le serve per il registro.",
    "L'unico cookie è quello di accesso. Non c'è pubblicità e i dati non si vendono.",
    "Questa informativa è il testo dell'app, versione del 6 ottobre 2026. Non sostituisce il parere di chi segue la privacy, né il contratto con il diving.",
  ];
}
