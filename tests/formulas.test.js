/**
 * Worked-example tests for CRRT & PD Dosing formulas.
 * Run: node tests/formulas.test.js
 * Every numeric expectation is either a direct rearrangement of a cited
 * equation or a published worked value (Watson, Mosteller, Twardowski bands,
 * Meier-Kriesche cutoff, KDIGO ranges, ISPD 2021 UF screens).
 */
"use strict";

const F = require("../js/formulas.js");

let passed = 0;
let failed = 0;
const failures = [];

function approx(actual, expected, eps, msg) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= eps;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${msg}: got ${actual}, expected ${expected} ± ${eps}`);
  }
}

function eq(actual, expected, msg) {
  const ok = actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${msg}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function isTrue(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

function throws(fn, msg) {
  try {
    fn();
    failed++;
    failures.push(`${msg}: expected throw`);
  } catch (e) {
    passed++;
  }
}

function section(name) {
  console.log("\n▸ " + name);
}

/* ── Anthropometrics ─────────────────────────────────────────────────────── */
section("Watson TBW (Am J Clin Nutr 1980;33:27-39, PMID 6986753)");
// Male: 2.447 − 0.09516×50 + 0.1074×178 + 0.3362×80
// = 2.447 − 4.758 + 19.1172 + 26.896 = 43.7022
approx(F.watsonTbw(50, 178, 80, false), 43.7022, 1e-9, "male Watson 50 y, 178 cm, 80 kg");
// Female has no age term: −2.097 + 0.1069×165 + 0.2466×70 = 32.8035
approx(F.watsonTbw(50, 165, 70, true), 32.8035, 1e-9, "female Watson (no age term)");
approx(F.watsonTbw(20, 165, 70, true), F.watsonTbw(80, 165, 70, true), 1e-12, "female age-independent");
// Age coefficient check: difference at 10 years is 0.9516 L for a man
approx(
  F.watsonTbw(50, 178, 80, false) - F.watsonTbw(60, 178, 80, false),
  0.9516,
  1e-12,
  "male age coefficient 0.09516 (not the 0.09156 variant)"
);

section("BSA Mosteller (NEJM 1987) and DuBois (1916)");
approx(F.bsaMosteller(170, 70), Math.sqrt((170 * 70) / 3600), 1e-12, "Mosteller identity");
approx(F.bsaMosteller(170, 70), 1.818118685772619, 1e-12, "Mosteller 170 cm 70 kg");
approx(F.bsaDuBois(170, 70), 0.007184 * Math.pow(70, 0.425) * Math.pow(170, 0.725), 1e-12, "DuBois identity");
approx(F.bsaDuBois(170, 70), 1.809707801753247, 1e-12, "DuBois 170 cm 70 kg");

/* ── CRRT dose ───────────────────────────────────────────────────────────── */
section("Plasma flow, predilution factor, effluent dose (KDIGO AKI 2012 5.8.4)");
approx(F.plasmaFlowMlH(150, 0.3), 6300, 1e-12, "Qp 150 mL/min Hct 30% = 6300 mL/h");
approx(F.plasmaFlowMlH(150, 30), 6300, 1e-12, "Hct as percent 30");
approx(F.predilutionFactor(6300, 1000), 6300 / 7300, 1e-12, "DF = Qp/(Qp+Qpre) = 0.863");

{
  const d = F.crrtEffluentDose({
    weightKg: 80,
    qdMlH: 1000,
    qpreMlH: 1000,
    qpostMlH: 500,
    qnetMlH: 100,
    qbMlMin: 150,
    hct: 0.3,
  });
  approx(d.qeffMlH, 2600, 1e-12, "Qeff 2600 mL/h");
  approx(d.prescribedMlKgH, 32.5, 1e-12, "prescribed 32.5 mL/kg/h");
  // DF = 6300/(6300+1000) = 6300/7300; corrected = 2600 * DF / 80
  approx(d.df, 6300 / 7300, 1e-12, "DF");
  approx(d.correctedMlKgH, (2600 * 6300) / 7300 / 80, 1e-12, "predilution-corrected dose");
  approx(d.correctedMlKgH, 28.047945205479454, 1e-12, "corrected 28.05 mL/kg/h");

  const post = F.crrtEffluentDose({ weightKg: 80, qpostMlH: 2000, qnetMlH: 100 });
  approx(post.df, 1, 0, "post-dilution DF=1");
  approx(post.correctedMlKgH, 2100 / 80, 1e-12, "post-dilution dose 26.25");
}

{
  // 80 kg, target 25 → 2000 mL/h. Pure CVVHD, Qnet 100, Qd 1900.
  const d = F.crrtEffluentDose({ weightKg: 80, qdMlH: 1900, qnetMlH: 100 });
  approx(d.prescribedMlKgH, 25, 1e-12, "CVVHD prescribed 25 mL/kg/h");
  approx(d.correctedMlKgH, 25, 1e-12, "CVVHD no predilution, corrected = prescribed");
}

section("Filtration fraction (Neri Crit Care 2016; Mehta Blood Purif 2016)");
{
  const ff = F.filtrationFraction({
    qbMlMin: 150,
    hct: 0.3,
    qpreMlH: 1000,
    qpostMlH: 500,
    qnetMlH: 100,
    modality: "cvvhdf",
  });
  approx(ff.qufMlH, 1600, 1e-12, "Quf = Qpre+Qpost+Qnet = 1600");
  approx(ff.ffPostPct, (1600 / 6300) * 100, 1e-12, "post-style FF ~25.4%");
  approx(ff.ffPrePct, (1600 / 7300) * 100, 1e-12, "pre-dilution FF ~21.9%");
  approx(ff.ffUsedPct, ff.ffPrePct, 1e-12, "used FF is pre-style when Qpre > 0");
  const hd = F.filtrationFraction({ qbMlMin: 150, hct: 0.3, qnetMlH: 100, modality: "cvvhd" });
  approx(hd.qufMlH, 100, 1e-12, "CVVHD Quf is net UF only");
  approx(hd.ffUsedPct, (100 / 6300) * 100, 1e-12, "CVVHD used FF = Qnet/Qp");
}

section("Minimum Qb to keep FF at 25% (derived from FF equation)");
{
  // Post-dilution CVVH: Quf = 1900, Hct 0.3, FF 0.25, Qpre 0
  // Qb = (1900/0.25) / (60*0.7) = 7600/42
  const r = F.minQbForFf({ hct: 0.3, qpostMlH: 1800, qnetMlH: 100, modality: "cvvh-post" }, 0.25);
  approx(r.qbMlMin, 7600 / 42, 1e-12, "min Qb 180.95 mL/min for FF 25%");
  // Verify: at that Qb, FF is exactly 25%
  const ff = F.filtrationFraction({
    qbMlMin: r.qbMlMin,
    hct: 0.3,
    qpostMlH: 1800,
    qnetMlH: 100,
    modality: "cvvh",
  });
  approx(ff.ffUsed, 0.25, 1e-12, "FF at min Qb is exactly 25%");
}

section("Suggested prescription from target dose (KDIGO default 25 mL/kg/h)");
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 100,
    modality: "cvvh-post",
  });
  approx(s.qeffMlH, 2000, 1e-12, "Qeff = 25×80 = 2000");
  approx(s.qpostMlH, 1900, 1e-12, "CVVH post: remaining 1900 is replacement");
  approx(s.qpreMlH, 0, 1e-12, "no predilution");
  approx(s.qdMlH, 0, 1e-12, "no dialysate");
}
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 100,
    modality: "cvvh-pre",
  });
  approx(s.qpreMlH, 1900, 1e-12, "CVVH pre: 1900 predilution");
  approx(s.qpostMlH, 0, 1e-12, "no post");
}
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 100,
    modality: "cvvh-mixed",
    preFraction: 0.5,
  });
  approx(s.qpreMlH, 950, 1e-12, "mixed 50/50 Qpre");
  approx(s.qpostMlH, 950, 1e-12, "mixed 50/50 Qpost");
}
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 100,
    modality: "cvvhd",
  });
  approx(s.qdMlH, 1900, 1e-12, "CVVHD all remaining is dialysate");
}
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 100,
    modality: "cvvhdf",
    dialysateFraction: 0.5,
    preFraction: 0, // all replacement post
  });
  approx(s.qdMlH, 950, 1e-12, "CVVHDF 50% dialysate");
  approx(s.qpostMlH, 950, 1e-12, "CVVHDF remaining replacement post");
  approx(s.qpreMlH, 0, 1e-12, "no pre");
}
{
  const s = F.suggestCrrtPrescription({
    weightKg: 80,
    targetMlKgH: 25,
    qnetMlH: 2500,
    modality: "cvvh-post",
  });
  eq(s.netExceedsTarget, true, "net UF 2500 > target effluent 2000 is flagged");
}

section("Delivered dose with downtime (KDIGO 5.8.1 time-weighted approximation)");
{
  const d = F.deliveredDose(25, 10);
  approx(d.uptime, 0.9, 1e-12, "10% downtime → 90% uptime");
  approx(d.deliveredMlKgH, 22.5, 1e-12, "25 × 0.9 = 22.5 delivered");
  // 20% downtime on a 25 prescribed → 20 delivered, bottom of KDIGO range
  approx(F.deliveredDose(25, 20).deliveredMlKgH, 20, 1e-12, "25 × 0.8 = 20");
}
{
  const s = F.kdigoDoseStatus(22.5, 25);
  eq(s.deliveredStatus, "in-range", "22.5 is within 20–25 delivered");
  eq(s.prescribedStatus, "usual-prescription", "25 is in the 25–30 usual prescription range");
  eq(F.kdigoDoseStatus(19, 24).deliveredStatus, "below", "19 is below 20");
  eq(F.kdigoDoseStatus(19, 24).prescribedStatus, "below-usual-prescription", "24 is below 25–30");
  eq(F.kdigoDoseStatus(26, 32).deliveredStatus, "above", "26 is above 25");
  eq(F.kdigoDoseStatus(26, 32).prescribedStatus, "above-usual-prescription", "32 is above 30");
  eq(F.kdigoDoseStatus(20, 30).deliveredStatus, "in-range", "20 inclusive lower bound");
  eq(F.kdigoDoseStatus(25, 30).deliveredStatus, "in-range", "25 inclusive upper bound");
}

section("Net UF fluid-balance planner (mass balance)");
{
  // Intake 2500, other 0, desired balance −1000 → UF 3500 mL/day = 145.833… mL/h
  const p = F.netUfPlan({ intakeMlDay: 2500, otherLossMlDay: 0, desiredBalanceMlDay: -1000, downtimePct: 0 });
  approx(p.ufMlDay, 3500, 1e-12, "UF = intake − other − desired");
  approx(p.hourlyMlH, 3500 / 24, 1e-12, "hourly 24-h continuous");
  approx(p.hourlyRunningMlH, 3500 / 24, 1e-12, "no downtime, running = continuous");
}
{
  // 10% downtime: running hourly = 3500 / (24*0.9)
  const p = F.netUfPlan({ intakeMlDay: 2500, desiredBalanceMlDay: -1000, downtimePct: 10 });
  approx(p.hourlyRunningMlH, 3500 / 21.6, 1e-12, "running-time hourly adjusted for 10% downtime");
  approx(p.hourlyMlH, 3500 / 24, 1e-12, "unadjusted 24-h hourly still reported");
}
{
  // Desired zero balance, intake equals other losses → UF 0
  const p = F.netUfPlan({ intakeMlDay: 500, otherLossMlDay: 500, desiredBalanceMlDay: 0 });
  approx(p.ufMlDay, 0, 1e-12, "zero net UF when intake = other and desired 0");
  isTrue(!p.negativeUf, "not flagged negative");
}
{
  const p = F.netUfPlan({ intakeMlDay: 500, otherLossMlDay: 2000, desiredBalanceMlDay: 0 });
  isTrue(p.negativeUf, "negative required UF is flagged (would need fluid replacement)");
}

/* ── Citrate ─────────────────────────────────────────────────────────────── */
section("Citrate / calcium ratio (Meier-Kriesche CCM 2001; PMID 11373461)");
{
  // 10 mg/dL total = 2.5 mmol/L; iCa 1.0 mmol/L → ratio 2.5 (cutoff)
  const r = F.citrateCalciumRatio(10, "mg/dL", 1.0, "mmol/L");
  approx(r.ratio, 2.5, 1e-12, "total 10 mg/dL / iCa 1.0 mmol = 2.5");
  eq(r.status, "accumulation", "2.5 meets Meier-Kriesche cutoff");
  const same = F.citrateCalciumRatio(2.5, "mmol/L", 1.15, "mmol/L");
  approx(same.ratio, 2.5 / 1.15, 1e-12, "both mmol/L");
  eq(same.status, "ok", "2.17 is below 2.4 caution");
  const caut = F.citrateCalciumRatio(2.45, "mmol/L", 1.0, "mmol/L");
  eq(caut.status, "caution", "2.45 is ≥ 2.4 (Link 2012) and < 2.5");
  const ok = F.citrateCalciumRatio(2.0, "mmol/L", 1.0, "mmol/L");
  eq(ok.status, "ok", "2.0 is below both cuts");
  approx(F.convertCaToMmol(8, "mg/dL"), 2, 1e-12, "8 mg/dL = 2 mmol/L (÷ 4)");
}

section("Citrate infusion stoichiometry (Oudemans-van Straaten Crit Care 2012)");
{
  // Review Table / text: Qb 150, target 3 mmol/L, ACD-A 113 mmol/L
  // mmol/h = 150 × 60 × 3 / 1000 = 27
  // rate   = 150 × 60 × 3 / 113 = 27000/113
  const r = F.citrateInfusionRate({ qbMlMin: 150, targetMmolPerL: 3, solutionMmolPerL: 113 });
  approx(r.mmolH, 27, 1e-12, "27 mmol/h at 3 mmol/L and Qb 150");
  approx(r.rateMlH, 27000 / 113, 1e-12, "ACD-A rate 238.94 mL/h");
  // 4% TSC 136 mmol/L, target 4, Qb 150: mmol/h = 36; rate = 36000/136
  // (matches the review's worked example: Qb 150, target 4, citrate dose 36 mmol/h)
  const tsc = F.citrateInfusionRate({ qbMlMin: 150, targetMmolPerL: 4, solutionMmolPerL: 136 });
  approx(tsc.mmolH, 36, 1e-12, "36 mmol/h matches Oudemans review example");
  approx(tsc.rateMlH, 36000 / 136, 1e-12, "4% TSC rate");
  eq(F.TARGETS.ACD_A_MMOL, 113, "ACD-A 113 mmol/L from review Table 1");
  eq(F.TARGETS.TSC_4PCT_MMOL, 136, "4% TSC 136 mmol/L from review Table 1");
}

/* ── PD Kt/V and CrCl ────────────────────────────────────────────────────── */
section("PD weekly Kt/V (ISPD; Watson V)");
{
  // D/P urea 0.9, drain 10 L, V 35 L → weekly peritoneal Kt/V = 7×9 / 35 = 1.8
  // Urine 1 L, U/P urea 4 → renal 7×4 / 35 = 0.8; total 2.6
  const r = F.pdWeeklyKtv(0.9, 10, 35, 4, 1);
  approx(r.weeklyKtvPeritoneal, 1.8, 1e-12, "peritoneal Kt/V 1.8");
  approx(r.weeklyKtvRenal, 0.8, 1e-12, "renal Kt/V 0.8");
  approx(r.weeklyKtvTotal, 2.6, 1e-12, "total 2.6");
  approx(r.ktpDayL, 9, 1e-12, "daily peritoneal Kt 9 L");
}

section("PD drain volume and historical 1.7 drain reference");
{
  approx(F.pdDrainVolume(8, 1.2), 9.2, 1e-12, "instilled 8 L + UF 1.2 L");
  // Peritoneal target 1.7, V 35, D/P 0.9, no residual:
  // drain = 1.7×35 / (7×0.9) = 59.5 / 6.3
  const d = F.drainForWeeklyKtv(1.7, 35, 0.9);
  approx(d.drainL, (1.7 * 35) / (7 * 0.9), 1e-12, "drain for peritoneal 1.7");
  eq(d.alreadyMetByResidual, false, "not already met");
  // Residual already 1.8 → peritoneal target ≤ 0
  const met = F.drainForWeeklyKtv(1.7, 35, 0.9, 1.8);
  eq(met.alreadyMetByResidual, true, "residual 1.8 already exceeds 1.7");
  approx(met.drainL, 0, 1e-12, "no additional drain required for the historical figure");
}

section("PD weekly CrCl (Mosteller default, DuBois shown) and RKF mean");
{
  const r = F.pdWeeklyCrCl({
    dOverPCr: 0.7,
    drainVolumeL: 10,
    uOverPCr: 8,
    uOverPUrea: 4,
    urineVolumeL: 1,
    heightCm: 170,
    weightKg: 70,
    bsaMethod: "mosteller",
  });
  approx(r.peritonealLWeek, 49, 1e-12, "peritoneal CrCl 49 L/week");
  approx(r.renalCrLWeek, 56, 1e-12, "renal Ccr 56 L/week");
  approx(r.renalUreaLWeek, 28, 1e-12, "renal Curea 28 L/week");
  approx(r.rkfMeanLWeek, 42, 1e-12, "RKF mean 42 L/week");
  approx(r.totalLWeek, 91, 1e-12, "total 91 L/week");
  const expectedNorm = (91 * 1.73) / F.bsaMosteller(170, 70);
  approx(r.totalLWeek173, expectedNorm, 1e-12, "normalized to 1.73 with Mosteller");
  eq(r.bsaMethod, "Mosteller", "Mosteller is default and stated");
  const duboisNorm = (91 * 1.73) / F.bsaDuBois(170, 70);
  approx(r.totalLWeek173DuBois, duboisNorm, 1e-12, "DuBois-normalized also reported");
}
{
  // 24-h urine 1000 mL, U/P urea 4, U/P Cr 8
  // Curea = 4×1000/1440, Ccr = 8×1000/1440, mean = 6×1000/1440
  const r = F.residualKidneyFunction({
    urineMl: 1000,
    uOverPUrea: 4,
    uOverPCr: 8,
    heightCm: 170,
    weightKg: 70,
  });
  approx(r.cUreaMlMin, 4000 / 1440, 1e-12, "Curea mL/min");
  approx(r.cCrMlMin, 8000 / 1440, 1e-12, "Ccr mL/min");
  approx(r.meanMlMin, 6000 / 1440, 1e-12, "mean RKF mL/min");
  approx(r.lWeek, (6000 / 1440) * 10.08, 1e-12, "L/week = mL/min × 10.08");
}

section("ISPD 2020 / historical 1.7 guidance status");
{
  const a = F.ktvGuidanceStatus(1.8);
  eq(a.atOrAboveHistorical, true, "1.8 ≥ 1.7");
  eq(F.ktvGuidanceStatus(1.7).atOrAboveHistorical, true, "1.7 inclusive");
  eq(F.ktvGuidanceStatus(1.69).atOrAboveHistorical, false, "1.69 below historical figure");
  approx(F.TARGETS.HISTORICAL_KTV, 1.7, 0, "historical figure is 1.7 (ISPD 2006 / KDOQI 2006)");
}

/* ── PET ─────────────────────────────────────────────────────────────────── */
section("PET Twardowski 1987 categories and ratios");
{
  const ratios = F.petRatios(7, 10, 400, 1000);
  approx(ratios.dpCr, 0.7, 1e-12, "D/P Cr 0.70");
  approx(ratios.dd0, 0.4, 1e-12, "D/D0 0.40");
  const cat = F.petCategory(0.7, 0.4);
  eq(cat.crCategory, "High-average", "0.70 = high-average D/P Cr");
  eq(cat.glucoseCategory, "Low-average", "0.40 = low-average D/D0");
  eq(cat.discordant, true, "Cr HA vs glucose LA is flagged discordant");
  eq(F.petCategory(0.49).crCategory, "Low", "0.49 low");
  eq(F.petCategory(0.5).crCategory, "Low-average", "0.50 LA lower bound");
  eq(F.petCategory(0.64).crCategory, "Low-average", "0.64 LA");
  eq(F.petCategory(0.65).crCategory, "High-average", "0.65 HA");
  eq(F.petCategory(0.81).crCategory, "High-average", "0.81 HA");
  eq(F.petCategory(0.82).crCategory, "High", "0.82 high");
  eq(F.petCategory(null, 0.26).glucoseCategory, "High", "D/D0 0.26 high");
  eq(F.petCategory(null, 0.27).glucoseCategory, "High-average", "D/D0 0.27 HA");
  eq(F.petCategory(null, 0.38).glucoseCategory, "High-average", "D/D0 0.38 HA (0.38 vs 0.37 judgment)");
  eq(F.petCategory(null, 0.39).glucoseCategory, "Low-average", "D/D0 0.39 LA");
  eq(F.petCategory(null, 0.5).glucoseCategory, "Low", "D/D0 0.50 low");
  const concordant = F.petCategory(0.7, 0.3);
  eq(concordant.crCategory, "High-average", "0.70 HA");
  eq(concordant.glucoseCategory, "High-average", "0.30 HA");
  eq(concordant.discordant, false, "concordant HA");
}

section("ISPD 2021 PET UF screening (Morelle et al., GRADE 1B)");
{
  const low425 = F.petUfScreen(350, "4.25");
  eq(low425.lowUf, true, "<400 mL on 4.25% is low");
  eq(low425.thresholdMl, 400, "400 mL threshold");
  const ok425 = F.petUfScreen(400, "4.25");
  eq(ok425.lowUf, false, "400 mL is not below threshold");
  const low25 = F.petUfScreen(80, "2.5");
  eq(low25.lowUf, true, "<100 mL on 2.5% is low");
  eq(F.petUfScreen(100, "2.27").lowUf, false, "100 mL on 2.27% is not below");
  eq(F.petUfScreen(200, "1.5").applicable, false, "no ISPD threshold for 1.5% PET");
}

/* ── Exposure and PD fluid ───────────────────────────────────────────────── */
section("Instilled dextrose / icodextrin grams (labeled %, not absorption)");
{
  // 4 CAPD exchanges of 2 L 2.5% dextrose: 10 × 2.5 × 2 = 50 g each, 200 g/day
  approx(F.instilledGrams(2.5, 2), 50, 1e-12, "2 L of 2.5% = 50 g");
  approx(F.instilledGrams(1.5, 8), 120, 1e-12, "8 L of 1.5% = 120 g");
  approx(F.instilledGrams(4.25, 2), 85, 1e-12, "2 L of 4.25% = 85 g");
  // Icodextrin 7.5%, 2 L long dwell
  approx(F.instilledGrams(7.5, 2), 150, 1e-12, "2 L of 7.5% icodextrin = 150 g");
}

section("PD daily fluid balance (mass balance)");
{
  const b = F.pdFluidBalance({ intakeMlDay: 2000, pdUfMlDay: 800, urineMlDay: 500, otherLossMlDay: 0 });
  approx(b.outputMl, 1300, 1e-12, "UF + urine");
  approx(b.balanceMl, 700, 1e-12, "positive 700 mL");
  const neg = F.pdFluidBalance({ intakeMlDay: 1500, pdUfMlDay: 1200, urineMlDay: 600 });
  approx(neg.balanceMl, -300, 1e-12, "negative 300 mL");
}

/* ── Guard rails ─────────────────────────────────────────────────────────── */
section("Input guards");
throws(() => F.watsonTbw(50, 178, undefined, false), "Watson requires weight");
throws(() => F.crrtEffluentDose({ weightKg: 80, qpreMlH: 1000 }), "predilution needs Qb and Hct");
throws(() => F.citrateCalciumRatio(2.5, "mmol/L", 0, "mmol/L"), "iCa must be positive");
throws(() => F.deliveredDose(25, 110), "downtime > 100 throws");
throws(() => F.pdWeeklyKtv(0.9, 10, 0), "V must be positive");
throws(() => F.citrateInfusionRate({ qbMlMin: 150, targetMmolPerL: 3, solutionMmolPerL: 0 }), "solution conc > 0");

/* ── KDIGO numeric constants ─────────────────────────────────────────────── */
section("KDIGO 2012 numeric constants");
eq(F.TARGETS.KDIGO_DELIVERED_MIN, 20, "delivered min 20");
eq(F.TARGETS.KDIGO_DELIVERED_MAX, 25, "delivered max 25");
eq(F.TARGETS.KDIGO_PRESCRIBE_MIN, 25, "prescribe min 25");
eq(F.TARGETS.KDIGO_PRESCRIBE_MAX, 30, "prescribe max 30");
eq(F.TARGETS.DEFAULT_PRESCRIBE, 25, "default prescribed target 25");
eq(F.TARGETS.CITRATE_RATIO_CUTOFF, 2.5, "Meier-Kriesche 2.5");
eq(F.TARGETS.PET_UF_MIN_425, 400, "ISPD 2021 400 mL");
eq(F.TARGETS.PET_UF_MIN_25, 100, "ISPD 2021 100 mL");

/* ── summary ────────────────────────────────────────────────────────────── */
console.log("\n────────────────────────────────────────");
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("All tests passed.");
