/**
 * Tests for the plain-text CRRT / PD prescription generator.
 * Run: node tests/prescription.test.js
 * These tests check wording and formatting only. They do not re-compute formulas.
 */
"use strict";

const Rx = require("../js/prescription.js");

let passed = 0;
let failed = 0;
const failures = [];

function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else {
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

function includes(text, snippet, msg) {
  isTrue(typeof text === "string" && text.includes(snippet), msg + ` (looking for ${JSON.stringify(snippet)})`);
}

function excludes(text, snippet, msg) {
  isTrue(typeof text === "string" && !text.includes(snippet), msg + ` (should not contain ${JSON.stringify(snippet)})`);
}

function section(name) {
  console.log("\n· " + name);
}

const DATE = "November 13, 2026";
const FOOTER = "Draft – verify before use; clinical judgment required";

/* ── CRRT full order ─────────────────────────────────────────────────────── */
section("CRRT full order sheet");

const crrt = Rx.formatCrrtPrescription({
  date: DATE,
  weightKg: 80,
  modality: "cvvh-post",
  targetMlKgH: 25,
  qbMlMin: 150,
  qpreMlH: 0,
  qpostMlH: 1850,
  qdMlH: 0,
  qnetMlH: 150,
  anticoagulation: "citrate",
  citrateInfusionMlH: 239,
  citrateMmolH: 27,
  citrateSolution: "ACD-A 113 mmol/L",
  citrateTargetMmolPerL: 3,
  ffPct: 18.2,
  ffFlag: "",
  downtimeAdjustedMlKgH: 22.5,
});

eq(crrt.title, "CRRT PRESCRIPTION", "CRRT title");
eq(crrt.date, DATE, "injected date");
eq(crrt.footer, FOOTER, "footer constant");
includes(crrt.text, "CRRT PRESCRIPTION", "starts with title");
includes(crrt.text, "Wellness Tech LLC — CRRT & PD Dosing (draft)", "publisher line");
includes(crrt.text, "Date: November 13, 2026", "date line");
includes(crrt.text, "Patient: ________________", "blank patient name");
includes(crrt.text, "MRN: ________________", "blank MRN");
includes(crrt.text, "Weight: 80 kg", "weight");
includes(crrt.text, "Modality: CVVH (post-filter replacement)", "CVVH post label");
includes(crrt.text, "Target effluent dose: 25.0 mL/kg/h  (2,000 mL/h)", "target in both units");
includes(crrt.text, "Blood flow (Qb): 150 mL/min", "blood flow");
includes(crrt.text, "Replacement fluid: 1,850 mL/h", "total replacement");
includes(crrt.text, "Pre-filter:  0 mL/h", "pre split");
includes(crrt.text, "Post-filter: 1,850 mL/h", "post split");
includes(crrt.text, "Dialysate: 0 mL/h", "dialysate rate");
includes(crrt.text, "Net UF goal: 150 mL/h", "net UF");
includes(crrt.text, "Anticoagulation: Citrate", "citrate as entered");
includes(crrt.text, "Infusion rate: 239 mL/h", "citrate infusion");
includes(crrt.text, "Citrate dose: 27.0 mmol/h", "citrate mmol/h");
includes(crrt.text, "Solution: ACD-A 113 mmol/L", "solution label as provided");
includes(crrt.text, "Filtration fraction: 18.2%", "FF value");
excludes(crrt.text, "CAUTION", "no FF caution below 20%");
excludes(crrt.text, "WARNING", "no FF warning below 25%");
includes(crrt.text, "Downtime-adjusted prescribed dose: 22.5 mL/kg/h", "downtime-adjusted dose");
includes(crrt.text, "Fluid composition / bath (write in)", "bath header");
includes(crrt.text, "Replacement:  K ______    Ca ______    Bicarbonate ______", "blank replacement bath");
includes(crrt.text, "Dialysate:    K ______    Ca ______    Bicarbonate ______", "blank dialysate bath");
includes(crrt.text, "Monitoring labs: ________________________________", "blank labs");
includes(crrt.text, "Prescriber: ________________", "blank signature");
includes(crrt.text, "Date/time: ________________", "blank sign date");
includes(crrt.text, FOOTER, "required footer");
excludes(crrt.text, "github", "no GitHub URL");
excludes(crrt.text, "amarzon-tech", "no repo name");

/* target mL/h from weight × target when targetMlH omitted */
const targetOnly = Rx.formatCrrtPrescription({
  date: DATE,
  weightKg: 70,
  targetMlKgH: 25,
});
includes(targetOnly.text, "Target effluent dose: 25.0 mL/kg/h  (1,750 mL/h)", "target mL/h is weight × mL/kg/h");

/* ── modality labels ─────────────────────────────────────────────────────── */
section("CRRT modality labels");
eq(Rx.modalityOrderLabel("cvvh-pre"), "CVVH (pre-filter replacement)", "pre");
eq(Rx.modalityOrderLabel("cvvh-mixed"), "CVVH (mixed pre- and post-filter replacement)", "mixed");
eq(Rx.modalityOrderLabel("cvvhd"), "CVVHD", "CVVHD");
eq(Rx.modalityOrderLabel("cvvhdf"), "CVVHDF", "CVVHDF");

const hdf = Rx.formatCrrtPrescription({
  date: DATE,
  modality: "cvvhdf",
  qpreMlH: 500,
  qpostMlH: 500,
  qdMlH: 1000,
  qnetMlH: 100,
});
includes(hdf.text, "Modality: CVVHDF", "HDF modality on sheet");
includes(hdf.text, "Replacement fluid: 1,000 mL/h", "HDF replacement total");
includes(hdf.text, "Pre-filter:  500 mL/h", "HDF pre");
includes(hdf.text, "Post-filter: 500 mL/h", "HDF post");
includes(hdf.text, "Dialysate: 1,000 mL/h", "HDF dialysate");

/* ── filtration fraction flags ───────────────────────────────────────────── */
section("Filtration fraction caution flags");
const ffCaut = Rx.formatCrrtPrescription({ date: DATE, ffPct: 20, ffFlag: "caution" });
includes(ffCaut.text, "Filtration fraction: 20.0%  — CAUTION (≥ 20%)", "caution at 20%");
const ffWarn = Rx.formatCrrtPrescription({ date: DATE, ffPct: 26.4, ffFlag: "warning" });
includes(ffWarn.text, "Filtration fraction: 26.4%  — WARNING (≥ 25%)", "warning at 25%");

/* ── anticoagulation as entered; no invented default ─────────────────────── */
section("Anticoagulation as entered");
const acBlank = Rx.formatCrrtPrescription({ date: DATE });
includes(acBlank.text, "Anticoagulation: ________________", "unspecified is a blank write-in");
excludes(acBlank.text, "Anticoagulation: Citrate", "does not invent citrate");
excludes(acBlank.text, "Anticoagulation: Heparin", "does not invent heparin");
excludes(acBlank.text, "Anticoagulation: None", "does not invent none");
excludes(acBlank.text, "Infusion rate:", "no citrate rate when AC not entered");

const acNone = Rx.formatCrrtPrescription({ date: DATE, anticoagulation: "none" });
includes(acNone.text, "Anticoagulation: None", "none as entered");
excludes(acNone.text, "Dose: ________________", "no heparin blanks when none");

const acHep = Rx.formatCrrtPrescription({ date: DATE, anticoagulation: "heparin" });
includes(acHep.text, "Anticoagulation: Heparin", "heparin as entered");
includes(acHep.text, "  Dose: ________________", "heparin dose left blank (no input in the app)");
includes(acHep.text, "  Target PTT / anti-Xa: ________________", "heparin target left blank");

/* ── missing calculated values stay blank ────────────────────────────────── */
section("CRRT blanks when values are missing");
const empty = Rx.formatCrrtPrescription({ date: DATE });
includes(empty.text, "Weight: ________________", "blank weight");
includes(empty.text, "Modality: ________________", "blank modality");
includes(empty.text, "Target effluent dose: ________________", "blank target");
includes(empty.text, "Blood flow (Qb): ________________", "blank Qb");
includes(empty.text, "Downtime-adjusted prescribed dose: ________________", "blank delivered");
includes(empty.text, "Filtration fraction: ________________", "blank FF");
// Bath and labs are always write-in, never filled with invented numbers
isTrue((empty.text.match(/K ______/g) || []).length === 2, "two blank K lines");
excludes(empty.text, "K 4", "does not invent a K bath");
excludes(empty.text, "Bicarbonate 25", "does not invent a bicarbonate bath");

/* ── PD CAPD ─────────────────────────────────────────────────────────────── */
section("PD CAPD prescription");
const capd = Rx.formatPdPrescription({
  date: DATE,
  modality: "capd",
  exchanges: 4,
  fillL: 2,
  dwellH: 6,
  dextrosePct: 2.5,
  icodextrin: true,
  weeklyKtv: 2.1,
  weeklyCrClMosteller: 65.4,
});
eq(capd.title, "PD PRESCRIPTION", "PD title");
includes(capd.text, "Date: November 13, 2026", "PD date");
includes(capd.text, "Patient: ________________", "PD blank patient");
includes(capd.text, "MRN: ________________", "PD blank MRN");
includes(capd.text, "Modality: CAPD", "CAPD label");
includes(capd.text, "Exchanges: 4 /day", "exchange count");
includes(capd.text, "Fill volume: 2.0 L", "fill volume");
includes(capd.text, "Dwell: 6.0 h", "dwell");
includes(capd.text, "Dextrose: 2.5%", "dextrose percent");
includes(capd.text, "Icodextrin: 7.5%, 1 bag", "icodextrin as entered");
includes(capd.text, "Weekly Kt/V urea: 2.10", "weekly Kt/V");
includes(capd.text, "Weekly CrCl: 65 L/week/1.73 m² (Mosteller)", "weekly CrCl rounded");
includes(capd.text, "Prescriber: ________________", "PD signature");
includes(capd.text, FOOTER, "PD footer");
excludes(capd.text, "Night cycles", "CAPD sheet has no APD fields");
excludes(capd.text, "github", "PD has no GitHub URL");

const capdNoIco = Rx.formatPdPrescription({
  date: DATE,
  modality: "capd",
  icodextrin: false,
});
includes(capdNoIco.text, "Icodextrin: none", "icodextrin off as entered");

/* ── PD APD ──────────────────────────────────────────────────────────────── */
section("PD APD prescription");
const apd = Rx.formatPdPrescription({
  date: DATE,
  modality: "apd",
  totalVolumeL: 12,
  cycles: 5,
  nightFillL: 2,
  nightDwellH: 1.5,
  nightDextrosePct: 1.5,
  lastFillL: 2,
  dayDwellH: 14,
  icodextrin: true,
  weeklyKtv: 1.85,
  weeklyCrClMosteller: 58,
});
includes(apd.text, "Modality: APD", "APD label");
includes(apd.text, "Total volume (instilled): 12.0 L", "APD total volume");
includes(apd.text, "Night cycles: 5", "cycles");
includes(apd.text, "Night fill: 2.0 L", "night fill");
includes(apd.text, "Night dwell: 1.5 h", "night dwell");
includes(apd.text, "Night dextrose: 1.5%", "night dextrose");
includes(apd.text, "Last fill: 2.0 L", "last fill");
includes(apd.text, "Day dwell (last fill): 14.0 h", "day dwell");
includes(apd.text, "Last fill fluid: Icodextrin 7.5%", "APD icodextrin");
includes(apd.text, "Weekly Kt/V urea: 1.85", "APD Kt/V");
includes(apd.text, "Weekly CrCl: 58 L/week/1.73 m² (Mosteller)", "APD CrCl");
excludes(apd.text, "Exchanges:", "APD sheet has no CAPD exchange line");

const apdNoIco = Rx.formatPdPrescription({
  date: DATE,
  modality: "apd",
  icodextrin: false,
});
includes(apdNoIco.text, "Last fill fluid: not icodextrin", "APD last fill not ico");

/* ── PD missing clearances stay blank ────────────────────────────────────── */
section("PD blanks when clearances are missing");
const pdEmpty = Rx.formatPdPrescription({ date: DATE, modality: "capd" });
includes(pdEmpty.text, "Weekly Kt/V urea: ________________", "blank Kt/V");
includes(pdEmpty.text, "Weekly CrCl: ________________", "blank CrCl");
excludes(pdEmpty.text, "1.7", "does not invent a 1.7 Kt/V");

/* ── summary ────────────────────────────────────────────────────────────── */
console.log("\n────────────────────────────────────────");
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("All tests passed.");
