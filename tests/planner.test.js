// Kjør med: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const H = require("../public/js/holidays.js");
const P = require("../public/js/planner.js");

test("påskedag stemmer for kjente år", () => {
  assert.strictEqual(H.toKey(H.easterSunday(2024)), "2024-03-31");
  assert.strictEqual(H.toKey(H.easterSunday(2025)), "2025-04-20");
  assert.strictEqual(H.toKey(H.easterSunday(2026)), "2026-04-05");
  assert.strictEqual(H.toKey(H.easterSunday(2027)), "2027-03-28");
});

test("norske helligdager 2026", () => {
  const h = H.norwegianHolidays(2026);
  assert.deepStrictEqual(Object.keys(h).sort(), [
    "2026-01-01", "2026-04-02", "2026-04-03", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-14", "2026-05-17", "2026-05-24", "2026-05-25",
    "2026-12-25", "2026-12-26"
  ]);
  assert.strictEqual(h["2026-05-14"], "Kristi himmelfartsdag");
});

test("sammenfallende helligdager slås sammen (2008: 1. mai = Kristi himmelfart)", () => {
  const h = H.norwegianHolidays(2008);
  assert.strictEqual(h["2008-05-01"], "Arbeidernes dag / Kristi himmelfartsdag");
});

test("fredag etter Kristi himmelfart 2026 er inneklemt", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31");
  const fri = days.find((d) => d.key === "2026-05-15");
  assert.strictEqual(fri.squeeze, true);
  assert.strictEqual(days.filter((d) => d.squeeze).length, 1);
});

test("vanlig periodelengde (baseline) for man–fre og 4-dagers uke", () => {
  assert.deepStrictEqual(P.baselineTable([1, 2, 3, 4, 5], 10), [0, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16]);
  assert.deepStrictEqual(P.baselineTable([1, 2, 3, 4], 5), [0, 4, 5, 6, 10, 11]);
});

test("inneklemt dag gir 1 ekstra fridag", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31");
  const res = P.optimize(days, 1, { maxCost: 1 });
  // Fredag etter Kristi himmelfart og tirsdag etter 2. pinsedag gir begge 4 dager (vanlig: 3).
  assert.strictEqual(res.chosen.length, 1);
  assert.ok(["2026-05-15", "2026-05-26"].includes(days[res.chosen[0]].key));
  assert.strictEqual(res.gained, 1);
});

test("bruker bare dager som gir verdi – resten av budsjettet blir igjen", () => {
  const days = P.buildDays("2026-12-01", "2028-01-31", { planFrom: "2027-01-01", planTo: "2027-12-31" });
  const res = P.optimize(days, 25, { maxCost: 5 });
  assert.ok(res.used < 25, "brukte " + res.used);
  res.chosen.forEach((i) => { days[i].suggested = true; });
  P.vacationPeriods(days).forEach((p) => assert.ok(p.bonus >= 1, JSON.stringify(p)));
});

test("påsken 2027: 3 feriedager gir 10 dager fri", () => {
  const days = P.buildDays("2027-03-01", "2027-04-30");
  const res = P.optimize(days, 3, { maxCost: 5 });
  assert.deepStrictEqual(res.chosen.map((i) => days[i].key), ["2027-03-22", "2027-03-23", "2027-03-24"]);
  assert.strictEqual(res.gained, 5);
});

test("strengere krav til verdi gir færre forslag", () => {
  const mk = () => P.buildDays("2026-12-01", "2028-01-31", { planFrom: "2027-01-01", planTo: "2027-12-31" });
  const loose = P.optimize(mk(), 25, { maxCost: 5, minRatio: 0.01 });
  const strict = P.optimize(mk(), 25, { maxCost: 5, minRatio: 1 });
  assert.ok(strict.used < loose.used);
});

test("egne feriedager respekteres og gir ikke dobbel bonus", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31", {
    vacation: { "2026-05-15": true }
  });
  const fri = days.find((d) => d.key === "2026-05-15");
  assert.strictEqual(fri.locked, true);
  assert.strictEqual(fri.takeable, false);
  const res = P.optimize(days, 5, { maxCost: 1 });
  assert.ok(!res.chosen.includes(days.indexOf(fri)));
  // Å forlenge den egne perioden med en vanlig dag gir ingen ny bonus.
  assert.ok(!res.chosen.map((i) => days[i].key).includes("2026-05-18"));
});

test("planperiode begrenser valgbare dager", () => {
  const days = P.buildDays("2026-01-01", "2026-12-31", { planFrom: "2026-10-01" });
  const res = P.optimize(days, 25);
  res.chosen.forEach((i) => assert.ok(days[i].key >= "2026-10-01"));
});

test("verdikart markerer inneklemte dager og påskeuken", () => {
  const days = P.buildDays("2027-03-01", "2027-05-31");
  const v = P.dayValues(days, { maxCost: 5 });
  const at = (k) => v[days.findIndex((d) => d.key === k)];
  assert.strictEqual(at("2027-05-07").gain, 1);     // fredag etter Kristi himmelfart
  assert.strictEqual(at("2027-03-24").ratio, 3);    // onsdag før skjærtorsdag: 1 dag → 6 dager
  assert.strictEqual(at("2027-04-14"), null);       // helt vanlig onsdag
});

// Brute force: prøv alle delmengder av valgbare dager og sammenlign med DP.
function score(days, chosenSet, opts) {
  const base = P.baselineTable([1, 2, 3, 4, 5], 40);
  const free = days.map((d, i) => d.off || chosenSet.has(i));
  let gain = 0;
  for (let i = 0; i < days.length; i++) {
    if (!free[i]) continue;
    let j = i, c = 0;
    while (j < days.length && free[j]) { if (chosenSet.has(j)) c++; j++; }
    if (c > 0) {
      const g = (j - i) - base[c];
      if (c > opts.maxCost || g < 1 || g / c < opts.minRatio - 1e-9) return -Infinity;
      gain += g;
    }
    i = j - 1;
  }
  return gain;
}

test("DP gir samme optimum som brute force", () => {
  const ranges = [
    ["2026-03-25", "2026-04-20"],
    ["2026-05-01", "2026-05-31"],
    ["2026-12-14", "2027-01-08"],
    ["2027-03-15", "2027-04-07"]
  ];
  for (const [a, b] of ranges) {
    for (const budget of [1, 2, 3, 5]) {
      for (const opts of [{ maxCost: 1, minRatio: 0.01 }, { maxCost: 5, minRatio: 0.01 }, { maxCost: 5, minRatio: 1 }]) {
        const days = P.buildDays(a, b);
        const idx = days.map((d, i) => (d.takeable ? i : -1)).filter((i) => i >= 0);
        let best = 0;
        for (let mask = 0; mask < 1 << idx.length; mask++) {
          let bits = 0;
          for (let m = mask; m; m &= m - 1) bits++;
          if (bits > budget) continue;
          const set = new Set(idx.filter((_, k) => mask & (1 << k)));
          best = Math.max(best, score(days, set, opts));
        }
        const res = P.optimize(days, budget, opts);
        const label = `${a}–${b} budsjett ${budget} ${JSON.stringify(opts)}`;
        assert.strictEqual(res.gained, best, label);
        assert.strictEqual(score(days, new Set(res.chosen), opts), best, label);
      }
    }
  }
});
