#!/usr/bin/env python3
"""Rigenera i Termini e Condizioni d'uso, versione 3.8, con la registrazione SIAE."""
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

OUT = "/workspace/public/legali/termini-condizioni.pdf"

PARAGRAFI = [
"1. Identificazione del Provider e ambito di applicazione",
"1.1. I presenti Termini e condizioni d’uso disciplinano l’accesso e l’utilizzo dell’applicazione web denominata “Tritone – La voce del mare” (di seguito, l’“Applicazione” o il “Servizio”), destinata alla gestione digitale di attività di centri di immersione, club e scuole subacquee, del relativo staff e dei subacquei.",
"1.2. Il titolare dell’Applicazione e del Servizio è Alessandro Mogliani, Via Fermi 9, 60027 Osimo (AN), codice fiscale MGLLSN89D13E690G, partita IVA 02972060426, e-mail: tritone.app@gmail.com, PEC: momentidamare@pec.it (di seguito, il “Provider”).",
"1.3. I presenti Termini si applicano a tutti gli utenti dell’Applicazione, distinguendo, ove necessario, tra Utente finale, Diving Center, Staff e Gestore.",
"1.4. L’accesso o l’utilizzo dell’Applicazione è subordinato all’accettazione dei presenti Termini.",
"1.5. Le presenti condizioni sono coordinate con i seguenti documenti separati: Condizioni Economiche Tritone v1.2 del 20 ottobre 2026; Informativa Privacy Tritone v1.4 del 20 ottobre 2026; Accordo sul Trattamento dei Dati Tritone v1.4, con Allegato Tecnico – Misure di Sicurezza v1.1, del 20 ottobre 2026. Ciascun documento deve essere reso disponibile prima dell’accettazione o dell’attivazione della funzione cui si riferisce e deve essere identificato mediante versione e data.",
"1.6. Il Provider può aggiornare i presenti Termini per esigenze normative, tecniche, organizzative o di sicurezza. Le modifiche sostanziali sono comunicate prima della loro efficacia, con indicazione della nuova versione e della data di decorrenza. Le modifiche non producono effetti retroattivi e non pregiudicano i diritti inderogabili dell’Utente finale consumatore. Quando una modifica incide in modo sostanziale su un Servizio a pagamento già attivo e non è imposta dalla legge o necessaria per la sicurezza, l’utente professionale può cessare il rapporto secondo le modalità applicabili prima della decorrenza della modifica.",
"2. Descrizione del Servizio",
"2.1. In base al ruolo e al Piano attivo, l’Applicazione può comprendere registrazione e autenticazione, gestione moduli, archivio moduli, registro del giorno e foglio barca, pianificatori, PDF, logbook, importazione UDDF/FIT, strumenti di calcolo (MOD e CNS), sezione emergenze, gestione lingua, notifiche.",
"2.2. Le funzionalità effettivamente disponibili dipendono dal ruolo, dal Piano e dalla configurazione. Sono indicate nelle Condizioni Economiche e, prima dell’attivazione, nella schermata di attivazione o di acquisto.",
"2.3. Il Provider può introdurre, modificare o sospendere funzionalità per ragioni tecniche, di sicurezza o normative, rispettando gli obblighi inderogabili.",
"2.4. Il Servizio è uno strumento di supporto. Non sostituisce gli obblighi organizzativi, di sicurezza o formativi dell’utente o del Diving Center.",
"3. Registrazione, account e credenziali",
"3.1. La registrazione ordinaria crea un account Utente finale. L’account Diving Center richiede approvazione.",
"3.2. Un soggetto può avere più ruoli. Archivi e autorizzazioni restano separati.",
"3.3. L’utente deve fornire dati veritieri. È vietato usare identità altrui o dati falsi.",
"3.4. Le credenziali sono personali. L’utente deve custodirle, non condividerle e segnalare compromissioni.",
"3.5. Il Diving Center gestisce e revoca gli account Staff. Ogni account Staff è personale.",
"3.6. Il Provider può sospendere un account in caso di violazioni, frode, dati falsi o rischio di sicurezza, comunicando la ragione ove possibile.",
"4. Periodo di prova, Piani, prezzi e pagamenti",
"4.1. Le Condizioni Economiche prevedono un periodo di prova per l’Utente finale Pro e per il Diving Center, con durata e scadenza indicate nella schermata di attivazione e nelle Condizioni Economiche. Il Gestore opera secondo le regole interne del Provider e non è soggetto alle scadenze dei Piani riservati agli utenti.",
"4.2. Alla scadenza del periodo di prova le funzionalità a pagamento possono essere limitate o disattivate. La prova non si converte automaticamente in un Piano a pagamento e non comporta alcun addebito in assenza di una successiva attivazione espressa.",
"4.3. Piani, prezzi, IVA, durata, modalità di pagamento e conseguenze della cessazione sono disciplinati dalle Condizioni Economiche, rese disponibili e accettate separatamente prima dell’attivazione del Piano.",
"4.4. I Piani annuali indicati nelle Condizioni Economiche v1.2 sono a rinnovo non automatico. Un eventuale rinnovo automatico deve essere indicato prima dell’ordine, con durata, prezzo o criterio di determinazione, preavviso e modalità di disdetta, e deve essere accettato con dichiarazione espressa e tracciata.",
"4.5. Nei contratti online con consumatori, prima dell’inoltro dell’ordine sono mostrate in modo chiaro le informazioni essenziali, inclusi Piano, prezzo totale, imposte, durata, modalità di pagamento, cessazione e recesso quando applicabile. Il comando finale dell’ordine deve indicare in modo inequivocabile che l’inoltro comporta un obbligo di pagamento; tale obbligo non sussiste per la sola attivazione gratuita o per il periodo di prova gratuito.",
"4.6. In caso di mancato pagamento il Provider può sospendere o limitare il Piano dopo una comunicazione e un termine ragionevole per regolarizzare, salvo la necessità di interventi immediati per sicurezza, frode o obblighi di legge. Restano fermi i diritti inderogabili dell’Utente finale consumatore.",
"4.7. Per gli ordini a pagamento il Provider invia la conferma dell’ordine e le condizioni applicabili su supporto durevole entro un termine ragionevole e, comunque, prima dell’inizio dell’esecuzione quando richiesto dalla legge.",
"5. Licenza d’uso",
"5.1. Il Provider concede una licenza personale (o organizzativa per il Diving Center), non esclusiva, non cedibile, limitata all’uso tramite interfaccia.",
"5.2. La licenza non comprende il diritto di ricostruire codice, algoritmi o struttura tecnica.",
"5.3. È vietato copiare, modificare, fare reverse engineering, scraping, usare materiali del Provider per cloni o servizi concorrenti, rimuovere marchi.",
"5.4. I divieti riguardano l’uso di materiali proprietari. Non impediscono lo sviluppo autonomo di prodotti analoghi senza copiare tali materiali.",
"5.5. Restano salvi i diritti inderogabili di legge.",
"6. Proprietà intellettuale, banche dati e marchio",
"6.1. Software, interfacce, grafica, moduli, banche dati e altri elementi sono di proprietà del Provider o usati su licenza valida.",
"6.2. Il software è stato depositato presso la SIAE. Il deposito documenta anteriorità.",
"6.3. Il software denominato “TRITONE - LA VOCE DEL MARE” è registrato presso il Registro Pubblico Speciale per i programmi per elaboratore della SIAE (Società Italiana degli Autori ed Editori) con numero di registrazione D000030864, numero progressivo D000032389, in data 27 ottobre 2026, data di pubblicazione 7 ottobre 2026.",
"6.4. La banca dati è tutelata. È vietata l’estrazione sistematica.",
"6.5. Il segno “Tritone – La voce del mare” è stato depositato ed è in attesa di registrazione. Fino alla registrazione definitiva non deve essere utilizzato il simbolo ®; l’eventuale indicazione del deposito non costituisce dichiarazione di marchio registrato.",
"6.6. È vietato usare, registrare, riprodurre, imitare o incorporare il segno o segni confondibili senza autorizzazione scritta.",
"7. Regole per l’Utente finale",
"7.1. L’Utente finale può compilare e inviare moduli, consultare logbook, usare pianificatori e strumenti del proprio Piano, generare PDF, importare dati propri.",
"7.2. È responsabile della correttezza dei dati inseriti.",
"7.3. L’invio dei moduli avviene con azione espressa.",
"7.4. Non può inviare dati di terzi senza titolo.",
"7.5. Pianificatori e calcoli (MOD, CNS) sono strumenti di supporto. Non sostituiscono formazione, verifica o decisioni di sicurezza.",
"7.6. L’utente deve verificare autonomamente i risultati.",
"7.7. La sezione emergenze è informativa. In emergenza contattare i servizi competenti.",
"8. Regole per il Diving Center e lo Staff",
"8.1. Il Diving Center è responsabile dell’uso organizzativo, della veridicità dei dati, della gestione Staff, della verifica dei registri, del trattamento dati e dell’individuazione della base giuridica per eventuali dati sanitari.",
"8.2. Può consultare l’archivio moduli e usare il registro nei limiti delle autorizzazioni.",
"8.3. Resta responsabile delle decisioni operative sulle uscite e immersioni.",
"8.4. L’Applicazione non garantisce da sola la conformità normativa dell’attività.",
"8.5. Non può concedere accessi non autorizzati, riutilizzare materiali del Provider per servizi concorrenti, rimuovere riferimenti al Provider o fare estrazioni massive.",
"9. Contenuti dell’utente e dati caricati",
"9.1. L’utente conserva la titolarità dei Contenuti dell’utente.",
"9.2. Autorizza il Provider a ospitare, memorizzare, organizzare tecnicamente e rendere accessibili i Contenuti nella misura necessaria al Servizio, senza che tale autorizzazione trasferisca la proprietà dei Contenuti o attribuisca al Provider finalità autonome sui dati personali trattati per conto del Diving Center. Per tali dati si applicano l’Informativa Privacy e, ove pertinente, l’Accordo sul Trattamento dei Dati.",
"9.3. Garantisce di avere diritto di caricare i Contenuti e che non violano diritti di terzi.",
"9.4. Il Provider non acquisisce la proprietà dei Contenuti.",
"9.5. Il Provider può rimuovere contenuti illeciti o pericolosi.",
"10. Documenti PDF, download e condivisione",
"10.1. L’Applicazione può generare PDF. L’utente può scaricarli o condividerli.",
"10.2. I PDF non sono inviati automaticamente a terzi dal Provider.",
"10.3. L’utente deve verificare il contenuto prima di condividere, specialmente se contiene dati personali o sanitari.",
"10.4. Il download non trasferisce diritti sui modelli o elementi proprietari.",
"11. Disponibilità, aggiornamenti e manutenzione",
"11.1. Il Provider si adopera per mantenere l’Applicazione disponibile e funzionante, ma non garantisce accesso continuo o assenza di errori. Nei rapporti con i Consumatori restano ferme le garanzie e i rimedi inderogabili previsti per i servizi digitali.",
"11.2. Possono esserci sospensioni per manutenzione, sicurezza o forza maggiore.",
"11.3. Il Provider può applicare aggiornamenti e correzioni.",
"11.4. L’utente è responsabile del proprio dispositivo e connessione.",
"12. Esclusioni e limitazioni di responsabilità",
"12.1. L’Applicazione è strumento di supporto. Non costituisce consulenza medica, legale o professionale.",
"12.2. Nei limiti consentiti dalla legge e fatto salvo quanto previsto per i diritti inderogabili dei Consumatori, il Provider non risponde di errori derivanti da dati dell’utente, uso improprio, decisioni operative del Diving Center, indisponibilità della connessione o interruzioni imputabili a terzi.",
"12.3. Il Diving Center manleva il Provider, nei limiti di legge, da pretese di terzi derivanti da dati o decisioni del Diving Center. La manleva non opera per fatti imputabili al Provider.",
"12.4. Nessuna limitazione pregiudica diritti inderogabili del consumatore.",
"13. Protezione dei dati personali",
"13.1. I trattamenti del Provider quale titolare sono disciplinati dall’Informativa Privacy v1.4.",
"13.2. Il Diving Center è titolare autonomo dei trattamenti della propria attività.",
"13.3. Quando il Provider tratta per conto del Diving Center, si applica l’Accordo sul Trattamento v1.4 e l’Allegato Tecnico, accettato separatamente prima dell’inizio del trattamento.",
"13.4. L’utente deve caricare solo dati pertinenti.",
"13.5. I Termini non sostituiscono Informativa, Accordo o informative del Diving Center.",
"14. Sospensione, risoluzione e cessazione dell’account",
"14.1. Il Provider può sospendere o cessare l’accesso in caso di violazioni, frode, mancato pagamento, dati falsi o rischio di sicurezza.",
"14.2. Ove possibile, la sospensione è preceduta da comunicazione e termine di rimedio.",
"14.3. Alla cessazione la licenza viene meno.",
"14.4. Il periodo di 60 giorni per l’esportazione è tecnico e contrattuale. Non riduce obblighi legali di conservazione.",
"14.5. La cessazione non comporta cancellazione automatica di dati che devono essere conservati per legge o tutela dei diritti.",
"14.6. Restano efficaci dopo la cessazione le clausole su proprietà intellettuale, riservatezza e responsabilità.",
"15. Riservatezza e divieto di divulgazione",
"15.1. L’utente deve mantenere riservate le informazioni non pubbliche sull’Applicazione e sulla sua architettura.",
"15.2. È vietato divulgare materiali interni o informazioni idonee a copiare elementi proprietari.",
"15.3. L’obbligo non si applica a informazioni già pubbliche o la cui divulgazione sia imposta dalla legge.",
"16. Violazioni e rimedi del Provider",
"16.1. In caso di uso non autorizzato di elementi proprietari, il Provider può sospendere l’account, chiedere cessazione, rimozione e risarcimento nei limiti di legge.",
"16.2. Il silenzio non costituisce rinuncia ai diritti.",
"17. Consumatori, recesso e servizi digitali",
"17.1. Quando l’Utente finale agisce per scopi estranei alla propria attività professionale o imprenditoriale, si applicano le norme inderogabili di tutela del consumatore, incluse quelle relative ai servizi digitali, agli obblighi informativi, alla conformità del Servizio e al diritto di recesso.",
"17.2. Prima della conclusione del contratto a distanza, il Provider rende disponibili in modo chiaro e comprensibile le informazioni relative, tra l’altro, a identità del Provider, caratteristiche e funzionalità del Servizio, prezzo totale, durata, modalità di pagamento, rinnovo, cessazione e recesso, quando applicabile.",
"17.3. Se il consumatore chiede l’avvio del Servizio durante il periodo di recesso, deve formulare una richiesta espressa e ricevere la relativa conferma su supporto durevole. Se il recesso viene esercitato dopo l’avvio, il consumatore può essere tenuto al pagamento della parte di Servizio effettivamente eseguita fino alla comunicazione del recesso, nei limiti e alle condizioni previste dalla legge. L’eventuale perdita del diritto di recesso opera solo nei casi e con gli adempimenti espressamente previsti dalla legge.",
"17.4. Le limitazioni contenute nei presenti Termini non si applicano ai diritti inderogabili del consumatore e non escludono le garanzie previste per i servizi digitali.",
"18. Accettazione online e approvazione specifica B2B",
"18.1. Il Provider utilizza, per quanto tecnicamente applicabile, un sistema di accettazione separata e non preselezionata dei seguenti documenti o dichiarazioni: Termini e condizioni d’uso; Informativa Privacy, per presa visione; Condizioni Economiche del Piano selezionato; richiesta di avvio immediato del Servizio durante il periodo di recesso, quando necessaria; Accordo sul Trattamento dei Dati, per il Diving Center; approvazione specifica delle clausole B2B, quando necessaria.",
"18.2. Il Provider conserva la prova dell’accettazione associandola, ove disponibile, a utente, account, ruolo, Diving Center, versione e data dei documenti, data e ora, identificativo tecnico dell’operazione e testo o hash del documento accettato.",
"18.3. Nei rapporti con utenti professionali, le clausole che prevedono limitazioni di responsabilità, facoltà di sospensione o recesso, decadenze, restrizioni nei rapporti con terzi, tacita proroga o rinnovazione, nonché deroghe alla competenza dell’autorità giudiziaria, devono essere specificamente approvate per iscritto quando richiesto dalla legge.",
"18.4. L’approvazione specifica deve essere separata dall’accettazione generale e deve richiamare in modo puntuale le clausole approvate. La semplice presa visione dei Termini o l’accettazione generale non sostituisce tale approvazione.",
"19. Legge applicabile, controversie e comunicazioni",
"19.1. Si applica la legge italiana, salvo norme inderogabili a tutela del consumatore.",
"19.2. Per i consumatori è competente il foro previsto dalla legge.",
"19.3. Per i professionisti è competente il giudice secondo i criteri di legge, salvo diverso accordo valido.",
"19.4. Le comunicazioni possono essere inviate all’e-mail dell’account o pubblicate nell’Applicazione.",
"19.5. Assistenza: tritone.app@gmail.com o PEC momentidamare@pec.it.",
"20. Disposizioni finali",
"20.1. La nullità di una clausola non invalida le altre.",
"20.2. Il mancato esercizio di un diritto non costituisce rinuncia.",
"20.3. I documenti coordinati disciplinano il rapporto.",
"20.4. In caso di contrasto prevale la condizione particolare o l’Accordo sul Trattamento per gli aspetti di competenza.",
"20.5. La versione applicabile è quella accettata o resa disponibile.",
"TESTI DI ACCETTAZIONE DA IMPLEMENTARE NELL’INTERFACCIA",
"Le caselle devono essere non preselezionate.",
"☐ Termini d’uso — Dichiaro di aver letto e di accettare i presenti Termini e condizioni d’uso, versione 3.8 del 27 ottobre 2026.",
"☐ Informativa Privacy — Dichiaro di aver ricevuto e di aver potuto consultare l’Informativa Privacy applicabile, versione 1.4 del 20 ottobre 2026.",
"☐ Condizioni Economiche — Dichiaro di aver letto e di accettare le Condizioni Economiche del Piano selezionato, versione 1.2 del 20 ottobre 2026, inclusi prezzo, IVA, durata, modalità di pagamento, rinnovo, limiti e conseguenze della cessazione.",
"☐ Avvio immediato del Servizio — Chiedo espressamente che il Servizio inizi prima della scadenza del periodo di recesso e dichiaro di aver ricevuto le informazioni sulle conseguenze previste dalla legge, incluso l’eventuale obbligo di pagare la parte di Servizio già eseguita e, solo nei casi previsti dalla legge, la perdita del diritto di recesso.",
"☐ Accordo sul Trattamento dei Dati — Per il Diving Center: dichiaro di aver consultato e di accettare l’Accordo sul Trattamento dei Dati, versione 1.4, con Allegato Tecnico – Misure di Sicurezza versione 1.1, prima dell’inizio del trattamento effettuato dal Provider per conto del Diving Center.",
"☐ Approvazione specifica B2B — Per l’utente professionale: ai sensi dell’articolo 1341, comma 2, del Codice civile, dichiaro, con separata dichiarazione specifica resa con modalità idonea a soddisfare il requisito della forma scritta, di approvare le clausole indicate nella sezione seguente.",
"Approvazione specifica delle clausole per utenti professionali",
"Ai sensi dell’articolo 1341, comma 2, del Codice civile, l’utente professionale approva specificamente le clausole che prevedono o disciplinano: la sospensione o limitazione dell’account e del Piano (articoli 3.6, 4.6 e 14.1–14.2); i limiti della licenza e i divieti d’uso (articoli 5.1–5.5); la tutela della proprietà intellettuale, delle banche dati e del marchio (articoli 6.1–6.6); le limitazioni organizzative e di accesso del Diving Center (articolo 8.5); la rimozione o limitazione dei contenuti (articolo 9.5); la disponibilità, la manutenzione e le sospensioni del Servizio (articoli 11.1–11.3); le esclusioni, limitazioni di responsabilità e la manleva (articoli 12.2–12.3); la sospensione, risoluzione e cessazione (articoli 14.1–14.6); gli obblighi di riservatezza e divieto di divulgazione (articolo 15.2); i rimedi del Provider (articoli 16.1–16.2); le modalità di accettazione e approvazione specifica (articoli 18.1–18.4); i criteri di competenza per le controversie con utenti professionali (articolo 19.3); nonché le clausole delle Condizioni Economiche relative a mancato pagamento, cessazione ed esportazione dei dati.",
]

def xml(testo: str) -> str:
    return (
        testo.replace("&", "&")
        .replace("<", "<")
        .replace(">", ">")
    )

def main() -> None:
    doc = SimpleDocTemplate(
        OUT,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Termini e Condizioni d'Uso – Tritone 3.8",
        author="Alessandro Mogliani",
    )
    titolo = ParagraphStyle("titolo", fontName="Body-Bold", fontSize=12, leading=15, alignment=TA_CENTER, spaceAfter=2)
    sottotitolo = ParagraphStyle("sottotitolo", fontName="Body-Bold", fontSize=11, leading=14, alignment=TA_CENTER, spaceAfter=2)
    versione = ParagraphStyle("versione", fontName="Body", fontSize=9, leading=12, alignment=TA_CENTER, spaceAfter=8)
    corpo = ParagraphStyle("corpo", fontName="Body", fontSize=9, leading=12, alignment=TA_JUSTIFY, spaceAfter=6)
    voce = ParagraphStyle("voce", fontName="Body-Bold", fontSize=9.5, leading=12, alignment=TA_JUSTIFY, spaceBefore=4, spaceAfter=4)
    story = [
        Paragraph(xml("TERMINI E CONDIZIONI D’USO DELL’APPLICAZIONE"), titolo),
        Paragraph(xml("“TRITONE – LA VOCE DEL MARE”"), sottotitolo),
        Paragraph(xml("Versione: 3.8 – Data di efficacia: 27 ottobre 2026"), versione),
    ]
    for testo in PARAGRAFI:
        prima = testo.split(" ", 1)[0]
        e_titolo = prima.endswith(".") and prima[:-1].isdigit()
        e_blocco = testo.isupper() or testo.startswith("Approvazione specifica delle clausole")
        story.append(Paragraph(xml(testo), voce if e_titolo or e_blocco else corpo))
    doc.build(story)

if __name__ == "__main__":
    main()
