# sudoku.eipi.dev

Sudoku uten konto. Du velger et brukernavn, og `sudoku.eipi.dev/<brukernavn>` blir spillprofilen din. Det finnes ingen passord: skriver noen inn et brukernavn som er i bruk, havner de på den profilen. Da kan de spille videre der (overta den) eller velge et annet navn.

## Kilder

| Del | Kilde |
| --- | --- |
| Spillets oppførsel | Adressas `sudoku.js` (static.polarismedia.no/hjernetrim/sudoku/prod/sudoku.js), lest som referanse. Ingen kode er kopiert, og filen ligger ikke i repoet. |
| Spillets utseende | Skjermbilder av Adressas sudoku. CSS-en deres finnes ikke i `sudoku.js`, så fargene er målt fra skjermbildene. |
| Registrering | Mekanismen fra ntnu.1024.no: skriv et brukernavn og gå rett til profilen. Ikke fargene eller oppsettet. |
| Forsiden, Importer, Statistikk, Innstillinger, mørk modus | Ingen kilde. Bruker spillets farger og kontroller. |

Fra `sudoku.js`: angre og «fjern alt» (kan angres), samme tall to ganger tømmer ruten, et tall fjernes fra notatene i samme rad, kolonne og boks, notater ligger under et tall og kommer tilbake når det slettes, et notat tømmer tallet i ruten, tallknapper merkes når tallet står 9 ganger, Shift bytter mellom tall og notater, piltaster og WASD flytter (venstre/høyre rundt i raden, opp/ned rundt i kolonnen), pause med «Sudoku / PAUSE / Fortsett» som også slår inn når vinduet mister fokus eller fanen skjules, «Noe er feil i løsningen din» når et fullt brett er feil, og konfetti i 5 sekunder med «GRATULERER», tiden og de 4 beste tidene på nivået. Et klikk på et nivå starter alltid et nytt brett. Hjelpen har to sider og viser «Start» første gang.

Ikke i `sudoku.js`, lagt til her: nivået «Veldig lett», Ctrl+Z / Ctrl+Y (gjør om), Delete, Backspace på en tom rute sletter notatene, ingen inntasting under pause, spørsmål før du forlater et påbegynt brett (det lagres som ikke fullført i statistikken), innstillinger for markering av like tall, tidtaker og automatisk fjerning av notater, og mørk modus. Tekstene i hjelpen er skrevet på nytt. Utseendet på pause, hjelp, resultat og fulle tallknapper er mitt eget, fordi CSS-en mangler.

## Kjør

```sh
npm start          # http://localhost:3000
npm test           # motor, spillmodell, statistikk, API
```

Krever Node 20.11 eller nyere. Ingen avhengigheter.

| Miljøvariabel | Standard    | Betydning                                    |
| ------------- | ----------- | -------------------------------------------- |
| `PORT`        | `3000`      | `0` gir en tilfeldig ledig port              |
| `HOST`        | `0.0.0.0`   |                                              |
| `DATA_DIR`    | `./data`    | Profiler lagres som `users/<navn>.json`      |
| `PUZZLE_DIR`  | `./puzzles` | Innebygd bibliotek, lastes ved oppstart      |

## Brettnotasjon

Et brett er 81 tegn lest rad for rad: `1`–`9` for gitte tall, `.` eller `0` for tomme ruter.

```
.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..
```

Import (og filene i `puzzles/`) godtar:

| Format                                        | Eksempel i repoet  |
| --------------------------------------------- | ------------------ |
| Ett brett per linje                           | `single.txt`, `2.csv` |
| `brett,løsning` per linje                     | `puso.txt`         |
| CSV med header `puzzle,solution,difficulty,…` | `1.csv`, `4.csv`   |
| JSON-linjer `{"id","puzzle","solution",…}`    | `chunk_*.json`     |
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

På brettene i `puzzles/` stemmer dette med 849 av 850 etiketter. Nesten alle (227 av 236) brettene merket `unknown` havner på nivå 5.

## API

| Metode   | Sti                                   | Beskrivelse                                      |
| -------- | ------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/library`                        | Innebygde brett (gzip, ETag)                     |
| `GET`    | `/api/overview`                       | Antall spillere, løste brett, nylig aktive, flest løste |
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

Fordi profilene er åpne med vilje, kan hvem som helst endre eller slette en profil. Sett gjerne opp rate limiting i reverse proxyen foran serveren.

## Struktur

```
puzzles/                 innebygd bibliotek (dine filer)
public/index.html        ett HTML-skall for / og /<brukernavn>
public/css/style.css     alt utseende, lys og mørk modus
public/js/main.js        ruter: forside eller profil
public/js/landing.js     forsiden
public/js/profile.js     profil: lasting, lagring, valg av brett, sider
public/js/board-view.js  spillet (tegning og input)
public/js/pages.js       Importer, Statistikk, Innstillinger
public/js/engine.js      notasjon, løser, gradering, generator, import-parser
public/js/game-state.js  spillregler uten DOM: notater, angre, feil, hint
public/js/stats.js       statistikk fra spillhistorikken
public/js/api.js         API-klient med lokal kopi og kø når serveren er nede
server/                  HTTP-server, bibliotek og fillagring
test/                    node:test
```
