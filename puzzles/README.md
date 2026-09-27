# Brett

Serveren leser filene som ligger rett i denne mappen (`.csv`, `.txt`, `.json`, `.jsonl`) ved oppstart. Undermapper leses ikke. Hvert brett valideres (nøyaktig én løsning), dupliserte brett slås sammen, og løsningen regnes ut der filen mangler den.

| Fil | Brett | Innhold |
| --- | ---: | --- |
| `bibliotek.jsonl` | 1077 | Hovedsamlingen. JSON-linjer med `id`, `clues`, `puzzle`, `solution`, `difficulty`, `sym`, sortert etter antall gitte tall (22–32). Var tidligere delt i `chunk_aa.json` … `chunk_ak.json`. |
| `ekstra.csv` | 110 | Bare brett, uten løsning og nivå (header `puzzle`). Var `2.csv`. |

Til sammen 1187 unike brett. Nivået i filen brukes hvis det finnes, ellers graderes brettet.

Legg til brett ved å legge en ny fil her i et av formatene under og starte serveren på nytt. Med Docker er mappen montert inn, så det holder med en omstart.

## eksempler/

Leses ikke inn i spillet. Brukes i testene og viser notasjonene.

| Fil | Innhold |
| --- | --- |
| `csv-med-overskrift.csv` | `puzzle,solution,difficulty,id`. De samme 100 brettene som de første i `bibliotek.jsonl`. Var `1.csv`. |
| `brett-og-losning.txt` | `brett,løsning` per linje, samme 100 brett. Var `puso.txt`. |
| `ett-brett-per-linje.txt` | Bare brett, samme 100 brett. Var `single.txt`. |
| `nesten-ferdige.csv` | 9 brett med 80 av 81 tall fylt ut, altså testdata. Var `4.csv`. De lå tidligere i spillet, der ett av dem var merket «medium». |

## Notasjon

81 tegn rad for rad: `1`–`9` for gitte tall, `.` eller `0` for tom rute.

```
.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..
```
