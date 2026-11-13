/**
 * CRRT & PD Dosing — pure formula implementations.
 * Every coefficient and target is taken from a cited primary source
 * (see CONTENT_REVIEW.md). No network, no storage. Inputs are not persisted.
 *
 * Works in the browser (global CrrtPdFormulas) and in Node (module.exports).
 *
 * Formula implementations for shared PD/CRRT math are kept consistent with
 * amarzon-tech/neph-toolbox (read-only reference); this file is standalone.
 */
(function (global) {
  "use strict";

  const CONV = {
    CA_MGDL_PER_MMOL: 4, // conventional: 1 mmol/L = 4 mg/dL (atomic mass 40.08)
  };

  /** Historical / guideline numeric references (cited; not rigid sole targets). */
  const TARGETS = {
    // KDIGO AKI 2012, recommendation 5.8.4 (Kidney Int Suppl. 2012;2:1-138):
    // deliver 20–25 mL/kg/h. Rationale: "in order to achieve a delivered dose
    // of 20–25 ml/kg/h, it is generally necessary to prescribe in the range of
    // 25–30 ml/kg/h, and to minimize interruptions in CRRT."
    KDIGO_DELIVERED_MIN: 20,
    KDIGO_DELIVERED_MAX: 25,
    KDIGO_PRESCRIBE_MIN: 25,
    KDIGO_PRESCRIBE_MAX: 30,
    DEFAULT_PRESCRIBE: 25,
    // Filtration-fraction caution: practice-based, not a KDIGO numeric target.
    // Mehta / Murugan Blood Purif 2016: FF > 0.25 associated with clotting risk.
    // Neri et al. Crit Care 2016: FF "ideally below 30%", concentration ratio 20–25%.
    FF_CAUTION: 0.2,
    FF_WARN: 0.25,
    // Meier-Kriesche et al. Crit Care Med. 2001;29:748-752. PMID 11373461.
    // Widely cited threshold: total/iCa ≥ 2.5 suggests citrate accumulation.
    // Later series also report 2.4 (Link et al., 2012). We use 2.5 as the
    // original Meier-Kriesche cutoff and flag 2.4 as an alternate published cut.
    CITRATE_RATIO_CUTOFF: 2.5,
    CITRATE_RATIO_ALT: 2.4,
    // Oudemans-van Straaten HM, Ostermann M. Crit Care. 2012;16:249.
    // doi:10.1186/cc11645  PMID 23216871
    // "targeting a citrate concentration in the filter of about 3 mmol/L";
    // worked examples in that review use 3–4 mmol/L blood flow.
    CITRATE_TARGET_DEFAULT: 3,
    CITRATE_TARGET_MIN: 3,
    CITRATE_TARGET_MAX: 4,
    // Common commercial citrate concentrations from the same review's Table 1:
    // ACD-A 113 mmol/L; 4% TSC 136 mmol/L.
    ACD_A_MMOL: 113,
    TSC_4PCT_MMOL: 136,
    // ISPD 2006 (Lo et al. Perit Dial Int. 2006;26:520-522) and KDOQI 2006:
    // total weekly Kt/V urea should not be below 1.7. ISPD 2020 no longer
    // treats this as a sole target (person-centred / goal-directed).
    HISTORICAL_KTV: 1.7,
    // ISPD 2021 (Morelle et al.): UF insufficiency screening on a 4-h PET.
    PET_UF_MIN_425: 400, // mL, 4.25% dextrose / 3.86% glucose
    PET_UF_MIN_25: 100, // mL, 2.5% dextrose / 2.27% glucose
    // Unfractionated heparin for CRRT. KDIGO AKI 2012 §5.3 does not recommend
    // a single numeric dose ("large variability"; "no firm recommendations").
    // Starting values below are the regimen used in the second of the two
    // RCTs KDIGO describes (Joannidis et al., Intensive Care Med. 2007;
    // 33:1571-1579, KDIGO ref. 616): bolus 30 U/kg then 7 U/kg/h, titrated
    // to aPTT 40–45 s. Joannidis & Oudemans-van Straaten, Crit Care. 2007;
    // 11:218, call 30 IU/kg then 5–10 IU/kg/h "a possible scheme" in patients
    // with normal coagulation, to be individualized.
    // The other KDIGO-cited RCT (Reeves et al., Crit Care Med. 1999;27:2224-2228,
    // ref. 620) used bolus 2000–5000 U then 10 U/kg/h, titrated to aPTT 70–80 s.
    // Those alternatives are shown in the UI; they are not the starting defaults.
    HEPARIN_BOLUS_IU_KG: 30,
    HEPARIN_INFUSION_IU_KG_H: 7,
    HEPARIN_INFUSION_RANGE_MIN: 5,
    HEPARIN_INFUSION_RANGE_MAX: 10,
    HEPARIN_APTT_LOW_SEC: 40,
    HEPARIN_APTT_HIGH_SEC: 45,
    HEPARIN_REEVES_BOLUS_MIN_U: 2000,
    HEPARIN_REEVES_BOLUS_MAX_U: 5000,
    HEPARIN_REEVES_INFUSION_IU_KG_H: 10,
    HEPARIN_REEVES_APTT_LOW_SEC: 70,
    HEPARIN_REEVES_APTT_HIGH_SEC: 80,
  };

  function isNum(x) {
    return typeof x === "number" && Number.isFinite(x);
  }

  function req(name, x) {
    if (!isNum(x)) throw new Error("Missing or invalid number: " + name);
    return x;
  }

  function convertCaToMmol(value, unit) {
    req("calcium", value);
    if (unit === "mg/dL" || unit === "mgdl") return value / CONV.CA_MGDL_PER_MMOL;
    return value;
  }

  function normalizeHct(hct) {
    req("Hct", hct);
    if (hct < 0 || hct >= 1) {
      if (hct >= 1 && hct < 100) return hct / 100;
      throw new Error("Hematocrit must be a fraction (0–1) or a percent (1–99)");
    }
    return hct;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * Anthropometrics (Watson V, Mosteller / DuBois BSA)
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Watson total body water (L) — urea distribution volume V for PD Kt/V.
   * Watson PE, Watson ID, Batt RD. Am J Clin Nutr. 1980;33:27-39.
   *   doi:10.1093/ajcn/33.1.27  PMID 6986753
   *   Male:   V = 2.447 − 0.09516×age + 0.1074×height_cm + 0.3362×weight_kg
   *   Female: V = −2.097 + 0.1069×height_cm + 0.2466×weight_kg
   *   (female formula has no age term, as published).
   * The male age coefficient 0.09516 is the published value (a circulated
   * variant uses 0.09156; we do not).
   */
  function watsonTbw(age, heightCm, weightKg, female) {
    req("height", heightCm);
    req("weight", weightKg);
    if (female) return -2.097 + 0.1069 * heightCm + 0.2466 * weightKg;
    req("age", age);
    return 2.447 - 0.09516 * age + 0.1074 * heightCm + 0.3362 * weightKg;
  }

  /**
   * Mosteller RD. N Engl J Med. 1987;317:1098. doi:10.1056/NEJM198710223171717
   *   BSA (m²) = √(height_cm × weight_kg / 3600)
   * Default for PD CrCl normalization (stated in the UI).
   */
  function bsaMosteller(heightCm, weightKg) {
    req("height", heightCm);
    req("weight", weightKg);
    return Math.sqrt((heightCm * weightKg) / 3600);
  }

  /**
   * Du Bois D, Du Bois EF. Arch Intern Med. 1916;17:863-871.
   *   BSA = 0.007184 × weight_kg^0.425 × height_cm^0.725
   * Reported alongside Mosteller for comparison.
   */
  function bsaDuBois(heightCm, weightKg) {
    req("height", heightCm);
    req("weight", weightKg);
    return 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * CRRT dose, predilution, filtration fraction
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Plasma flow (mL/h) from blood flow and hematocrit.
   * Qp = Qb_mL/min × 60 × (1 − Hct)
   * We do not apply a further 0.93 plasma-water factor (judgment; stated).
   * Neri M et al. Crit Care. 2016;20:318. doi:10.1186/s13054-016-1489-9
   */
  function plasmaFlowMlH(qbMlMin, hct) {
    req("Qb", qbMlMin);
    hct = normalizeHct(hct);
    return qbMlMin * 60 * (1 - hct);
  }

  /**
   * Predilution dilution factor.
   * DF = Qp / (Qp + Qpre)
   * Effective effluent for urea (sieving coefficient ≈ 1) ≈ Qeff × DF.
   * Macedo E, Mehta RL. Continuous dialysis therapies: Core Curriculum 2016.
   *   Am J Kidney Dis. 2016;68:645-661. doi:10.1053/j.ajkd.2016.03.427
   * Also discussed in KDIGO AKI 2012 (predilution reduces actual dose vs effluent).
   */
  function predilutionFactor(qpMlH, qpreMlH) {
    req("Qp", qpMlH);
    const qpre = isNum(qpreMlH) ? qpreMlH : 0;
    if (qpMlH + qpre <= 0) throw new Error("Plasma + predilution flow must be positive");
    return qpMlH / (qpMlH + qpre);
  }

  /**
   * Prescribed and predilution-corrected effluent dose (mL/kg/h).
   * Qeff = Qd + Qr_pre + Qr_post + Qnet   (all mL/h)
   * Dose_prescribed = Qeff / weight
   * Dose_corrected  = (Qeff × DF) / weight    (DF = 1 if Qpre = 0)
   *
   * KDIGO AKI 2012, recommendation 5.8.4 (not 5.8.3, which is intermittent Kt/V):
   *   "We recommend delivering an effluent volume of 20–25 ml/kg/h for CRRT
   *    in AKI (1A). This will usually require a higher prescription of effluent
   *    volume." Evidence: ATN (Palevsky et al., NEJM 2008;359:7-20) and
   *    RENAL (Bellomo et al., NEJM 2009;361:1627-1638).
   */
  function crrtEffluentDose(opts) {
    const wt = req("weight", opts.weightKg);
    if (wt <= 0) throw new Error("Weight must be positive");
    const qd = opts.qdMlH || 0;
    const qpre = opts.qpreMlH || 0;
    const qpost = opts.qpostMlH || 0;
    const qnet = opts.qnetMlH || 0;
    const qeff = qd + qpre + qpost + qnet;
    let df = 1;
    let qp = null;
    if (qpre > 0) {
      const qb = req("Qb (required for predilution correction)", opts.qbMlMin);
      const hct = req("Hct (required for predilution correction)", opts.hct);
      qp = plasmaFlowMlH(qb, hct);
      df = predilutionFactor(qp, qpre);
    }
    return {
      qeffMlH: qeff,
      df,
      qpMlH: qp,
      prescribedMlKgH: qeff / wt,
      correctedMlKgH: (qeff * df) / wt,
    };
  }

  /**
   * Filtration fraction.
   * Quf (convective ultrafiltration) = Qpre + Qpost + Qnet
   *   For pure CVVHD, Quf = Qnet only (dialysate is not ultrafiltrate).
   * Post-style FF = Quf / Qp
   * Pre-dilution FF = Quf / (Qp + Qpre)
   *
   * Equations: Neri M et al. Crit Care. 2016;20:318.
   *   doi:10.1186/s13054-016-1489-9
   * Caution 20–25% is practice-based (Murugan / Mehta, Blood Purif. 2016;
   *   doi:10.1159/000448528 — FF > 0.25 associated with clotting risk),
   *   not a KDIGO numeric target. Neri distinguishes FF (ideally < 30%)
   *   from concentration ratio (keep < 20–25%). Stated as a judgment.
   */
  function filtrationFraction(opts) {
    const qb = req("Qb", opts.qbMlMin);
    const hct = req("Hct", opts.hct);
    const qp = plasmaFlowMlH(qb, hct);
    const qpre = opts.qpreMlH || 0;
    const qpost = opts.qpostMlH || 0;
    const qnet = opts.qnetMlH || 0;
    const modality = opts.modality || "cvvh";
    const quf = modality === "cvvhd" ? qnet : qpre + qpost + qnet;
    const ffPost = qp > 0 ? quf / qp : Infinity;
    const ffPre = qp + qpre > 0 ? quf / (qp + qpre) : Infinity;
    // The clinically used FF for warning is the pre-style when predilution
    // is present (replacement is added to the denominator); otherwise post-style.
    const ffUsed = qpre > 0 ? ffPre : ffPost;
    return {
      qpMlH: qp,
      qufMlH: quf,
      ffPost,
      ffPre,
      ffUsed,
      ffPostPct: ffPost * 100,
      ffPrePct: ffPre * 100,
      ffUsedPct: ffUsed * 100,
    };
  }

  /**
   * Minimum blood flow (mL/min) to keep the used FF at or below a threshold.
   * Derived from the FF equations above, not a separate published coefficient.
   *   FF = Quf / (Qp + Qpre)   [or Quf / Qp if Qpre = 0]
   *   Qp = Qb × 60 × (1 − Hct)
   *   Qb = (Quf / FF − Qpre) / (60 × (1 − Hct))
   * For CVVHD, Quf is net UF only.
   */
  function minQbForFf(opts, ffThreshold) {
    const ff = isNum(ffThreshold) ? ffThreshold : TARGETS.FF_WARN;
    if (ff <= 0 || ff >= 1) throw new Error("FF threshold must be between 0 and 1");
    const hct = normalizeHct(req("Hct", opts.hct));
    const qpre = opts.qpreMlH || 0;
    const qpost = opts.qpostMlH || 0;
    const qnet = opts.qnetMlH || 0;
    const modality = opts.modality || "cvvh";
    const quf = modality === "cvvhd" ? qnet : qpre + qpost + qnet;
    const denom = 60 * (1 - hct);
    if (denom <= 0) throw new Error("Hematocrit too high for plasma-flow calculation");
    const qb = (quf / ff - qpre) / denom;
    return { qbMlMin: qb, qufMlH: quf, ffThreshold: ff };
  }

  /**
   * Suggested effluent / replacement / dialysate rates from a target dose.
   * Qeff = target_mL/kg/h × weight_kg
   * Qnet is taken from the fluid-balance planner (or entered).
   * Remaining effluent (Qeff − Qnet) is split by modality:
   *   CVVH post:  all remaining → Qpost
   *   CVVH pre:   all remaining → Qpre
   *   CVVH mixed: remaining × preFraction → Qpre, rest → Qpost
   *   CVVHD:      all remaining → Qd
   *   CVVHDF:     remaining × dialysateFraction → Qd; the rest is replacement,
   *               then split by preFraction.
   * preFraction and dialysateFraction are starting splits for the clinician
   * to adjust — they are NOT guideline targets.
   */
  function suggestCrrtPrescription(opts) {
    const wt = req("weight", opts.weightKg);
    const target = req("target dose", opts.targetMlKgH);
    if (wt <= 0 || target <= 0) throw new Error("Weight and target dose must be positive");
    const qnet = isNum(opts.qnetMlH) ? opts.qnetMlH : 0;
    const qeff = target * wt;
    const remaining = qeff - qnet;
    const modality = opts.modality || "cvvh-post";
    const preFrac = isNum(opts.preFraction) ? opts.preFraction : 0.5;
    const dFrac = isNum(opts.dialysateFraction) ? opts.dialysateFraction : 0.5;
    if (preFrac < 0 || preFrac > 1) throw new Error("preFraction must be 0–1");
    if (dFrac < 0 || dFrac > 1) throw new Error("dialysateFraction must be 0–1");

    let qd = 0;
    let qpre = 0;
    let qpost = 0;
    let netExceeds = remaining < 0;

    if (!netExceeds) {
      switch (modality) {
        case "cvvh-pre":
          qpre = remaining;
          break;
        case "cvvh-post":
          qpost = remaining;
          break;
        case "cvvh-mixed":
          qpre = remaining * preFrac;
          qpost = remaining * (1 - preFrac);
          break;
        case "cvvhd":
          qd = remaining;
          break;
        case "cvvhdf": {
          qd = remaining * dFrac;
          const qrep = remaining * (1 - dFrac);
          qpre = qrep * preFrac;
          qpost = qrep * (1 - preFrac);
          break;
        }
        default:
          throw new Error("Unknown modality: " + modality);
      }
    }

    return {
      modality,
      qeffMlH: qeff,
      qdMlH: qd,
      qpreMlH: qpre,
      qpostMlH: qpost,
      qnetMlH: qnet,
      remainingMlH: remaining,
      netExceedsTarget: netExceeds,
      preFraction: preFrac,
      dialysateFraction: dFrac,
    };
  }

  /**
   * Delivered dose accounting for downtime.
   * delivered = (predilution-corrected prescribed dose) × (1 − downtime_fraction)
   *
   * This is a time-weighted effluent, the usual clinical approximation.
   * KDIGO 5.8.1 recommends frequent assessment of the actual delivered dose;
   * the rationale notes that interruptions reduce delivery, and that filter
   * efficiency also declines (we do not invent a filter-efficiency coefficient).
   */
  function deliveredDose(correctedMlKgH, downtimePct) {
    const dose = req("corrected dose", correctedMlKgH);
    const dt = isNum(downtimePct) ? downtimePct : 0;
    if (dt < 0 || dt > 100) throw new Error("Downtime must be 0–100%");
    const uptime = 1 - dt / 100;
    return { uptime, downtimePct: dt, deliveredMlKgH: dose * uptime };
  }

  /**
   * Classify a dose against KDIGO 2012 delivered and prescribed ranges.
   * Status is informational, not a treatment recommendation.
   */
  function kdigoDoseStatus(deliveredMlKgH, prescribedMlKgH) {
    const d = isNum(deliveredMlKgH) ? deliveredMlKgH : null;
    const p = isNum(prescribedMlKgH) ? prescribedMlKgH : null;
    let deliveredStatus = null;
    if (d !== null) {
      if (d < TARGETS.KDIGO_DELIVERED_MIN) deliveredStatus = "below";
      else if (d <= TARGETS.KDIGO_DELIVERED_MAX) deliveredStatus = "in-range";
      else deliveredStatus = "above";
    }
    let prescribedStatus = null;
    if (p !== null) {
      if (p < TARGETS.KDIGO_PRESCRIBE_MIN) prescribedStatus = "below-usual-prescription";
      else if (p <= TARGETS.KDIGO_PRESCRIBE_MAX) prescribedStatus = "usual-prescription";
      else prescribedStatus = "above-usual-prescription";
    }
    return { deliveredStatus, prescribedStatus };
  }

  /**
   * Net UF / fluid-balance planner.
   * 24-h fluid balance = intake − (net UF + other losses)
   * ⇒ required 24-h net UF = intake − other losses − desired balance.
   * Hourly rate assuming continuous 24-h therapy: daily / 24.
   * If expected downtime is entered, the running-time hourly rate is
   * daily / (24 × uptime), so the 24-h total is still achieved.
   * These are mass-balance identities, not a published coefficient.
   */
  function netUfPlan(opts) {
    const intake = isNum(opts.intakeMlDay) ? opts.intakeMlDay : 0;
    const other = isNum(opts.otherLossMlDay) ? opts.otherLossMlDay : 0;
    const desired = isNum(opts.desiredBalanceMlDay) ? opts.desiredBalanceMlDay : 0;
    const dt = isNum(opts.downtimePct) ? opts.downtimePct : 0;
    if (dt < 0 || dt > 100) throw new Error("Downtime must be 0–100%");
    const ufDay = intake - other - desired;
    const hourly24 = ufDay / 24;
    const uptimeHours = 24 * (1 - dt / 100);
    const hourlyRunning = uptimeHours > 0 ? ufDay / uptimeHours : Infinity;
    return {
      ufMlDay: ufDay,
      hourlyMlH: hourly24,
      hourlyRunningMlH: hourlyRunning,
      uptimeHours,
      negativeUf: ufDay < 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * Citrate anticoagulation helpers
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Total / ionized calcium ratio for citrate accumulation on RCA.
   * Both concentrations converted to mmol/L (total Ca in mg/dL ÷ 4).
   * Meier-Kriesche HU, Gitomer J, Finkel K, DuBose T.
   *   Crit Care Med. 2001;29:748-752. PMID 11373461
   *   Ratio ≥ 2.5 is the widely cited cutoff suggesting citrate accumulation.
   * Link A et al. (Crit Care. 2012, PMID 22643456) reported ≥ 2.4 as a
   * mortality-associated threshold; we display 2.5 as the primary cutoff
   * and mention 2.4 as an alternate published value.
   */
  function citrateCalciumRatio(totalCa, totalUnit, ica, icaUnit) {
    const totalMmol = convertCaToMmol(totalCa, totalUnit || "mmol/L");
    const icaMmol = convertCaToMmol(ica, icaUnit || "mmol/L");
    if (icaMmol <= 0) throw new Error("Ionized calcium must be positive");
    const ratio = totalMmol / icaMmol;
    let status = "ok";
    if (ratio >= TARGETS.CITRATE_RATIO_CUTOFF) status = "accumulation";
    else if (ratio >= TARGETS.CITRATE_RATIO_ALT) status = "caution";
    return { ratio, totalMmol, icaMmol, status };
  }

  /**
   * Citrate infusion rate from a target citrate-in-blood concentration.
   * Stoichiometry (not a fitted coefficient):
   *   citrate mmol/h = Qb_mL/min × 60/1000 × target_mmol_per_L_blood
   *   rate mL/h      = (citrate mmol/h) / (solution mmol/L) × 1000
   *                  = Qb × 60 × target / solution_mmol_L
   *
   * Target of about 3 mmol/L blood (examples 3–4) from
   * Oudemans-van Straaten HM, Ostermann M. Crit Care. 2012;16:249.
   *   doi:10.1186/cc11645  PMID 23216871
   * This is a starting-ratio helper only. Protocols titrate to post-filter
   * ionized calcium; we do not recommend a specific protocol or calcium
   * replacement rate.
   */
  function citrateInfusionRate(opts) {
    const qb = req("Qb", opts.qbMlMin);
    const target = req("target citrate", opts.targetMmolPerL);
    const sol = req("solution concentration", opts.solutionMmolPerL);
    if (qb <= 0 || target <= 0 || sol <= 0) {
      throw new Error("Qb, target and solution concentration must be positive");
    }
    const mmolH = (qb * 60 * target) / 1000;
    const rateMlH = (qb * 60 * target) / sol;
    return { mmolH, rateMlH, targetMmolPerL: target, solutionMmolPerL: sol, qbMlMin: qb };
  }


  /**
   * Unfractionated heparin bolus in units from weight and a units/kg dose.
   * Arithmetic only. Starting 30 IU/kg is the Joannidis 2007 ICM / KDIGO
   * §5.3-described regimen, not a KDIGO numeric recommendation.
   * Pass giveBolus=false for a no-bolus prescription (bolusUnits = 0).
   */
  function heparinBolus(opts) {
    const give = opts && opts.giveBolus !== false && opts.giveBolus !== 0;
    if (!give) {
      return { given: false, bolusIuPerKg: 0, bolusUnits: 0, weightKg: opts && opts.weightKg };
    }
    const w = req("weight", opts.weightKg);
    const iuKg = req("bolus IU/kg", opts.bolusIuPerKg);
    if (w <= 0) throw new Error("weight must be positive");
    if (iuKg < 0) throw new Error("bolus IU/kg cannot be negative");
    return {
      given: true,
      weightKg: w,
      bolusIuPerKg: iuKg,
      bolusUnits: w * iuKg,
    };
  }

  /**
   * Pre-filter unfractionated heparin infusion.
   * Supply either rateIuPerKgH (with weight) or an absolute rateUnitsH.
   * If concentrationUnitsPerMl is provided, also return rateMlH.
   * Concentration has no cited default and may be omitted.
   */
  function heparinInfusion(opts) {
    opts = opts || {};
    let rateUnitsH = null;
    let rateIuPerKgH = null;
    const w = isNum(opts.weightKg) ? opts.weightKg : null;
    if (isNum(opts.rateUnitsH)) {
      if (opts.rateUnitsH < 0) throw new Error("infusion rate cannot be negative");
      rateUnitsH = opts.rateUnitsH;
      if (w && w > 0) rateIuPerKgH = rateUnitsH / w;
    } else {
      const iuKgH = req("infusion IU/kg/h", opts.rateIuPerKgH);
      const wt = req("weight", opts.weightKg);
      if (wt <= 0) throw new Error("weight must be positive");
      if (iuKgH < 0) throw new Error("infusion IU/kg/h cannot be negative");
      rateIuPerKgH = iuKgH;
      rateUnitsH = wt * iuKgH;
    }
    let rateMlH = null;
    const conc = opts.concentrationUnitsPerMl;
    if (isNum(conc)) {
      if (conc <= 0) throw new Error("heparin concentration must be positive");
      rateMlH = rateUnitsH / conc;
    }
    return {
      weightKg: w,
      rateIuPerKgH,
      rateUnitsH,
      concentrationUnitsPerMl: isNum(conc) ? conc : null,
      rateMlH,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * PD weekly Kt/V and CrCl
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Weekly peritoneal + renal Kt/V urea.
   * Peritoneal daily Kt (L) = (Durea / Purea) × 24-h drain volume (L)
   * Renal daily Kt (L)     = (Uurea / Purea) × 24-h urine volume (L)
   * Weekly Kt/V = 7 × (Ktp + Ktr) / V
   * V typically Watson TBW (ISPD / KDOQI PD adequacy practice).
   *
   * ISPD 2020: Brown EA, Blake PG, et al. Perit Dial Int. 2020;40(3):244-253.
   *   doi:10.1177/0896860819895364
   *   Person-centred, goal-directed prescribing. "There is no specific clearance
   *   target that guarantees sufficient dialysis." Increasing Kt/V > 1.7 may
   *   improve uraemia-related symptoms, but if symptoms, nutrition and volume
   *   are controlled, no prescription change is needed solely to reach an
   *   arbitrary target.
   * Historical minimum 1.7: Lo WK et al. ISPD guideline. Perit Dial Int.
   *   2006;26:520-522. doi:10.1177/089686080602600502
   *   and KDOQI PD Adequacy 2006 (Am J Kidney Dis. 2006;48 suppl 1).
   *
   * For a prescription PLAN (estimated, not measured): drain volume is
   * instilled volume + net UF. D/P urea should come from a 24-h collection
   * on the actual prescription. Using a 4-h PET D/P for short APD cycles
   * overestimates clearance — flagged in the UI, not adjusted by an
   * invented dwell-time model.
   */
  function pdWeeklyKtv(dOverPUrea, drainVolumeL, vL, uOverPUrea, urineVolumeL) {
    req("D/P urea", dOverPUrea);
    req("drain volume", drainVolumeL);
    req("V", vL);
    if (vL <= 0) throw new Error("V must be positive");
    const ktpDay = dOverPUrea * drainVolumeL;
    const ktrDay = isNum(uOverPUrea) && isNum(urineVolumeL) ? uOverPUrea * urineVolumeL : 0;
    const weeklyKtvP = (7 * ktpDay) / vL;
    const weeklyKtvR = (7 * ktrDay) / vL;
    return {
      ktpDayL: ktpDay,
      ktrDayL: ktrDay,
      weeklyKtvPeritoneal: weeklyKtvP,
      weeklyKtvRenal: weeklyKtvR,
      weeklyKtvTotal: weeklyKtvP + weeklyKtvR,
    };
  }

  /**
   * 24-h drain volume from a prescription: instilled + net ultrafiltration.
   * Mass balance; net UF may be measured or estimated.
   */
  function pdDrainVolume(instilledL, netUfL) {
    req("instilled volume", instilledL);
    const uf = isNum(netUfL) ? netUfL : 0;
    return instilledL + uf;
  }

  /**
   * Drain volume that would yield a stated weekly peritoneal Kt/V
   * (rearrangement of the weekly Kt/V equation), used only as a historical
   * 1.7 reference, not a prescription target.
   *   drain_L = (weeklyKtV × V) / (7 × D/P urea)
   * Residual renal Kt/V is subtracted from the target first if provided.
   */
  function drainForWeeklyKtv(weeklyKtvTarget, vL, dOverPUrea, renalWeeklyKtv) {
    const target = req("Kt/V target", weeklyKtvTarget);
    req("V", vL);
    req("D/P urea", dOverPUrea);
    if (vL <= 0 || dOverPUrea <= 0) throw new Error("V and D/P urea must be positive");
    const renal = isNum(renalWeeklyKtv) ? renalWeeklyKtv : 0;
    const peritonealTarget = target - renal;
    if (peritonealTarget <= 0) {
      return { peritonealTarget, drainL: 0, alreadyMetByResidual: true };
    }
    return {
      peritonealTarget,
      drainL: (peritonealTarget * vL) / (7 * dOverPUrea),
      alreadyMetByResidual: false,
    };
  }

  /**
   * Weekly creatinine clearance (L/week/1.73 m²).
   * Peritoneal CrCl (L/week) = (Dcr/Pcr) × 24-h drain volume (L) × 7
   * Renal CrCl (L/week)      = (Ucr/Pcr) × 24-h urine volume (L) × 7
   * Residual kidney function is the MEAN of urea and creatinine clearance
   * (ISPD / KDOQI PD adequacy practice; avoids overestimating Ccr from
   * tubular secretion):
   *   RKF (L/week) = 0.5 × (Curea + Ccr)_renal × 7
   * Normalize: × 1.73 / BSA. Mosteller default; DuBois also reported.
   */
  function pdWeeklyCrCl(opts) {
    const dOverPCr = req("D/P Cr", opts.dOverPCr);
    const drainL = req("drain volume", opts.drainVolumeL);
    const peritonealLWeek = dOverPCr * drainL * 7;
    let renalCrLWeek = 0;
    let renalUreaLWeek = 0;
    if (isNum(opts.uOverPCr) && isNum(opts.urineVolumeL)) {
      renalCrLWeek = opts.uOverPCr * opts.urineVolumeL * 7;
    }
    if (isNum(opts.uOverPUrea) && isNum(opts.urineVolumeL)) {
      renalUreaLWeek = opts.uOverPUrea * opts.urineVolumeL * 7;
    }
    const rkfMeanLWeek = renalCrLWeek || renalUreaLWeek ? 0.5 * (renalCrLWeek + renalUreaLWeek) : 0;
    const totalLWeek = peritonealLWeek + rkfMeanLWeek;
    let bsa = null;
    let bsaDubois = null;
    let method = null;
    if (isNum(opts.heightCm) && isNum(opts.weightKg)) {
      method = opts.bsaMethod === "dubois" ? "DuBois" : "Mosteller";
      bsa = method === "DuBois" ? bsaDuBois(opts.heightCm, opts.weightKg) : bsaMosteller(opts.heightCm, opts.weightKg);
      bsaDubois = bsaDuBois(opts.heightCm, opts.weightKg);
    }
    const bsaMost = isNum(opts.heightCm) && isNum(opts.weightKg)
      ? bsaMosteller(opts.heightCm, opts.weightKg)
      : null;
    const norm = (x, s) => (s ? (x * 1.73) / s : x);
    return {
      peritonealLWeek,
      renalCrLWeek,
      renalUreaLWeek,
      rkfMeanLWeek,
      totalLWeek,
      bsa,
      bsaMosteller: bsaMost,
      bsaDuBois: bsaDubois,
      bsaMethod: method,
      peritonealLWeek173: norm(peritonealLWeek, bsa),
      rkfMeanLWeek173: norm(rkfMeanLWeek, bsa),
      totalLWeek173: norm(totalLWeek, bsa),
      totalLWeek173Mosteller: norm(totalLWeek, bsaMost),
      totalLWeek173DuBois: norm(totalLWeek, bsaDubois),
    };
  }

  /**
   * Residual kidney function as the mean of urea and creatinine clearance.
   * C (mL/min) = 0.5 × [(Uurea/Purea)×Vurine/t + (Ucr/Pcr)×Vurine/t]
   * For a 24-h collection, t = 1440 min, V in mL.
   * L/week = C_mL/min × 10.08     (because 1440 × 7 / 1000 = 10.08)
   * L/week/1.73 m² = L/week × 1.73 / BSA
   */
  function residualKidneyFunction(opts) {
    const urineMl = req("urine volume", opts.urineMl);
    const minutes = isNum(opts.minutes) ? opts.minutes : 1440;
    const uOverPUrea = req("U/P urea", opts.uOverPUrea);
    const uOverPCr = req("U/P Cr", opts.uOverPCr);
    if (minutes <= 0) throw new Error("Collection time must be positive");
    const cUrea = (uOverPUrea * urineMl) / minutes;
    const cCr = (uOverPCr * urineMl) / minutes;
    const mean = 0.5 * (cUrea + cCr);
    let bsa = null;
    if (isNum(opts.heightCm) && isNum(opts.weightKg)) {
      bsa = opts.bsaMethod === "dubois"
        ? bsaDuBois(opts.heightCm, opts.weightKg)
        : bsaMosteller(opts.heightCm, opts.weightKg);
    }
    const lWeek = mean * (minutes === 1440 ? 10.08 : (minutes * 7) / 1000);
    // 10.08 is exact for 24 h: (1440 min × 7 days) / 1000 mL/L = 10.08
    const lWeek173 = bsa ? (lWeek * 1.73) / bsa : null;
    return { cUreaMlMin: cUrea, cCrMlMin: cCr, meanMlMin: mean, lWeek, lWeek173, bsa };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * PET
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * PET — 4-hour D/P creatinine and D/D0 glucose, Twardowski categories.
   * Twardowski ZJ, Nolph KD, Khanna R, et al. Peritoneal equilibration test.
   *   Perit Dial Bull. 1987;7:138-147.
   *
   * 4-h D/P creatinine (classic Twardowski mean ± SD bands, as widely taught):
   *   Low          0.34–0.49
   *   Low-average  0.50–0.64
   *   High-average 0.65–0.81
   *   High         0.82–1.03
   * Values below 0.34 or above 1.03 are reported as low or high with a note.
   *
   * 4-h D/D0 glucose (inverse; high transporters have low D/D0):
   *   High         0.12–0.26
   *   High-average 0.27–0.38
   *   Low-average  0.39–0.49
   *   Low          0.50–0.61
   * A 0.38 vs 0.37 HA/LA D/D0 boundary varies by 0.01 in some lab manuals —
   * we use 0.38 as the top of HA (same judgment as the Nephrology Toolbox).
   *
   * Classification is primarily by 4-h D/P creatinine; D/D0 is supportive.
   * ISPD 2021 (Morelle J et al. Perit Dial Int. 2021.
   *   doi:10.1177/0896860820982218  PMID 33563110) recommends determining
   * PSTR from a 4-h PET (2.5%/2.27% or 4.25%/3.86% dextrose/glucose) and
   * interpreting relative to the local laboratory / centre distribution
   * rather than treating these historical bands as universal.
   */
  function petCategory(dpCr4h, dd0Glucose) {
    let crCat = null;
    let crNote = null;
    if (isNum(dpCr4h)) {
      if (dpCr4h < 0.34) {
        crCat = "Low";
        crNote = "Below the classic Twardowski low band (0.34–0.49); reported as low.";
      } else if (dpCr4h < 0.5) crCat = "Low";
      else if (dpCr4h < 0.65) crCat = "Low-average";
      else if (dpCr4h < 0.82) crCat = "High-average";
      else {
        crCat = "High";
        if (dpCr4h > 1.03) crNote = "Above the classic Twardowski high band (0.82–1.03); reported as high.";
      }
    }
    let gluCat = null;
    let gluNote = null;
    if (isNum(dd0Glucose)) {
      if (dd0Glucose < 0.12) {
        gluCat = "High";
        gluNote = "Below the classic high-transporter D/D0 band (0.12–0.26).";
      } else if (dd0Glucose <= 0.26) gluCat = "High";
      else if (dd0Glucose <= 0.38) gluCat = "High-average";
      else if (dd0Glucose <= 0.49) gluCat = "Low-average";
      else {
        gluCat = "Low";
        if (dd0Glucose > 0.61) gluNote = "Above the classic low-transporter D/D0 band (0.50–0.61).";
      }
    }
    let discordant = false;
    if (crCat && gluCat && crCat !== gluCat) discordant = true;
    return {
      dpCr4h,
      dd0Glucose,
      crCategory: crCat,
      crNote,
      glucoseCategory: gluCat,
      gluNote,
      discordant,
    };
  }

  function petRatios(dialysateCr, plasmaCr, dialysateGlu4h, dialysateGlu0) {
    const out = {};
    if (isNum(dialysateCr) && isNum(plasmaCr) && plasmaCr > 0) out.dpCr = dialysateCr / plasmaCr;
    if (isNum(dialysateGlu4h) && isNum(dialysateGlu0) && dialysateGlu0 > 0) {
      out.dd0 = dialysateGlu4h / dialysateGlu0;
    }
    return out;
  }

  /**
   * ISPD 2021 PET UF screening thresholds (Morelle et al., GRADE 1B):
   * insufficient UF suspected when 4-h net UF is
   *   < 400 mL on 4.25% dextrose / 3.86% glucose, or
   *   < 100 mL on 2.5% dextrose / 2.27% glucose.
   */
  function petUfScreen(netUfMl, dextroseLabel) {
    if (!isNum(netUfMl)) return { applicable: false };
    let threshold = null;
    let label = dextroseLabel || "";
    if (label === "4.25" || label === "3.86") threshold = TARGETS.PET_UF_MIN_425;
    else if (label === "2.5" || label === "2.27") threshold = TARGETS.PET_UF_MIN_25;
    else return { applicable: false, netUfMl };
    return {
      applicable: true,
      netUfMl,
      thresholdMl: threshold,
      lowUf: netUfMl < threshold,
      dextroseLabel: label,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * PD fluid balance and dextrose / icodextrin exposure (instilled grams)
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * Grams of dextrose (or icodextrin) INSTILLED from labeled bag concentration.
   * grams = (percent / 100) × 1000 g/L × volume_L  = 10 × percent × volume_L
   * This is labeled exposure, not absorption. We do not estimate grams
   * absorbed (no single cited method is applied to a mixed daily prescription
   * without measured drain glucose).
   *
   * Standard bag labels (ISPD 2021 quotes both conventions):
   *   1.5% dextrose  ↔  1.36% anhydrous glucose
   *   2.5% dextrose  ↔  2.27% anhydrous glucose
   *   4.25% dextrose ↔  3.86% anhydrous glucose
   *   7.5% icodextrin
   * We use the percent the clinician selects (dextrose or glucose label)
   * and report grams of that labeled substance.
   */
  function instilledGrams(percent, volumeL) {
    req("percent", percent);
    req("volume", volumeL);
    if (percent < 0 || volumeL < 0) throw new Error("Percent and volume must be ≥ 0");
    return 10 * percent * volumeL;
  }

  /**
   * Daily PD fluid balance.
   * balance = intake + residual urine? No:
   *   balance = intake − (PD net UF + urine + other losses)
   * Mass balance identity.
   */
  function pdFluidBalance(opts) {
    const intake = isNum(opts.intakeMlDay) ? opts.intakeMlDay : 0;
    const uf = isNum(opts.pdUfMlDay) ? opts.pdUfMlDay : 0;
    const urine = isNum(opts.urineMlDay) ? opts.urineMlDay : 0;
    const other = isNum(opts.otherLossMlDay) ? opts.otherLossMlDay : 0;
    const output = uf + urine + other;
    return { intakeMl: intake, outputMl: output, balanceMl: intake - output };
  }

  /**
   * Compare weekly Kt/V with ISPD 2020 guidance vs the historical 1.7 figure.
   * We never treat 1.7 as a pass/fail on its own; status is descriptive.
   */
  function ktvGuidanceStatus(weeklyKtvTotal) {
    const k = req("weekly Kt/V", weeklyKtvTotal);
    return {
      weeklyKtvTotal: k,
      historical17: TARGETS.HISTORICAL_KTV,
      atOrAboveHistorical: k >= TARGETS.HISTORICAL_KTV,
    };
  }

  /* ── bundle ────────────────────────────────────────────────────────────── */

  const api = {
    CONV,
    TARGETS,
    isNum,
    convertCaToMmol,
    normalizeHct,
    watsonTbw,
    bsaMosteller,
    bsaDuBois,
    plasmaFlowMlH,
    predilutionFactor,
    crrtEffluentDose,
    filtrationFraction,
    minQbForFf,
    suggestCrrtPrescription,
    deliveredDose,
    kdigoDoseStatus,
    netUfPlan,
    citrateCalciumRatio,
    citrateInfusionRate,
    heparinBolus,
    heparinInfusion,
    pdWeeklyKtv,
    pdDrainVolume,
    drainForWeeklyKtv,
    pdWeeklyCrCl,
    residualKidneyFunction,
    petCategory,
    petRatios,
    petUfScreen,
    instilledGrams,
    pdFluidBalance,
    ktvGuidanceStatus,
  };

  global.CrrtPdFormulas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
