# Flest-Fridager.no

En nettside som hjelper deg å planlegge feriedagene slik at du får flest mulig fridager:

* Kalender for inneværende og neste år med ukenummer
* Røde dager (norske helligdager, inkludert påske, Kristi himmelfart og pinse – regnes ut automatisk)
* Inneklemte dager markeres
* Skriv inn antall feriedager og få et forslag til beste fordeling
* Sett av sommerferie, og klikk på dager i kalenderen for å legge inn egne feriedager
* Valgfritt: fri på julaften og nyttårsaften

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

### Hvordan optimaliseringen fungerer

Hver arbeidsdag du tar fri slår seg sammen med helger og røde dager rundt seg til en
sammenhengende friperiode. Algoritmen (dynamisk programmering i `planner.js`) velger de
arbeidsdagene som gir størst total lengde på friperiodene, gitt antall feriedager og
korteste ønskede periode («Hva ønsker du deg?»). Ved like gode løsninger foretrekkes
færre og lengre perioder. Resultatet er eksakt optimalt – testene sjekker det mot
brute force.

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
