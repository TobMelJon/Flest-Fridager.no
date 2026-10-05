# Flest-Fridager.no

En nettside som hjelper deg å planlegge feriedagene slik at du får flest mulig fridager:

* Kalender for inneværende og neste år med ukenummer
* Røde dager (norske helligdager, inkludert påske, Kristi himmelfart og pinse – regnes ut automatisk)
* Inneklemte dager markeres
* Verdikart som viser hvilke dager som er mest verdt å ta fri
* Forslag som bare bruker feriedagene som faktisk gir ekstra fridager – resten plasserer du selv
* Sett av sommerferie, og klikk på dager i kalenderen for å legge inn egne feriedager
  (dobbeltklikk på en senere dag fyller hele perioden fra dagen du klikket sist)
* Registrer ferie du allerede har tatt ut ved å klikke på dager som har vært
* Live verdi: viser hva du får ved å legge til dager rundt det du har valgt
  («+2 feriedager → 9 dager fri i stedet for 5»)
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

### Verdimodellen

Tar du fri på noen arbeidsdager, smelter de sammen med helger og røde dager rundt til én
sammenhengende friperiode. **Verdien** (bonus) er hvor mange *ekstra* fridager du får
sammenlignet med å bruke like mange feriedager i en helt vanlig uke uten røde dager:

```
bonus = lengde på friperioden − vanlig lengde for samme antall feriedager
```

| Feriedager | Vanlig lengde (man–fre) |
|-----------:|------------------------:|
| 1          | 3 (langhelg)            |
| 2          | 4                       |
| 5          | 9 (en uke med helger)   |

Eksempler for 2027:

* Fredag etter Kristi himmelfart: 1 feriedag → 4 dager fri, **+1**
* Mandag–onsdag før påske: 3 feriedager → 10 dager fri, **+5**
* En helt vanlig uke: 5 feriedager → 9 dager fri, **+0** (foreslås ikke)

Brukerens valg påvirker verdien:

* **Dager jeg jobber**: hva som regnes som fridager og som «vanlig» lengde
* **Julaften / nyttårsaften**: regnes som fridager
* **Hvor mange feriedager på én fri**: lengste uttak som vurderes (1 = bare inneklemte dager)
* **Hvor kresen er du**: minste bonus per feriedag for at noe foreslås
* **Egne feriedager og sommerferie**: låses, og bare *økningen* i bonus teller når et forslag
  bygger videre på dem

`planner.js` har tre deler:

* `dayValues()` lager verdikartet: for hver dag det beste uttaket den inngår i.
* `extensionOptions()` finner hva egne perioder vokser til hvis du legger til dager
  rett før eller etter dem. Dette inngår også i verdikartet.
* `optimize()` velger de verdifulle uttakene som til sammen gir mest bonus innenfor
  budsjettet. Den løses eksakt med dynamisk programmering, og testene sjekker den mot
  brute force. Dager uten bonus brukes ikke, så feriedager blir stående igjen til deg.
* `vacationPeriods()` oppsummerer friperiodene med lengde og bonus.

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
