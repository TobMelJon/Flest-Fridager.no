# Flest-Fridager.no

En nettside som hjelper deg å planlegge feriedagene slik at du får flest mulig fridager:

* Kalender for inneværende og neste år med ukenummer
* Røde dager (norske helligdager, inkludert påske, Kristi himmelfart og pinse – regnes ut automatisk)
* Inneklemte dager markeres
* Verdikart som viser hvilke dager som er mest verdt å ta fri
* Forslag som bare bruker feriedagene som faktisk gir ekstra fridager – resten plasserer du selv
* Sett av fellesferie, og klikk på dager i kalenderen for å legge inn egne feriedager
  (dobbeltklikk på en senere dag fyller hele perioden fra dagen du klikket sist)
* Registrer ferie du allerede har tatt ut ved å klikke på dager som har vært
* Live verdi: viser hva du får ved å bygge videre på dagene du har valgt
  («Tar du også tirsdag–torsdag, henger periodene sammen: 9 dager fri»)
* Skoleferier (vinterferie, påske, sommer, høstferie, jul) i kalenderen
* Valg som påvirker verdien: hvilke dager du jobber, fri på julaften/nyttårsaften,
  hvor mange feriedager du vil bruke på én fri og hvor kresen du er

## Teknologi

Siden er ren HTML, CSS og JavaScript uten avhengigheter og uten serverkode.
Alt kjører i nettleseren, så den kan legges på et hvilket som helst webhotell.

```
public/
  index.html        Siden
  css/style.css     Utseende (støtter mørk modus og mobil)
  js/holidays.js    Norske helligdager og påskeberegning
  js/planner.js     Kalender, inneklemte dager og optimalisering
  js/app.js         Brukergrensesnittet
tests/              Tester for logikken (Node.js)
```

### Verdimodellen: fridager du kobler sammen

Tar du fri på noen arbeidsdager, smelter de sammen med fridagene rundt til én
sammenhengende friperiode. Fridager du har uansett (helger, røde dager og feriedager du
allerede har valgt) ligger i friblokker. **Verdien** er hvor mange fridager valget kobler på
utover den største friblokken du har uansett, og utover det samme antall feriedager kobler
sammen i en vanlig uke:

```
verdi = lengde på friperioden − feriedager brukt − største friblokk − vanlig uke
```

| Eksempel (2027)                                    | Regnestykke      | Verdi |
|----------------------------------------------------|------------------|------:|
| Inneklemt fredag etter Kristi himmelfart           | 4 − 1 − 2 − 0    | **+1** |
| Mandag–onsdag før påske (helgen kobles til påsken) | 10 − 3 − 5 − 0   | **+2** |
| Onsdag før skjærtorsdag alene                      | 6 − 1 − 5 − 0    | 0 |
| Mandag 4. januar (1. januar er en fredag)          | 4 − 1 − 3 − 0    | 0 |
| Helt vanlig uke                                    | 9 − 5 − 2 − 2    | 0 |
| Mandag og fredag valgt, ta tirsdag–torsdag         | 9 − 3 − 3 − 0    | **+3** |

Inneklemte dager gir dermed høyest verdi per feriedag (+1 for 1 dag).

Brukerens valg påvirker verdien:

* **Dager jeg jobber**: hva som er fridager, og hva en «vanlig uke» kobler sammen
* **Julaften / nyttårsaften**: regnes som fridager
* **Hvor mange feriedager på én fri**: lengste uttak som vurderes (1 = bare inneklemte dager)
* **Hvor kresen er du**: minste verdi per feriedag for at noe foreslås
* **Egne feriedager og fellesferie**: regnes som fridager, så verdikart, forslag og tips
  oppdateres live rundt dem

`planner.js` har fire deler:

* `dayValues()` lager verdikartet: for hver dag det beste uttaket den inngår i.
* `optimize()` velger de verdifulle uttakene som til sammen gir mest verdi innenfor
  budsjettet. Den løses eksakt med dynamisk programmering, og testene sjekker den mot
  brute force. Dager uten verdi brukes ikke, så feriedager blir stående igjen til deg.
* `ownSuggestions()` gir live tips som bygger videre på dagene du har valgt.
* `vacationPeriods()` oppsummerer friperiodene med lengde og verdi.

### Skoleferier

Vinter- og høstferie velges med ukeknapper. Planen er at ukene på sikt forhåndsvelges per
kommune eller fylke fra en tabell som oppdateres hvert år.

## Kjøre lokalt

Åpne `public/index.html` direkte i nettleseren, eller start en enkel server:

```
python3 -m http.server 8000 -d public
```

og gå til http://localhost:8000.

## Tester

Krever Node.js 18 eller nyere:

```
npm test
```

## Publisere på webhotell

Last opp **innholdet** i `public/`-mappen (ikke selve mappen) til webhotellets rotmappe,
vanligvis `public_html/` eller `www/`, f.eks. via FTP/SFTP eller filbehandleren i
kontrollpanelet. Det trengs ingen database, PHP eller Python.

Den tidligere Python/Flask-prototypen finnes i git-historikken.
