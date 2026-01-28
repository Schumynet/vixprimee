## 🎬 VixPrime (Fork)

Questo progetto è un fork di Schumynet/vixprime, ottimizzato per funzionare in modalità completamente serverless sfruttando le API di VixSrc.com.

VixPrime è una piattaforma web moderna per lo streaming di contenuti multimediali che non necessita di un backend dedicato, garantendo velocità, privacy e facilità di deploy.

Vuoi provarlo senza installarlo? [Vai al sito](https://player.akirayuki.online/)

### ✨ Caratteristiche Principali

Zero Backend: Il sito comunica direttamente con le API di VixSrc.com. Non sono necessari database o server Node.js/PHP.

Gestione Preferiti: Possibilità di aggiungere o rimuovere Film e Serie TV dalla propria lista personale con un click.

Backup & Ripristino: Funzione integrata per esportare i propri salvataggi in un file locale e ripristinarli su altri dispositivi.

Ricerca Intelligente: Motore di ricerca rapido per trovare istantaneamente titoli nel vasto catalogo disponibile.

Catalogo Film e Serie TV: Organizzazione chiara tra contenuti cinematografici e serie a episodi.

Nota: Seguendo la configurazione ottimizzata, la categoria "Tutto" è stata rimossa per una navigazione più pulita, impostando la prima categoria disponibile come default.

Totalmente Responsive: L'interfaccia si adatta perfettamente a qualsiasi schermo, offrendo un'esperienza fluida sia su PC che su smartphone e tablet.

### 🚀 Tecnologie e Architettura

Il progetto si basa su un'architettura Client-Side First:

Frontend: HTML5, CSS3 (con layout flessibile) e JavaScript moderno.

API di Contenuto: Integrazione con VixSrc.com per il recupero di metadati e flussi streaming.

Storage: I dati dell'utente (preferiti e impostazioni) sono gestiti tramite localStorage, garantendo che nessun dato sensibile venga inviato a server esterni.

### 🛠️ Installazione

Essendo un sito statico, l'installazione richiede pochi secondi:

Clona il repository:

git clone [https://github.com/TUO-USERNAME/vixprime.git](https://github.com/TUO-USERNAME/vixprime.git)


Entra nella cartella:

cd vixprime


Avvio:
Carica i file su qualsiasi servizio di hosting statico (GitHub Pages, Netlify, Vercel) o apri semplicemente il file index.html nel tuo browser.

### 💾 Gestione dei Dati Utente

Per garantire la persistenza dei dati senza un database, VixPrime offre:

Esporta: Scarica un file JSON contenente la tua lista dei preferiti.

Ripristina: Carica il file precedentemente scaricato per sincronizzare i tuoi dati su un nuovo browser o dispositivo.

⚖️ Disclaimer

Questo software è un fork sviluppato a scopo puramente educativo e dimostrativo.

Il codice originale appartiene a Schumynet.

Questo fork non ospita alcun file multimediale sui propri server.

L'utente è l'unico responsabile dell'utilizzo dello strumento e della conformità con le leggi sul copyright del proprio paese relative ai contenuti indicizzati tramite API di terze parti.

Progetto basato su vixprime.
