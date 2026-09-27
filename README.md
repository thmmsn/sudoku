# sudoku.eipi.dev

Sudoku uten konto. Du velger et brukernavn, og `sudoku.eipi.dev/<brukernavn>` blir spillprofilen din. Det finnes ingen passord: skriver noen inn et brukernavn som er i bruk, havner de på den profilen. Da kan de spille videre der (overta den) eller velge et annet navn.

## Utseende

Laget for mobil i et mørkt rom. Skjermen viser bare brettet, en rad med tall og tre små ikoner: notater, angre og meny. Ingen klokke, ingen nivåvelger og ingen tekst mens du spiller. Tiden måles likevel, for statistikken.

Like tall markeres tydelig: trykker du på en rute med et tall, får alle ruter med samme tall en svak vask i palettens aksentfarge og et glødende siffer, og notater med det tallet lyser også. Trykker du et tall på tastaturet uten at en rute er valgt, markeres det tallet på hele brettet. Trykk en gang til for å fjerne markeringen.

På **utseende** kan du selv endre:

| Gruppe | Innstillinger |
| --- | --- |
| stil | glød og glans av/på (av = vanlig, flat CSS uten gradienter, glød, glass og runde hjørner) |
| tall | størrelse, tykkelse på gitte tall og dine tall, notatenes størrelse og tykkelse, tallknappenes størrelse |
| linjer | rutelinjer, bokslinjer og ramme (0–6 px), runde hjørner |
| markering | bakgrunn på like tall, hvor mye andre tall dempes, bakgrunn på valgt rute |
| glans | glød og glans i tallene (0 = flate farger) |
| farger | gitte tall, dine tall, notater, like tall, markering, feil, rutelinjer, bokslinjer, bakgrunn |

Fargene følger paletten til du endrer dem, og en ny palett i menyen starter fra sine egne farger. Alt lagres i profilen og legges på før siden tegnes. «Tilbakestill alt» gir standardverdiene tilbake. Verdiene er CSS-variabler på `<html>` (se `public/js/look.js`), så nye innstillinger legges til med én linje der og én `var()` i `style.css`.

Utseendet har en dempet glins: tallene er tegnet med en myk gradient ovenfra og ned, brettet har en gradientramme med avrundede hjørner og en svak glød i aksentfargen, og menyen er et nesten tett glassark. Når brettet er løst, glir et lysstreif over tallene. Alt holder seg svart og dempet.

Visningen er låst til skjermen: ingenting ruller, zoomer eller kan dras bort. Bare sidene (import, statistikk) og menyen ruller, og bare inni seg selv. Ligger telefonen på siden, står tallene i en 3×3-blokk ved siden av brettet.

Menyen (⋯) åpnes som et ark nederst:

- nytt brett, nivå 1–5
- fem fargepaletter: svart (standard), rødt nattlys, rav, blå og lys
- lysstyrke, som demper alt unntatt svart
- av/på-brytere for «marker like tall» og «rydd notater»
- **utseende**: en egen side der du justerer alt selv, med et forhåndsvisningsbrett som oppdateres mens du drar
- importer, statistikk og bytt profil
- hint, nederst: **notater** fyller inn alle mulige kandidater, **fjern** tar bort kandidater fra notatene dine ett logisk steg om gangen, og **tall** setter inn ett riktig tall

«Fjern» bruker samme teknikkstige som graderingen (først kandidater som kolliderer med tall på brettet, så låste kandidater, par, tripler, X-wing og swordfish). Den fjerner aldri riktig tall. Står det et feil tall på brettet, fjernes det først. Finner logikken ingenting, brukes løsningen på valgt rute. Hint teller i statistikken, og topplisten tar bare med spill uten hint.

Ingen systemdialoger, fordi `confirm()` og `alert()` lyser opp rommet. Sletting krever i stedet to trykk.

Spillereglene for input (samme tall tømmer ruten, notater ligger under et tall, et notat tømmer tallet, et tall fjernes fra notatene i rad, kolonne og boks) ble opprinnelig hentet fra Adressas `sudoku.js`, lest som referanse. Ingen kode er kopiert, og filen ligger ikke i repoet. Registreringen følger mekanismen fra ntnu.1024.no: skriv et navn og gå rett til profilen.

## Uten nett

Appen er en PWA. Ved første besøk lagrer en service worker (`public/sw.js`) hele appen og brettbiblioteket i nettleseren. Etter det virker den uten nett, for eksempel på et fly.

- Pågående spill skrives til nettleseren ved hvert trekk. Serveren får det senest 2 s etter, eller med en gang når fanen lukkes. Ved oppstart vinner kopien som er nyest.
- Ferdige spill som ikke når serveren, legges i kø og sendes neste gang.
- Legg appen til på hjemskjermen («Legg til på Hjem-skjerm»). Da åpnes den i fullskjerm, uten nettleserlinjer, i stående format, og går rett til profilen du brukte sist.

Service workers krever HTTPS (eller `localhost`).

## Kjør

### Docker

```sh
docker compose up -d --build     # http://localhost:3000
```

Alle variabler er valgfrie. Legg egne verdier i `.env` (se `.env.example`):

| Variabel | Standard | Betydning |
| --- | --- | --- |
| `SUDOKU_PORT` | `3000` | Port på verten |
| `SUDOKU_BIND` | `0.0.0.0` | `127.0.0.1` bak en proxy på samme maskin |
| `SUDOKU_DATA` | `sudoku-data` | Volum eller mappe for profilene. En mappe må være skrivbar for uid 1000. |
| `SUDOKU_PUZZLES` | `./puzzles` | Brettfilene, lest ved oppstart. Legg til en fil og start på nytt. |
| `DATA_MAX_BYTES` | `1073741824` | Samlet størrelse på alle profiler (1 GB). Over dette avvises nye profiler og importer. |
| `RATE_NEW_PROFILES` | `20` | Nye profiler per IP-adresse per time |
| `RATE_IMPORTS` | `30` | Importer per IP-adresse per time |
| `TRUST_PROXY` | `0` | Sett `1` bak en reverse proxy, så grensene bruker besøkendes adresse fra `X-Forwarded-For`. Ellers deler alle proxyens adresse. |

Containeren kjører som `node` (ikke root) og har en helsesjekk.

### Uten Docker

```sh
npm start          # http://localhost:3000
npm test           # motor, spillmodell, statistikk, API, grenser, PWA
```

Krever Node 20.11 eller nyere. Ingen avhengigheter. I tillegg til variablene over: `PORT` (`0` gir en ledig port), `HOST`, `DATA_DIR` (`./data`) og `PUZZLE_DIR` (`./puzzles`).

## Brett

Biblioteket er filene i `puzzles/`: 1187 unike brett (`bibliotek.jsonl` og `ekstra.csv`), alle med løsning (løseren fyller inn der filen mangler den). Eksempelfilene i `puzzles/eksempler/` lastes ikke inn. Se `puzzles/README.md`. Nytt brett tar et brett du ikke har løst på valgt nivå. Når alle er løst, gjentas de. Generatoren brukes bare hvis et nivå er helt tomt.

Egne brett legges inn under **importer**:

- **Skriv inn**, for eksempel fra avisen: trykk rute og tall på et tomt brett. Det sjekkes mens du skriver: like tall i samme enhet markeres, og du ser om brettet har 0, 1 eller flere løsninger. Du kan bare lagre med nøyaktig én løsning, og brettet startes med en gang. Utkastet lagres lokalt til det er lagret.
- **Lim inn tekst eller fil** i formatene under.

Importerte brett hører til profilen og lagres uten løsning. Løseren finner den på millisekunder, og det halverer plassen. Deling skjer med lenke, `/<navn>?p=<81 tegn>`. Da ligger brettet i selve lenken og tar ingen plass på serveren.

## Brettnotasjon

Et brett er 81 tegn lest rad for rad: `1`–`9` for gitte tall, `.` eller `0` for tomme ruter.

```
.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..
```

Tekstimport (og filene i `puzzles/`) godtar:

| Format                                        | Eksempel i repoet  |
| --------------------------------------------- | ------------------ |
| Ett brett per linje                           | `ekstra.csv`, `eksempler/ett-brett-per-linje.txt` |
| `brett,løsning` per linje                     | `eksempler/brett-og-losning.txt` |
| CSV med header `puzzle,solution,difficulty,…` | `eksempler/csv-med-overskrift.csv` |
| JSON-linjer `{"id","puzzle","solution",…}`    | `bibliotek.jsonl` |
| JSON-liste med objekter eller strenger        |                    |
| Innlimt 9×9-rutenett med `|`, `+`, `-`        |                    |

Hvert brett valideres: 81 tegn, minst 17 gitte tall, ingen regelbrudd og **nøyaktig én løsning**. En oppgitt løsning må stemme. Ugyldige linjer rapporteres med linjenummer og årsak.

## Vanskelighetsgrad

Motoren løser brettet slik et menneske ville gjort det, og bruker alltid den enkleste teknikken som gir fremgang. Vanskeligheten er den vanskeligste teknikken som trengtes:

| Nivå | Teknikk                                    | Etikett     |
| ---- | ------------------------------------------ | ----------- |
| 1    | Skjult singel                              | `very-easy` |
| 2    | Naken singel                               | `easy`      |
| 3    | Låste kandidater (pointing/claiming)       | `medium`    |
| 4    | Nakne/skjulte par og tripler               | `hard`      |
| 5    | X-wing, swordfish, eller ikke løsbar logisk | `very-hard` |

I spillet heter nivåene *Veldig lett, Lett, Middels, Vanskelig, Ekspert*: Adressas fire navn, med «Veldig lett» lagt til foran.

I `bibliotek.jsonl` stemmer dette med alle 845 etikettene. Nesten alle (227 av 232) brettene merket `unknown` havner på nivå 5.

## API

| Metode   | Sti                                   | Beskrivelse                                      |
| -------- | ------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/library`                        | Innebygde brett (gzip, ETag)                     |
| `GET`    | `/api/overview`                       | Antall spillere, løste brett, flest løste, og `best`: topp 5 tider per nivå |
| `GET`    | `/api/check/<navn>`                   | `{ valid, exists, summary }`                     |
| `GET`    | `/api/users/<navn>`                   | Hele profilen, 404 hvis den ikke finnes          |
| `PUT`    | `/api/users/<navn>/settings`          | Innstillinger (flatt objekt)                     |
| `PUT`    | `/api/users/<navn>/current`           | Pågående spill, eller `null`                     |
| `POST`   | `/api/users/<navn>/games`             | Ferdig spill (`solved` / `abandoned`)            |
| `POST`   | `/api/users/<navn>/puzzles`           | Import `{ text, collection }`                    |
| `DELETE` | `/api/users/<navn>/puzzles/<id>`      | Slett ett importert brett                        |
| `DELETE` | `/api/users/<navn>/puzzles?collection=` | Slett en samling                               |
| `DELETE` | `/api/users/<navn>`                   | Slett profilen                                   |

Brukernavn: 2–30 tegn, `a-z 0-9 æ ø å - _`, uten skille på store og små bokstaver (`/Ola` sendes videre til `/ola`).

Serveren stoler ikke på klienten. Gitte tall kan ikke endres, en løsning må være et gyldig ferdig brett som stemmer med brettet, og størrelser og antall er begrenset. Skrivinger til samme profil køes og skrives atomisk.

Grenser mot flooding:

- 500 importerte brett per profil (rundt 150 kB), 2000 per import og 2 MB per forespørsel
- 5000 spill i historikken per profil
- nye profiler og importer per IP-adresse per time, og et samlet diskbudsjett (se tabellen over). Svaret er `429` eller `507`.

**Toppliste:** for hvert nivå vises hver spillers beste tid på et bibliotekbrett uten hint, topp 5. Tider under et halvt sekund per tom rute regnes som umulige og tas ikke med. Tiden måles i nettleseren og kan ikke bevises, så topplisten bygger på tillit.

Fordi profilene er åpne med vilje, kan hvem som helst endre eller slette en profil.

## Struktur

```
puzzles/                 brettene: bibliotek.jsonl, ekstra.csv, eksempler/ (se puzzles/README.md)
public/index.html        ett HTML-skall for / og /<brukernavn>
public/css/style.css     alt utseende og fargepalettene
public/js/main.js        ruter: forside eller profil
public/js/landing.js     forsiden
public/js/profile.js     profil: lasting, lagring, valg av brett, meny, paletter
public/js/board-view.js  spillet (tegning og input)
public/js/pages.js       Importer og Statistikk
public/js/entry.js       skriv inn et brett
public/sw.js             service worker (uten nett)
public/manifest.webmanifest  installerbar app
public/js/engine.js      notasjon, løser, gradering, generator, import-parser
public/js/game-state.js  spillregler uten DOM: notater, angre, feil, hint (notater, fjern, tall)
public/js/stats.js       statistikk fra spillhistorikken
public/js/api.js         API-klient med lokal kopi og kø når serveren er nede
server/                  HTTP-server, bibliotek, fillagring, grenser og toppliste
Dockerfile, compose.yaml Docker
test/                    node:test
```
