# sudoku.eipi.dev

Sudoku uten konto. Du velger et brukernavn, og `sudoku.eipi.dev/<brukernavn>` blir spillprofilen din. Det finnes ingen passord: skriver noen inn et brukernavn som er i bruk, havner de på den profilen. Da kan de spille videre der (overta den) eller velge et annet navn.

## Utseende

Laget for mobil i et mørkt rom. Skjermen viser bare brettet, en rad med tall og tre små ikoner: notater, angre og meny. Ingen klokke, ingen nivåvelger og ingen tekst mens du spiller. Tiden måles likevel, for statistikken.

Menyen (⋯) åpnes som et ark nederst:

- nytt brett, nivå 1–5
- fem fargepaletter: svart (standard), rødt nattlys, rav, blå og lys
- lysstyrke, som demper alt unntatt svart
- marker like tall, rydd notater
- importer, statistikk og bytt profil

Ingen systemdialoger, fordi `confirm()` og `alert()` lyser opp rommet. Sletting krever i stedet to trykk.

Spillereglene for input (samme tall tømmer ruten, notater ligger under et tall, et notat tømmer tallet, et tall fjernes fra notatene i rad, kolonne og boks) ble opprinnelig hentet fra Adressas `sudoku.js`, lest som referanse. Ingen kode er kopiert, og filen ligger ikke i repoet. Registreringen følger mekanismen fra ntnu.1024.no: skriv et navn og gå rett til profilen.

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
public/css/style.css     alt utseende og fargepalettene
public/js/main.js        ruter: forside eller profil
public/js/landing.js     forsiden
public/js/profile.js     profil: lasting, lagring, valg av brett, meny, paletter
public/js/board-view.js  spillet (tegning og input)
public/js/pages.js       Importer og Statistikk
public/js/engine.js      notasjon, løser, gradering, generator, import-parser
public/js/game-state.js  spillregler uten DOM: notater, angre, feil, hint
public/js/stats.js       statistikk fra spillhistorikken
public/js/api.js         API-klient med lokal kopi og kø når serveren er nede
server/                  HTTP-server, bibliotek og fillagring
test/                    node:test
```
