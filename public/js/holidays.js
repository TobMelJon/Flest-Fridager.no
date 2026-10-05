/*
 * Norske helligdager (røde dager) og hjelpefunksjoner for datoer.
 * Ingen avhengigheter – alt regnes ut lokalt, også påsken.
 */
(function (root) {
  "use strict";

  // Datoer håndteres som "YYYY-MM-DD"-strenger og UTC-baserte Date-objekter
  // for å unngå problemer med sommertid.
  function makeDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  function addDays(date, n) {
    return new Date(date.getTime() + n * 86400000);
  }

  function toKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function fromKey(key) {
    var p = key.split("-").map(Number);
    return makeDate(p[0], p[1], p[2]);
  }

  // Påskedag etter den gregorianske kalenderen (Meeus/Jones/Butcher).
  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return makeDate(year, month, day);
  }

  // Returnerer { "YYYY-MM-DD": "Navn" } for lovbestemte helligdager.
  function norwegianHolidays(year) {
    var easter = easterSunday(year);
    var list = [
      [makeDate(year, 1, 1), "Første nyttårsdag"],
      [addDays(easter, -3), "Skjærtorsdag"],
      [addDays(easter, -2), "Langfredag"],
      [easter, "Første påskedag"],
      [addDays(easter, 1), "Andre påskedag"],
      [makeDate(year, 5, 1), "Arbeidernes dag"],
      [makeDate(year, 5, 17), "Grunnlovsdag"],
      [addDays(easter, 39), "Kristi himmelfartsdag"],
      [addDays(easter, 49), "Første pinsedag"],
      [addDays(easter, 50), "Andre pinsedag"],
      [makeDate(year, 12, 25), "Første juledag"],
      [makeDate(year, 12, 26), "Andre juledag"]
    ];
    var result = {};
    list.forEach(function (item) {
      var key = toKey(item[0]);
      // 1. mai eller 17. mai kan falle på Kristi himmelfart – slå sammen navnene.
      result[key] = result[key] ? result[key] + " / " + item[1] : item[1];
    });
    return result;
  }

  // Dager mange har fri uten at de er offisielle helligdager.
  function optionalDaysOff(year) {
    return {
      julaften: { key: toKey(makeDate(year, 12, 24)), name: "Julaften" },
      nyttarsaften: { key: toKey(makeDate(year, 12, 31)), name: "Nyttårsaften" }
    };
  }

  // Mandag i ISO-uke `week` for `year`.
  function mondayOfIsoWeek(year, week) {
    var jan4 = makeDate(year, 1, 4);
    var monday = addDays(jan4, -((jan4.getUTCDay() + 6) % 7));
    return addDays(monday, (week - 1) * 7);
  }

  /*
   * Skoleferier for et skoleår som slutter i `year`. Vinter- og høstferie
   * varierer mellom kommuner, så uken velges av brukeren. Jul og sommer er
   * omtrentlige (approx) fordi skolerutene varierer litt fra sted til sted.
   * Returnerer [{ name, start, end, approx }].
   */
  function schoolHolidays(year, options) {
    options = options || {};
    var winterWeek = options.winterWeek || 8;
    var autumnWeek = options.autumnWeek || 40;
    var easter = easterSunday(year);
    var list = [];
    function add(name, start, end, approx) {
      list.push({ name: name, start: toKey(start), end: toKey(end), approx: !!approx });
    }
    var winter = mondayOfIsoWeek(year, winterWeek);
    add("Vinterferie", winter, addDays(winter, 4));
    // Fra lørdag før palmesøndag til og med andre påskedag.
    add("Påskeferie", addDays(easter, -8), addDays(easter, 1));
    add("Sommerferie", makeDate(year, 6, 20), makeDate(year, 8, 16), true);
    var autumn = mondayOfIsoWeek(year, autumnWeek);
    add("Høstferie", autumn, addDays(autumn, 4));
    add("Juleferie", makeDate(year, 12, 21), makeDate(year + 1, 1, 1), true);
    return list;
  }

  var api = {
    makeDate: makeDate,
    addDays: addDays,
    toKey: toKey,
    fromKey: fromKey,
    easterSunday: easterSunday,
    norwegianHolidays: norwegianHolidays,
    optionalDaysOff: optionalDaysOff,
    mondayOfIsoWeek: mondayOfIsoWeek,
    schoolHolidays: schoolHolidays
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FFHolidays = api;
  }
})(this);
