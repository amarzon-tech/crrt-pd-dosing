/**
 * Plain-text prescription formatter for CRRT & PD Dosing.
 * Formats values already calculated by formulas.js. No medical math here.
 * Inputs are never stored.
 */
(function (global) {
  "use strict";

  const FOOTER = "Draft – verify before use; clinical judgment required";
  const BLANK = "________________";
  const BLANK_SHORT = "______";
  const PUBLISHER = "Wellness Tech LLC";
  const APP = "CRRT & PD Dosing (draft)";

  function isNum(x) {
    return typeof x === "number" && Number.isFinite(x);
  }

  function formatLongDate(d) {
    if (typeof d === "string" && d.trim()) return d.trim();
    const dt = d instanceof Date ? d : new Date();
    return dt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function fmt(n, digits) {
    if (!isNum(n)) return null;
    const d = digits == null ? (Number.isInteger(n) ? 0 : 1) : digits;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  function qty(n, unit, digits) {
    const s = fmt(n, digits);
    return s == null ? BLANK : s + (unit ? " " + unit : "");
  }

  function modalityOrderLabel(mod) {
    switch (mod) {
      case "cvvh-pre":
        return "CVVH (pre-filter replacement)";
      case "cvvh-post":
        return "CVVH (post-filter replacement)";
      case "cvvh-mixed":
        return "CVVH (mixed pre- and post-filter replacement)";
      case "cvvhd":
        return "CVVHD";
      case "cvvhdf":
        return "CVVHDF";
      default:
        return "";
    }
  }

  function headerLines(title, dateStr) {
    return [
      title,
      PUBLISHER + " — " + APP,
      "",
      "Date: " + dateStr,
      "Patient: " + BLANK + "          MRN: " + BLANK,
      "",
    ];
  }

  function signatureLines() {
    return [
      "",
      "Prescriber: " + BLANK + "     Date/time: " + BLANK,
      "",
      FOOTER,
    ];
  }

  function ffLine(ffPct, ffFlag) {
    if (!isNum(ffPct)) return "Filtration fraction: " + BLANK;
    let line = "Filtration fraction: " + fmt(ffPct, 1) + "%";
    if (ffFlag === "warning") line += "  — WARNING (≥ 25%)";
    else if (ffFlag === "caution") line += "  — CAUTION (≥ 20%)";
    return line;
  }

  function anticoagulationLines(opts) {
    const kind = (opts.anticoagulation || "").toLowerCase();
    const lines = [];
    if (kind === "citrate") {
      lines.push("Anticoagulation: Citrate");
      if (isNum(opts.citrateInfusionMlH)) {
        lines.push("  Infusion rate: " + qty(opts.citrateInfusionMlH, "mL/h", 0));
      }
      if (isNum(opts.citrateMmolH)) {
        lines.push("  Citrate dose: " + qty(opts.citrateMmolH, "mmol/h", 1));
      }
      if (opts.citrateSolution) {
        lines.push("  Solution: " + opts.citrateSolution);
      }
      if (isNum(opts.citrateTargetMmolPerL)) {
        lines.push("  Target in blood: " + qty(opts.citrateTargetMmolPerL, "mmol/L", 0));
      }
    } else if (kind === "heparin") {
      lines.push("Anticoagulation: Heparin");
      lines.push("  Dose: " + BLANK);
      lines.push("  Target PTT / anti-Xa: " + BLANK);
    } else if (kind === "none") {
      lines.push("Anticoagulation: None");
    } else {
      // Not entered — leave a write-in line. Do not assume citrate.
      lines.push("Anticoagulation: " + BLANK);
    }
    return lines;
  }

  /**
   * Build a CRRT order-sheet as plain text from already-calculated values.
   * Missing numeric inputs become blank write-in lines. No defaults invented.
   *
   * @param {object} opts
   * @returns {{ title: string, date: string, text: string, footer: string }}
   */
  function formatCrrtPrescription(opts) {
    opts = opts || {};
    const dateStr = formatLongDate(opts.date);
    const lines = headerLines("CRRT PRESCRIPTION", dateStr);

    lines.push("Weight: " + qty(opts.weightKg, "kg", Number.isInteger(opts.weightKg) ? 0 : 1));
    const mod = modalityOrderLabel(opts.modality);
    lines.push("Modality: " + (mod || BLANK));
    lines.push("");

    let targetLine = "Target effluent dose: ";
    if (isNum(opts.targetMlKgH)) {
      targetLine += fmt(opts.targetMlKgH, 1) + " mL/kg/h";
      const mlH = isNum(opts.targetMlH)
        ? opts.targetMlH
        : isNum(opts.weightKg)
          ? opts.targetMlKgH * opts.weightKg
          : null;
      if (isNum(mlH)) targetLine += "  (" + fmt(mlH, 0) + " mL/h)";
    } else {
      targetLine += BLANK;
    }
    lines.push(targetLine);
    lines.push("Blood flow (Qb): " + qty(opts.qbMlMin, "mL/min", 0));
    lines.push("");

    const qpre = opts.qpreMlH;
    const qpost = opts.qpostMlH;
    const totalRep =
      isNum(qpre) && isNum(qpost) ? qpre + qpost : isNum(qpre) ? qpre : isNum(qpost) ? qpost : null;
    lines.push("Replacement fluid: " + qty(totalRep, "mL/h", 0));
    lines.push("  Pre-filter:  " + qty(isNum(qpre) ? qpre : null, "mL/h", 0));
    lines.push("  Post-filter: " + qty(isNum(qpost) ? qpost : null, "mL/h", 0));
    lines.push("Dialysate: " + qty(opts.qdMlH, "mL/h", 0));
    lines.push("Net UF goal: " + qty(opts.qnetMlH, "mL/h", 0));
    lines.push("");

    anticoagulationLines(opts).forEach((l) => lines.push(l));
    lines.push("");

    lines.push(ffLine(opts.ffPct, opts.ffFlag));
    lines.push(
      "Downtime-adjusted prescribed dose: " +
        qty(opts.downtimeAdjustedMlKgH, "mL/kg/h", 1)
    );
    lines.push("");

    lines.push("Fluid composition / bath (write in)");
    lines.push(
      "  Replacement:  K " +
        BLANK_SHORT +
        "    Ca " +
        BLANK_SHORT +
        "    Bicarbonate " +
        BLANK_SHORT
    );
    lines.push(
      "  Dialysate:    K " +
        BLANK_SHORT +
        "    Ca " +
        BLANK_SHORT +
        "    Bicarbonate " +
        BLANK_SHORT
    );
    lines.push("");
    lines.push("Monitoring labs: ________________________________");

    signatureLines().forEach((l) => lines.push(l));

    return {
      title: "CRRT PRESCRIPTION",
      date: dateStr,
      text: lines.join("\n"),
      footer: FOOTER,
    };
  }

  /**
   * Build a PD order-sheet as plain text from already-calculated values.
   *
   * @param {object} opts
   * @returns {{ title: string, date: string, text: string, footer: string }}
   */
  function formatPdPrescription(opts) {
    opts = opts || {};
    const dateStr = formatLongDate(opts.date);
    const lines = headerLines("PD PRESCRIPTION", dateStr);
    const mode = (opts.modality || "").toLowerCase();

    if (mode === "apd") {
      lines.push("Modality: APD");
      lines.push("Total volume (instilled): " + qty(opts.totalVolumeL, "L", 1));
      lines.push("Night cycles: " + qty(opts.cycles, "", 0));
      lines.push("Night fill: " + qty(opts.nightFillL, "L", 1));
      lines.push("Night dwell: " + qty(opts.nightDwellH, "h", 1));
      if (isNum(opts.nightDextrosePct) || opts.nightDextrosePct === 0) {
        lines.push("Night dextrose: " + fmt(opts.nightDextrosePct, 1) + "%");
      } else {
        lines.push("Night dextrose: " + BLANK);
      }
      lines.push("Last fill: " + qty(opts.lastFillL, "L", 1));
      lines.push("Day dwell (last fill): " + qty(opts.dayDwellH, "h", 1));
      if (opts.icodextrin === true) {
        lines.push("Last fill fluid: Icodextrin 7.5%");
      } else if (opts.icodextrin === false) {
        lines.push("Last fill fluid: not icodextrin");
      }
    } else {
      // CAPD is the other planner mode. If modality is missing, still use CAPD field labels
      // only when opts.modality is "capd"; otherwise label remains blank.
      lines.push("Modality: " + (mode === "capd" ? "CAPD" : BLANK));
      lines.push("Exchanges: " + (isNum(opts.exchanges) ? fmt(opts.exchanges, 0) + " /day" : BLANK));
      lines.push("Fill volume: " + qty(opts.fillL, "L", 1));
      lines.push("Dwell: " + qty(opts.dwellH, "h", 1));
      if (isNum(opts.dextrosePct) || opts.dextrosePct === 0) {
        lines.push("Dextrose: " + fmt(opts.dextrosePct, 1) + "%");
      } else {
        lines.push("Dextrose: " + BLANK);
      }
      if (opts.icodextrin === true) {
        lines.push("Icodextrin: 7.5%, 1 bag");
      } else if (opts.icodextrin === false) {
        lines.push("Icodextrin: none");
      } else {
        lines.push("Icodextrin: " + BLANK);
      }
    }

    lines.push("");
    lines.push(
      "Weekly Kt/V urea: " + (isNum(opts.weeklyKtv) ? fmt(opts.weeklyKtv, 2) : BLANK)
    );
    if (isNum(opts.weeklyCrClMosteller)) {
      lines.push(
        "Weekly CrCl: " + fmt(opts.weeklyCrClMosteller, 0) + " L/week/1.73 m² (Mosteller)"
      );
    } else {
      lines.push("Weekly CrCl: " + BLANK);
    }

    signatureLines().forEach((l) => lines.push(l));

    return {
      title: "PD PRESCRIPTION",
      date: dateStr,
      text: lines.join("\n"),
      footer: FOOTER,
    };
  }

  const api = {
    FOOTER,
    BLANK,
    formatLongDate,
    formatCrrtPrescription,
    formatPdPrescription,
    modalityOrderLabel,
  };

  global.CrrtPdPrescription = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
