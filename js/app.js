/**
 * CRRT & PD Dosing — UI. Live results, no Calculate button.
 * Inputs are never stored. No network after first load.
 */
(function () {
  "use strict";

  const F = window.CrrtPdFormulas;
  const CFG = window.CrrtPdConfig;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function num(el) {
    if (!el) return null;
    let s = String(el.value || "").trim().replace(/,/g, ".");
    s = s.replace("−", "-").replace("–", "-").replace("—", "-");
    if (s === "" || s === "." || s === "-" || s === "+") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fmt(n, d) {
    if (!F.isNum(n) || !Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }
  function setText(id, t) {
    const el = $(id);
    if (el) el.textContent = t;
  }

  /* ── theme (in-memory only; no storage) ── */
  const themeBtn = $("theme-btn");
  function currentTheme() {
    if (document.documentElement.hasAttribute("data-theme")) {
      return document.documentElement.getAttribute("data-theme");
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function paintThemeIcon() {
    const dark = currentTheme() === "dark";
    const svg = $("theme-icon");
    if (!svg) return;
    svg.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/>'
      : '<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>';
  }
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    paintThemeIcon();
  });
  paintThemeIcon();

  /* ── draft banner from config ── */
  if (CFG && CFG.DRAFT) {
    $("draft-banner").textContent = CFG.DRAFT_BANNER;
    $("draft-banner").hidden = false;
  } else if (CFG) {
    $("draft-banner").hidden = true;
  }

  /* ── tabs ── */
  const seg = $("tab-seg");
  function showTab(which) {
    const isCrrt = which === "crrt";
    seg.dataset.value = which;
    $("tab-crrt").setAttribute("aria-selected", String(isCrrt));
    $("tab-pd").setAttribute("aria-selected", String(!isCrrt));
    $("panel-crrt").classList.toggle("active", isCrrt);
    $("panel-pd").classList.toggle("active", !isCrrt);
    $("panel-crrt").hidden = !isCrrt;
    $("panel-pd").hidden = isCrrt;
    // Dock should follow the visible tab
    updateDock();
  }
  $("tab-crrt").addEventListener("click", () => showTab("crrt"));
  $("tab-pd").addEventListener("click", () => showTab("pd"));

  /* ── chip radios ── */
  function bindChips(rootId, onChange) {
    const root = $(rootId);
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn || !root.contains(btn)) return;
      $$(".chip", root).forEach((c) => {
        c.classList.remove("is-on");
        c.setAttribute("aria-checked", "false");
        c.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-on");
      btn.setAttribute("aria-checked", "true");
      btn.setAttribute("aria-pressed", "true");
      onChange(btn);
    });
  }

  let modality = "cvvh-post";
  bindChips("c-mod", (btn) => {
    modality = btn.dataset.mod;
    $("c-pre-wrap").classList.toggle("hidden", !(modality === "cvvh-mixed" || modality === "cvvhdf"));
    $("c-d-wrap").classList.toggle("hidden", modality !== "cvvhdf");
    suggestAndFill(true);
    recalcCrrt();
  });

  let anticoagulation = "";
  let heparinGiveBolus = true;
  function syncAcBlocks() {
    const hep = anticoagulation === "heparin";
    const cit = anticoagulation === "citrate";
    $("c-heparin-block").classList.toggle("hidden", !hep);
    $("c-citrate-block").classList.toggle("hidden", !cit);
  }
  bindChips("c-ac", (btn) => {
    anticoagulation = btn.dataset.ac || "";
    syncAcBlocks();
    recalcCrrt();
  });
  bindChips("c-hep-bolus-on", (btn) => {
    heparinGiveBolus = btn.dataset.bolus !== "no";
    $("c-hep-bolus-wrap").classList.toggle("hidden", !heparinGiveBolus);
    recalcCrrt();
  });
  $("c-hep-rate-u").addEventListener("click", () => {
    const el = $("c-hep-rate-u");
    const cur = el.dataset.unit;
    const rate = num($("c-hep-rate"));
    const wt = num($("c-wt"));
    if (cur === "IU/kg/h") {
      el.dataset.unit = "units/h";
      el.textContent = "units/h";
      if (rate !== null && wt && wt > 0) $("c-hep-rate").value = String(Math.round(rate * wt));
    } else {
      el.dataset.unit = "IU/kg/h";
      el.textContent = "IU/kg/h";
      if (rate !== null && wt && wt > 0) {
        const kgh = rate / wt;
        $("c-hep-rate").value = String(Math.round(kgh * 10) / 10);
      }
    }
    recalcCrrt();
  });

  let pdMod = "capd";
  bindChips("p-mod", (btn) => {
    pdMod = btn.dataset.pmod;
    $("p-capd").classList.toggle("hidden", pdMod !== "capd");
    $("p-apd").classList.toggle("hidden", pdMod !== "apd");
    recalcPd();
  });

  let sexFemale = false;
  bindChips("p-sex", (btn) => {
    sexFemale = btn.dataset.sex === "f";
    recalcPd();
  });

  let petDex = "2.5";
  bindChips("p-pet-dex", (btn) => {
    petDex = btn.dataset.petdex;
    recalcPd();
  });

  $("p-ico").addEventListener("click", () => {
    const on = $("p-ico").getAttribute("aria-pressed") === "true";
    $("p-ico").setAttribute("aria-pressed", String(!on));
    $("p-ico").classList.toggle("is-on", !on);
    recalcPd();
  });
  $("p-lico").addEventListener("click", () => {
    const on = $("p-lico").getAttribute("aria-pressed") === "true";
    $("p-lico").setAttribute("aria-pressed", String(!on));
    $("p-lico").classList.toggle("is-on", !on);
    recalcPd();
  });

  /* sliders */
  function bindSlider(id, outId, suffix) {
    const el = $(id);
    const paint = () => {
      $(outId).textContent = el.value + (suffix || "%");
    };
    el.addEventListener("input", () => {
      paint();
      suggestAndFill(true);
      recalcCrrt();
    });
    paint();
  }
  bindSlider("c-pre-frac", "c-pre-out", "%");
  bindSlider("c-d-frac", "c-d-out", "%");

  /* unit toggle */
  function bindUnit(id, units) {
    const el = $(id);
    el.addEventListener("click", () => {
      const i = units.indexOf(el.dataset.unit);
      const next = units[(i + 1) % units.length];
      el.dataset.unit = next;
      el.textContent = next;
      recalcCrrt();
    });
  }
  bindUnit("c-tca-u", ["mg/dL", "mmol/L"]);
  bindUnit("c-ica-u", ["mmol/L", "mg/dL"]);

  $("c-acda").addEventListener("click", () => {
    $("c-cit-s").value = "113";
    $("c-acda").classList.add("is-on");
    $("c-tsc").classList.remove("is-on");
    recalcCrrt();
  });
  $("c-tsc").addEventListener("click", () => {
    $("c-cit-s").value = "136";
    $("c-tsc").classList.add("is-on");
    $("c-acda").classList.remove("is-on");
    recalcCrrt();
  });

  /* ── CRRT suggestion / live calc ── */
  let filling = false;
  let lastSuggestKey = "";

  function suggestAndFill(force) {
    const wt = num($("c-wt"));
    const target = num($("c-target"));
    const qnetOverride = num($("c-qnet"));
    const intake = num($("c-intake"));
    const other = num($("c-other"));
    const bal = num($("c-bal"));
    const down = num($("c-down"));
    let qnet = qnetOverride;
    if (intake !== null || bal !== null) {
      try {
        const plan = F.netUfPlan({
          intakeMlDay: intake || 0,
          otherLossMlDay: other || 0,
          desiredBalanceMlDay: bal || 0,
          downtimePct: down || 0,
        });
        // Prefer running-time hourly so daily balance is still met
        qnet = plan.hourlyRunningMlH;
      } catch (e) { /* leave qnet */ }
    }
    if (wt === null || target === null) return;
    const preFrac = Number($("c-pre-frac").value) / 100;
    const dFrac = Number($("c-d-frac").value) / 100;
    const key = [wt, target, modality, qnet, preFrac, dFrac].join("|");
    if (!force && key === lastSuggestKey) return;
    lastSuggestKey = key;
    try {
      const s = F.suggestCrrtPrescription({
        weightKg: wt,
        targetMlKgH: target,
        qnetMlH: F.isNum(qnet) ? qnet : 0,
        modality,
        preFraction: preFrac,
        dialysateFraction: dFrac,
      });
      filling = true;
      if (!s.netExceedsTarget) {
        $("c-qpre").value = String(Math.round(s.qpreMlH));
        $("c-qpost").value = String(Math.round(s.qpostMlH));
        $("c-qd").value = String(Math.round(s.qdMlH));
        $("c-qnet").value = String(Math.round(s.qnetMlH));
      }
      filling = false;
    } catch (e) {
      filling = false;
    }
  }

  function metricState(el, state) {
    el.classList.remove("ok", "warn", "bad");
    if (state) el.classList.add(state);
  }
  function chipState(el, state, text) {
    el.className = "status-chip " + (state || "info");
    el.textContent = text;
  }

  function recalcCrrt() {
    const wt = num($("c-wt"));
    const hct = num($("c-hct"));
    const target = num($("c-target"));
    const down = num($("c-down"));
    const intake = num($("c-intake"));
    const other = num($("c-other"));
    const bal = num($("c-bal"));
    const qpre = num($("c-qpre")) || 0;
    const qpost = num($("c-qpost")) || 0;
    const qd = num($("c-qd")) || 0;
    const qnet = num($("c-qnet")) || 0;
    const qb = num($("c-qb"));

    // Fluid plan display
    if (intake !== null || bal !== null) {
      try {
        const plan = F.netUfPlan({
          intakeMlDay: intake || 0,
          otherLossMlDay: other || 0,
          desiredBalanceMlDay: bal || 0,
          downtimePct: down || 0,
        });
        setText("c-uf-day", fmt(plan.ufMlDay, 0) + " mL");
        setText("c-uf-h", fmt(plan.hourlyRunningMlH, 0) + " mL/h");
        metricState($("c-uf-day-m"), plan.negativeUf ? "warn" : "");
        if (plan.negativeUf) {
          $("c-uf-day-m").querySelector(".ml").textContent = "Negative — intake already below desired balance";
        } else {
          $("c-uf-day-m").querySelector(".ml").textContent = "Required 24-h net UF";
        }
      } catch (e) {
        setText("c-uf-day", "—");
        setText("c-uf-h", "—");
      }
    } else {
      setText("c-uf-day", "—");
      setText("c-uf-h", "—");
    }

    let prescribed = null;
    let corrected = null;
    let delivered = null;
    let qeff = null;
    let df = 1;
    let ffPct = null;
    let qbMin = null;
    let heroState = "info";
    let heroChip = "Enter weight";

    if (wt && wt > 0) {
      try {
        const dose = F.crrtEffluentDose({
          weightKg: wt,
          qdMlH: qd,
          qpreMlH: qpre,
          qpostMlH: qpost,
          qnetMlH: qnet,
          qbMlMin: qb,
          hct: hct,
        });
        prescribed = dose.prescribedMlKgH;
        corrected = dose.correctedMlKgH;
        df = dose.df;
        qeff = dose.qeffMlH;
        const del = F.deliveredDose(corrected, down || 0);
        delivered = del.deliveredMlKgH;
        const st = F.kdigoDoseStatus(delivered, prescribed);
        if (st.deliveredStatus === "in-range") {
          heroState = "ok";
          heroChip = "In KDIGO 20–25 delivered range";
        } else if (st.deliveredStatus === "below") {
          heroState = "warn";
          heroChip = "Below KDIGO 20–25 delivered range";
        } else if (st.deliveredStatus === "above") {
          heroState = "info";
          heroChip = "Above 25 mL/kg/h delivered";
        }
      } catch (e) {
        // Predilution without Qb/Hct: still show prescribed
        try {
          const dose = F.crrtEffluentDose({
            weightKg: wt,
            qdMlH: qd,
            qpostMlH: qpost,
            qnetMlH: qnet,
          });
          // If qpre > 0 this would have thrown; so qpre is 0 here, or we show prescribed only
          prescribed = (qd + qpre + qpost + qnet) / wt;
          heroChip = qpre > 0 ? "Enter Qb and Hct for predilution correction" : "Enter rates";
        } catch (e2) { /* leave blanks */ }
      }

      if (qb && hct !== null) {
        try {
          const ffMod = modality === "cvvhd" ? "cvvhd" : "cvvh";
          const ff = F.filtrationFraction({
            qbMlMin: qb,
            hct: hct,
            qpreMlH: qpre,
            qpostMlH: qpost,
            qnetMlH: qnet,
            modality: ffMod,
          });
          ffPct = ff.ffUsedPct;
          const ffEl = $("c-ff-m");
          if (ff.ffUsed > F.TARGETS.FF_WARN) {
            metricState(ffEl, "bad");
          } else if (ff.ffUsed >= F.TARGETS.FF_CAUTION) {
            metricState(ffEl, "warn");
          } else {
            metricState(ffEl, "ok");
          }
        } catch (e) {
          metricState($("c-ff-m"), "");
        }
        try {
          const mq = F.minQbForFf({
            hct: hct,
            qpreMlH: qpre,
            qpostMlH: qpost,
            qnetMlH: qnet,
            modality: modality === "cvvhd" ? "cvvhd" : "cvvh",
          }, F.TARGETS.FF_WARN);
          qbMin = mq.qbMlMin;
        } catch (e) { /* */ }
      } else {
        metricState($("c-ff-m"), "");
      }
    }

    setText("c-hero", delivered !== null ? fmt(delivered, 1) : "—");
    setText("c-hero-u", delivered !== null ? "mL/kg/h" : "");
    setText("c-hero-lbl", "Predilution-corrected, downtime-adjusted");
    chipState($("c-hero-chip"), heroState, heroChip);
    setText("c-r-pres", prescribed !== null ? fmt(prescribed, 1) + " mL/kg/h" : "—");
    setText("c-r-corr", corrected !== null ? fmt(corrected, 1) + " mL/kg/h" : "—");
    setText("c-r-del", delivered !== null ? fmt(delivered, 1) + " mL/kg/h" : "—");
    setText("c-r-qeff", qeff !== null ? fmt(qeff, 0) + " mL/h" : "—");
    setText("c-r-ff", ffPct !== null ? fmt(ffPct, 1) + "%" : "—");
    setText("c-r-qbmin", qbMin !== null && qbMin > 0 ? Math.ceil(qbMin) + " mL/min" : "—");
    setText("c-ff", ffPct !== null ? fmt(ffPct, 1) + "%" : "—");
    setText("c-df", df < 1 ? fmt(df, 3) : (qpre > 0 ? "needs Qb, Hct" : "1.00"));

    if (qbMin !== null && qbMin > 0) {
      const hint = $("c-qb-hint");
      const need = Math.ceil(qbMin);
      hint.textContent =
        "Minimum Qb to keep filtration fraction at 25% is " +
        need +
        " mL/min (derived from the FF equation, not a guideline Qb). The 20–25% FF caution is practice-based, not a KDIGO numeric target.";
      if (qb !== null && qb < qbMin) {
        hint.textContent += " Current Qb is below that minimum.";
      }
    } else {
      $("c-qb-hint").textContent = "";
    }

    // Citrate ratio
    const tca = num($("c-tca"));
    const ica = num($("c-ica"));
    if (tca !== null && ica !== null && ica > 0) {
      try {
        const r = F.citrateCalciumRatio(tca, $("c-tca-u").dataset.unit, ica, $("c-ica-u").dataset.unit);
        setText("c-ratio", fmt(r.ratio, 2));
        const rm = $("c-ratio-m");
        if (r.status === "accumulation") {
          metricState(rm, "bad");
          setText("c-ratio-st", "≥ 2.5 — suggests accumulation");
        } else if (r.status === "caution") {
          metricState(rm, "warn");
          setText("c-ratio-st", "≥ 2.4 (Link 2012), below 2.5");
        } else {
          metricState(rm, "ok");
          setText("c-ratio-st", "Below published cutoffs");
        }
      } catch (e) {
        setText("c-ratio", "—");
        setText("c-ratio-st", "—");
        metricState($("c-ratio-m"), "");
      }
    } else {
      setText("c-ratio", "—");
      setText("c-ratio-st", "—");
      metricState($("c-ratio-m"), "");
    }

    // Citrate infusion (uses current Qb)
    const ct = num($("c-cit-t"));
    const cs = num($("c-cit-s"));
    if (qb && ct && cs) {
      try {
        const inf = F.citrateInfusionRate({ qbMlMin: qb, targetMmolPerL: ct, solutionMmolPerL: cs });
        setText("c-cit-r", fmt(inf.rateMlH, 0) + " mL/h");
        setText("c-cit-m", fmt(inf.mmolH, 1) + " mmol/h");
      } catch (e) {
        setText("c-cit-r", "—");
        setText("c-cit-m", "—");
      }
    } else {
      setText("c-cit-r", "—");
      setText("c-cit-m", "—");
    }

    let hepBolusUnits = null;
    let hepBolusIuKg = null;
    let hepBolusGiven = null;
    let hepRateUnitsH = null;
    let hepRateIuKgH = null;
    let hepRateMlH = null;
    if (anticoagulation === "heparin") {
      try {
        const b = F.heparinBolus({
          weightKg: wt,
          bolusIuPerKg: num($("c-hep-bolus")),
          giveBolus: heparinGiveBolus,
        });
        hepBolusGiven = b.given;
        hepBolusUnits = b.given ? b.bolusUnits : 0;
        hepBolusIuKg = b.given ? b.bolusIuPerKg : 0;
        setText(
          "c-hep-bolus-u",
          b.given ? (F.isNum(b.bolusUnits) ? fmt(b.bolusUnits, 0) + " units" : "—") : "No bolus"
        );
      } catch (e) {
        hepBolusGiven = heparinGiveBolus ? null : false;
        setText("c-hep-bolus-u", heparinGiveBolus ? "—" : "No bolus");
      }
      try {
        const unit = $("c-hep-rate-u").dataset.unit;
        const rate = num($("c-hep-rate"));
        const conc = num($("c-hep-conc"));
        const opts = { weightKg: wt, concentrationUnitsPerMl: conc };
        if (unit === "units/h") opts.rateUnitsH = rate;
        else opts.rateIuPerKgH = rate;
        const inf = F.heparinInfusion(opts);
        hepRateUnitsH = inf.rateUnitsH;
        hepRateIuKgH = inf.rateIuPerKgH;
        hepRateMlH = inf.rateMlH;
        setText("c-hep-rate-u-out", F.isNum(inf.rateUnitsH) ? fmt(inf.rateUnitsH, 0) + " units/h" : "—");
        setText("c-hep-ml", F.isNum(inf.rateMlH) ? fmt(inf.rateMlH, 1) + " mL/h" : "—");
        $("c-hep-ml-m").hidden = !F.isNum(inf.rateMlH);
      } catch (e) {
        setText("c-hep-rate-u-out", "—");
        setText("c-hep-ml", "—");
        $("c-hep-ml-m").hidden = true;
      }
    } else {
      setText("c-hep-bolus-u", "—");
      setText("c-hep-rate-u-out", "—");
      setText("c-hep-ml", "—");
      $("c-hep-ml-m").hidden = true;
    }

    renderCrrtRx({
      weightKg: wt,
      modality,
      targetMlKgH: target,
      qbMlMin: qb,
      qpreMlH: qpre,
      qpostMlH: qpost,
      qdMlH: qd,
      qnetMlH: qnet,
      anticoagulation,
      citrateInfusionMlH: anticoagulation === "citrate" ? numFromMetric("c-cit-r") : null,
      citrateMmolH: anticoagulation === "citrate" ? numFromMetric("c-cit-m") : null,
      citrateSolution: anticoagulation === "citrate" ? citrateSolutionLabel() : "",
      citrateTargetMmolPerL: anticoagulation === "citrate" ? num($("c-cit-t")) : null,
      heparinBolusGiven: anticoagulation === "heparin" ? hepBolusGiven : null,
      heparinBolusUnits: anticoagulation === "heparin" ? hepBolusUnits : null,
      heparinBolusIuPerKg: anticoagulation === "heparin" ? hepBolusIuKg : null,
      heparinInfusionUnitsH: anticoagulation === "heparin" ? hepRateUnitsH : null,
      heparinInfusionIuPerKgH: anticoagulation === "heparin" ? hepRateIuKgH : null,
      heparinInfusionMlH: anticoagulation === "heparin" ? hepRateMlH : null,
      heparinApttTarget: anticoagulation === "heparin" ? ($("c-hep-aptt").value || "").trim() : "",
      heparinAntiXa: anticoagulation === "heparin" ? ($("c-hep-antixa").value || "").trim() : "",
      heparinMonitoring: anticoagulation === "heparin" ? ($("c-hep-mon").value || "").trim() : "",
      ffPct: ffPct,
      ffFlag: ffFlagFromPct(ffPct),
      downtimeAdjustedMlKgH: delivered,
    });

    updateDock();
  }

  /* ── PD ── */
  function pdVolumes() {
    let instilled = 0;
    let dextroseL = 0;
    let dextrosePct = 0;
    let icoL = 0;
    let nEx = 0;
    let fill = 0;
    if (pdMod === "capd") {
      nEx = num($("p-nex")) || 0;
      fill = num($("p-fill")) || 0;
      const ico = $("p-ico").getAttribute("aria-pressed") === "true";
      const dexN = ico ? Math.max(0, nEx - 1) : nEx;
      instilled = nEx * fill;
      dextroseL = dexN * fill;
      dextrosePct = num($("p-dex")) || 0;
      icoL = ico ? fill : 0;
    } else {
      const cyc = num($("p-cyc")) || 0;
      const nfill = num($("p-nfill")) || 0;
      const lfill = num($("p-lfill")) || 0;
      instilled = cyc * nfill + lfill;
      dextroseL = cyc * nfill;
      dextrosePct = num($("p-ndex")) || 0;
      const ico = $("p-lico").getAttribute("aria-pressed") === "true";
      icoL = ico ? lfill : 0;
      if (!ico) {
        // last fill counted as same night dextrose if not icodextrin — clinician may differ
        dextroseL += lfill;
      }
    }
    const uf = num($("p-uf")) || 0;
    const drain = F.isNum(instilled) ? instilled + uf : null;
    let dexG = 0;
    let icoG = 0;
    try {
      if (dextroseL > 0 && dextrosePct > 0) dexG = F.instilledGrams(dextrosePct, dextroseL);
      if (icoL > 0) icoG = F.instilledGrams(7.5, icoL);
    } catch (e) { /* */ }
    return { instilled, drain, uf, dexG, icoG, icoL };
  }

  function recalcPd() {
    const age = num($("p-age"));
    const ht = num($("p-ht"));
    const wt = num($("p-wt"));
    let V = null;
    let bsaM = null;
    let bsaD = null;
    if (ht && wt) {
      try {
        V = F.watsonTbw(age, ht, wt, sexFemale);
        // female doesn't need age; male does — watsonTbw throws if male and no age
      } catch (e) {
        V = null;
      }
      try {
        bsaM = F.bsaMosteller(ht, wt);
        bsaD = F.bsaDuBois(ht, wt);
      } catch (e) { /* */ }
    }
    setText("p-v", V !== null ? fmt(V, 1) + " L" : (sexFemale || age ? "—" : "Enter age, height, weight"));
    if (bsaM !== null) {
      setText("p-bsa", fmt(bsaM, 2) + " m²  ·  DuBois " + fmt(bsaD, 2));
    } else {
      setText("p-bsa", "—");
    }

    const vol = pdVolumes();
    setText(
      "p-vol",
      vol.instilled ? fmt(vol.instilled, 1) + " / " + fmt(vol.drain, 1) + " L" : "—"
    );

    const dpur = num($("p-dpur"));
    const dpcr = num($("p-dpcr"));
    const uvol = num($("p-uvol"));
    const upur = num($("p-upur"));
    const upcr = num($("p-upcr"));

    let ktv = null;
    let crcl = null;
    let drain17 = null;
    let heroState = "info";
    let heroChip = "Enter V and D/P urea";

    if (V && dpur && vol.drain) {
      try {
        ktv = F.pdWeeklyKtv(dpur, vol.drain, V, upur, uvol);
        const g = F.ktvGuidanceStatus(ktv.weeklyKtvTotal);
        if (g.atOrAboveHistorical) {
          heroState = "info";
          heroChip = "≥ historical 1.7 · not a cutoff";
        } else {
          heroState = "info";
          heroChip = "Below historical 1.7 · person-centred";
        }
        const d17 = F.drainForWeeklyKtv(1.7, V, dpur, ktv.weeklyKtvRenal);
        drain17 = d17;
      } catch (e) { /* */ }
    }
    if (V && dpcr && vol.drain && ht && wt) {
      try {
        crcl = F.pdWeeklyCrCl({
          dOverPCr: dpcr,
          drainVolumeL: vol.drain,
          uOverPCr: upcr,
          uOverPUrea: upur,
          urineVolumeL: uvol,
          heightCm: ht,
          weightKg: wt,
          bsaMethod: "mosteller",
        });
      } catch (e) { /* */ }
    }

    setText("p-ktv", ktv ? fmt(ktv.weeklyKtvTotal, 2) : "—");
    setText("p-crcl", crcl ? fmt(crcl.totalLWeek173, 0) : "—");
    setText("p-hero", ktv ? fmt(ktv.weeklyKtvTotal, 2) : "—");
    setText("p-hero-u", ktv ? "weekly" : "");
    chipState($("p-hero-chip"), heroState, heroChip);
    setText("p-r-p", ktv ? fmt(ktv.weeklyKtvPeritoneal, 2) : "—");
    setText("p-r-r", ktv ? fmt(ktv.weeklyKtvRenal, 2) : "—");
    setText("p-r-17", ktv ? (ktv.weeklyKtvTotal >= 1.7 ? "At or above" : "Below") : "—");
    setText("p-r-cr", crcl ? fmt(crcl.totalLWeek173Mosteller, 0) + " L/wk/1.73 m²" : "—");
    setText("p-r-crd", crcl ? fmt(crcl.totalLWeek173DuBois, 0) + " L/wk/1.73 m²" : "—");
    if (drain17 && drain17.alreadyMetByResidual) {
      setText("p-r-dr", "Met by residual");
    } else if (drain17) {
      setText("p-r-dr", fmt(drain17.drainL, 1) + " L/day");
    } else {
      setText("p-r-dr", "—");
    }

    const ispd = $("p-ispd");
    if (ktv) {
      ispd.hidden = false;
      ispd.className = "callout";
      ispd.innerHTML =
        "<strong>ISPD 2020:</strong> high-quality goal-directed, person-centred PD. " +
        "There is no specific clearance target that guarantees sufficient dialysis. " +
        "Increasing Kt/V above 1.7 may improve uraemia-related symptoms if present, " +
        "but if symptoms, nutrition and volume are controlled, no prescription change is needed solely to reach an arbitrary target. " +
        "The 1.7 figure is the historical ISPD 2006 / KDOQI 2006 minimum, shown for reference. " +
        (ktv.weeklyKtvTotal >= 1.7
          ? "This estimate is at or above that historical figure."
          : "This estimate is below that historical figure.");
    } else {
      ispd.hidden = true;
    }
    const det = $("p-ktv-detail");
    if (ktv) {
      det.textContent =
        "Peritoneal " +
        fmt(ktv.weeklyKtvPeritoneal, 2) +
        " + residual " +
        fmt(ktv.weeklyKtvRenal, 2) +
        " = " +
        fmt(ktv.weeklyKtvTotal, 2) +
        ". Drain volume is instilled " +
        fmt(vol.instilled, 2) +
        " L + UF " +
        fmt(vol.uf, 2) +
        " L. Mosteller is the default BSA for CrCl; DuBois is shown for comparison.";
    } else {
      det.textContent = "";
    }

    // PET
    let dp = num($("p-pet-dp"));
    let dd = num($("p-pet-dd"));
    const dcr = num($("p-pet-dcr"));
    const pcr = num($("p-pet-pcr"));
    const g4 = num($("p-pet-g4"));
    const g0 = num($("p-pet-g0"));
    const computed = F.petRatios(dcr, pcr, g4, g0);
    if (computed.dpCr && dp === null) dp = computed.dpCr;
    if (computed.dd0 && dd === null) dd = computed.dd0;
    const badge = $("p-pet-badge");
    const gluB = $("p-pet-glu");
    const imp = $("p-pet-imp");
    const notes = $("p-pet-notes");
    if (dp !== null || dd !== null) {
      const cat = F.petCategory(dp, dd);
      badge.textContent = cat.crCategory
        ? "D/P Cr: " + cat.crCategory + (dp !== null ? " (" + fmt(dp, 2) + ")" : "")
        : "D/P Cr: —";
      badge.className = "badge";
      if (cat.crCategory === "High") badge.classList.add("high");
      if (cat.crCategory === "Low") badge.classList.add("low");
      if (cat.glucoseCategory) {
        gluB.hidden = false;
        gluB.textContent = "D/D₀: " + cat.glucoseCategory + (dd !== null ? " (" + fmt(dd, 2) + ")" : "");
        gluB.className = "badge";
        if (cat.glucoseCategory === "High") gluB.classList.add("high");
        if (cat.glucoseCategory === "Low") gluB.classList.add("low");
      } else {
        gluB.hidden = true;
      }
      imp.hidden = false;
      imp.className = "callout";
      imp.innerHTML = petImplications(cat.crCategory);
      const n = [];
      if (cat.crNote) n.push(cat.crNote);
      if (cat.gluNote) n.push(cat.gluNote);
      if (cat.discordant) {
        n.push("D/P creatinine and D/D₀ glucose categories disagree. Classification is primarily by 4-h D/P creatinine; consider repeating the PET (common practice when results are discordant).");
      }
      n.push("ISPD 2021 prefers interpreting 4-h D/P creatinine relative to the local laboratory and centre distribution; Twardowski bands are historical and remain widely taught.");
      notes.textContent = n.join(" ");
    } else {
      badge.textContent = "—";
      badge.className = "badge";
      gluB.hidden = true;
      imp.hidden = true;
      notes.textContent = "";
    }

    // PET UF screen
    const petUf = num($("p-pet-uf"));
    if (petUf !== null) {
      const scr = F.petUfScreen(petUf, petDex);
      if (scr.applicable) {
        const extra = document.createElement("p");
        // append via notes
        if (scr.lowUf) {
          notes.textContent +=
            " ISPD 2021: insufficient UF is suspected when 4-h net UF is < " +
            scr.thresholdMl +
            " mL on this PET dextrose (GRADE 1B). Measured UF is " +
            fmt(petUf, 0) +
            " mL.";
          imp.classList.add("warn");
        } else {
          notes.textContent +=
            " 4-h PET UF " +
            fmt(petUf, 0) +
            " mL is not below the ISPD 2021 screening threshold of " +
            scr.thresholdMl +
            " mL for this dextrose.";
        }
      }
    }

    // Fluid balance
    const intake = num($("p-intake"));
    const other = num($("p-other"));
    const urineL = uvol || 0;
    if (intake !== null || vol.uf) {
      const b = F.pdFluidBalance({
        intakeMlDay: intake || 0,
        pdUfMlDay: (vol.uf || 0) * 1000,
        urineMlDay: urineL * 1000,
        otherLossMlDay: other || 0,
      });
      setText("p-bal", fmt(b.balanceMl, 0) + " mL");
      metricState($("p-bal-m"), b.balanceMl > 500 ? "warn" : b.balanceMl < 0 ? "ok" : "");
    } else {
      setText("p-bal", "—");
      metricState($("p-bal-m"), "");
    }
    setText("p-glu", vol.dexG ? fmt(vol.dexG, 0) + " g" : "—");
    setText("p-ico-g", vol.icoG ? fmt(vol.icoG, 0) + " g" : "—");

    renderPdRx({ ktv, crcl, vol });

    updateDock();
  }

  /**
   * Prescription implications: wording taken from Twardowski 1987 abstract
   * and ISPD 2021 (Morelle et al.) key recommendations — not invented advice.
   */
  function petImplications(crCat) {
    const ispd =
      "<strong>ISPD 2021 (Morelle et al.).</strong> A faster peritoneal solute transfer rate is associated with lower survival on PD (GRADE 1A), in part from lower ultrafiltration and greater net fluid reabsorption when PSTR is above average. " +
      "Lower net UF “can be avoided by shortening glucose-based exchanges, using a polyglucose solution (icodextrin), and/or prescribing higher glucose concentrations” (GRADE 1A). " +
      "Compared with glucose, icodextrin can improve fluid status and reduce fluid-overload episodes (GRADE 1A). " +
      "Automated PD and icodextrin may mitigate the mortality risk associated with fast PSTR (practice point).";
    const tward =
      "<strong>Twardowski 1987.</strong> ";
    if (crCat === "High") {
      return (
        tward +
        "Patients with high peritoneal solute transfer “were likely to have inadequate ultrafiltration on standard CAPD” and “did much better on dialysis modalities with short dwell exchanges” (nightly PD or daytime ambulatory PD). " +
        ispd
      );
    }
    if (crCat === "High-average") {
      return (
        tward +
        "Patients with high-average transport “did well on standard CAPD even after losing residual renal function.” " +
        ispd +
        " Fast-side-of-average PSTR still warrants attention to UF and the long dwell."
      );
    }
    if (crCat === "Low" || crCat === "Low-average") {
      return (
        tward +
        "Patients with low-average, “and particularly low,” transport “were likely to develop symptoms and signs of inadequate dialysis as their residual renal function became negligible, particularly in individuals with high body surface area.” " +
        "Longer dwells and adequate fill volume are the classic prescription response; this is descriptive, not a protocol. " +
        ispd
      );
    }
    return ispd;
  }

  function updateDock() {
    const isCrrt = seg.dataset.value === "crrt";
    if (isCrrt) {
      setText("dock-l", "Delivered CRRT dose");
      setText("dock-v", $("c-hero").textContent);
      setText("dock-u", $("c-hero-u").textContent);
      $("dock-chip").className = $("c-hero-chip").className;
      $("dock-chip").textContent = $("c-hero-chip").textContent;
    } else {
      setText("dock-l", "Weekly Kt/V urea");
      setText("dock-v", $("p-hero").textContent);
      setText("dock-u", $("p-hero-u").textContent);
      $("dock-chip").className = $("p-hero-chip").className;
      $("dock-chip").textContent = $("p-hero-chip").textContent;
    }
  }

  /* ── live listeners ── */
  const crrtUpstream = new Set(["c-wt", "c-target", "c-intake", "c-other", "c-bal", "c-down"]);
  function onCrrtInput(e) {
    if (filling) return;
    if (e && e.target && crrtUpstream.has(e.target.id)) {
      suggestAndFill(true);
    }
    recalcCrrt();
  }
  $("panel-crrt").addEventListener("input", onCrrtInput);
  $("panel-crrt").addEventListener("change", onCrrtInput);
  $("panel-pd").addEventListener("input", recalcPd);
  $("panel-pd").addEventListener("change", recalcPd);

  /* ── About sheets ── */
  const ABOUT = {
    "crrt-dose": {
      title: "CRRT effluent dose",
      html: `
        <h4>Equation</h4>
        <p class="eq">Qeff = Qd + Qr<sub>pre</sub> + Qr<sub>post</sub> + Qnet<br>
        Prescribed dose = Qeff / weight&nbsp;(mL/kg/h)<br>
        Predilution factor DF = Qp / (Qp + Qpre)<br>
        Qp = Qb × 60 × (1 − Hct)<br>
        Corrected dose = (Qeff × DF) / weight<br>
        Delivered ≈ corrected × (1 − downtime fraction)</p>
        <h4>Units</h4>
        <p>Rates in mL/h, Qb in mL/min, dose in mL/kg/h, Hct as % or fraction.</p>
        <h4>Citation</h4>
        <p>KDIGO Clinical Practice Guideline for Acute Kidney Injury. <em>Kidney Int Suppl.</em> 2012;2:1-138, recommendation <strong>5.8.4</strong> (recommendation 5.8.3 is intermittent Kt/V 3.9): “We recommend delivering an effluent volume of 20–25 ml/kg/h for CRRT in AKI (1A). This will usually require a higher prescription of effluent volume.” Rationale (p. 114): “In clinical practice, in order to achieve a delivered dose of 20–25 ml/kg/h, it is generally necessary to prescribe in the range of 25–30 ml/kg/h, and to minimize interruptions in CRRT.” Evidence: ATN — Palevsky et al., <em>N Engl J Med.</em> 2008;359:7-20. RENAL — Bellomo et al., <em>N Engl J Med.</em> 2009;361:1627-1638.</p>
        <p>Predilution factor: Macedo E, Mehta RL. Continuous dialysis therapies: Core Curriculum 2016. <em>Am J Kidney Dis.</em> 2016;68:645-661. <a href="https://doi.org/10.1053/j.ajkd.2016.03.427" target="_blank" rel="noopener">doi:10.1053/j.ajkd.2016.03.427</a>.</p>
        <h4>Caveats</h4>
        <ul>
          <li>Delivered dose here is time-weighted effluent. KDIGO also notes that filter efficiency declines; we do not invent a filter-efficiency coefficient.</li>
          <li>The predilution correction assumes a urea sieving coefficient of ≈1 and applies DF to total effluent — the usual clinical approximation.</li>
          <li>Plasma flow is Qb × (1 − Hct), without a further 0.93 plasma-water factor (same judgment as the Nephrology Toolbox).</li>
          <li>Default prescribed target is 25 mL/kg/h, the lower end of KDIGO’s usual prescription range.</li>
        </ul>`,
    },
    "crrt-modality": {
      title: "CRRT modalities",
      html: `
        <h4>How rates are split</h4>
        <p class="eq">Target effluent = target dose × weight<br>
        Remaining = target effluent − net UF<br>
        CVVH post: remaining → post-filter replacement<br>
        CVVH pre: remaining → pre-filter replacement<br>
        CVVH mixed: remaining split by the predilution slider<br>
        CVVHD: remaining → dialysate (UF is the only convection)<br>
        CVVHDF: remaining split by the dialysate slider, then replacement by the predilution slider</p>
        <h4>Caveats</h4>
        <ul>
          <li>The mixed and CVVHDF sliders are starting splits for you to adjust — they are <strong>not</strong> guideline targets.</li>
          <li>If net UF already exceeds the target effluent, rates are not auto-filled and a warning is implied by the dose numbers.</li>
        </ul>`,
    },
    "crrt-uf": {
      title: "Net UF / fluid-balance planner",
      html: `
        <h4>Equation</h4>
        <p class="eq">24-h net UF = intake − other losses − desired balance<br>
        Hourly (24-h continuous) = daily UF / 24<br>
        Hourly while running = daily UF / (24 × uptime)</p>
        <h4>Citation</h4>
        <p>These are mass-balance identities, not a published coefficient. KDIGO 2012 recommendation 5.8.2: provide RRT to achieve the fluid balance that will meet the patient’s needs. Fluid overload is discussed as an independent risk in the same chapter’s rationale.</p>
        <h4>Caveats</h4>
        <ul>
          <li>No assumed insensible loss is added. Enter other losses yourself if you want them counted.</li>
          <li>Desired balance is negative for net removal (e.g. −1000 mL).</li>
          <li>The running-time hourly rate is used as the suggested Qnet so the 24-h total is still achieved despite downtime.</li>
        </ul>`,
    },
    "crrt-rates": {
      title: "Filtration fraction and blood flow",
      html: `
        <h4>Equation</h4>
        <p class="eq">Quf = Qpre + Qpost + Qnet &nbsp;(for CVVHD, Quf = Qnet only)<br>
        FF<sub>post-style</sub> = Quf / Qp<br>
        FF<sub>pre</sub> = Quf / (Qp + Qpre)<br>
        The FF used for warnings is the pre-style when Qpre &gt; 0.<br>
        Min Qb for FF = 0.25: &nbsp;Qb = (Quf / 0.25 − Qpre) / (60 × (1 − Hct))</p>
        <h4>Citation</h4>
        <p>Neri M, et al. Nomenclature for renal replacement therapy in AKI: basic principles. <em>Crit Care.</em> 2016;20:318. <a href="https://doi.org/10.1186/s13054-016-1489-9" target="_blank" rel="noopener">doi:10.1186/s13054-016-1489-9</a>.</p>
        <p>Murugan R, Hoste E, Mehta RL, et al. Precision fluid management in CRRT. <em>Blood Purif.</em> 2016. <a href="https://doi.org/10.1159/000448528" target="_blank" rel="noopener">doi:10.1159/000448528</a> — “A high FF (&gt;0.25) is typically associated with increased risk of poor filter performance and clotting.”</p>
        <h4>Caveats / judgment</h4>
        <ul>
          <li>The 20–25% caution is practice-based, <strong>not</strong> a KDIGO numeric target.</li>
          <li>Neri distinguishes filtration fraction (ideally below 30%) from concentration ratio (keep below 20–25%). We warn at 20% (caution) and 25% (warning) and flag this for review.</li>
          <li>Minimum Qb is derived from the FF equation, not a recommended blood-flow from a guideline.</li>
        </ul>`,
    },
    anticoag: {
      title: "Anticoagulation for CRRT",
      html: `
        <h4>KDIGO AKI 2012, section 5.3 (choice of anticoagulant)</h4>
        <p>KDIGO Clinical Practice Guideline for Acute Kidney Injury. <em>Kidney Int Suppl.</em> 2012;2:1-138, chapter 5.3.</p>
        <ul>
          <li><strong>5.3.2.2 (2B):</strong> For anticoagulation in CRRT, “we suggest using regional citrate anticoagulation rather than heparin in patients who do not have contraindications for citrate.”</li>
          <li><strong>5.3.2.3 (2C):</strong> If citrate is contraindicated, “we suggest using either unfractionated or low-molecular-weight heparin, rather than other anticoagulants.”</li>
          <li><strong>5.3.3.1 (2C):</strong> If bleeding risk is increased and citrate is not contraindicated, suggest regional citrate rather than no anticoagulation.</li>
          <li><strong>5.3.3.2 (2C):</strong> “We suggest avoiding regional heparinization during CRRT in a patient with increased risk of bleeding.”</li>
          <li><strong>5.3.4 (1A):</strong> In heparin-induced thrombocytopenia, “all heparin must be stopped” (the rationale includes heparin locks) and “we recommend using direct thrombin inhibitors (such as argatroban) or Factor Xa inhibitors (such as danaparoid or fondaparinux) rather than other or no anticoagulation during RRT.”</li>
          <li><strong>5.3.4.1 (2C):</strong> In HIT without severe liver failure, “we suggest using argatroban rather than other thrombin or Factor Xa inhibitors during RRT.”</li>
        </ul>
        <p>KDIGO does <strong>not</strong> recommend a single numeric unfractionated-heparin dose. The rationale states that UFH is “mostly administered as a prefilter infusion, with large variability in the administered doses,” that the relationship among dose, aPTT, filter survival, and bleeding “is not straightforward,” and that “it is common practice to measure aPTT for safety reasons and to adapt the target to the bleeding risk of the patient.” After summarizing two small UFH-vs-LMWH RCTs, KDIGO concludes “no firm recommendations can be made.” Monitoring “should also include platelet count, allowing timely detection of HIT.”</p>
        <h4>Starting unfractionated-heparin values used in this app</h4>
        <p>The editable starting values are the UFH arm of the second trial KDIGO describes:</p>
        <p class="eq">Bolus 30 IU/kg, then 7 IU/kg/h pre-filter, titrated to aPTT 40–45 seconds.</p>
        <p>Joannidis M, Kountchev J, Rauchenzauner M, et al. Enoxaparin vs. unfractionated heparin for anticoagulation during continuous veno-venous hemofiltration: a randomized controlled crossover study. <em>Intensive Care Med.</em> 2007;33:1571-1579. <a href="https://pubmed.ncbi.nlm.nih.gov/17563874/" target="_blank" rel="noopener">PMID 17563874</a>. KDIGO reference 616.</p>
        <p>Joannidis M, Oudemans-van Straaten HM. Clinical review: Patency of the circuit in continuous renal replacement therapy. <em>Crit Care.</em> 2007;11:218. <a href="https://doi.org/10.1186/cc5937" target="_blank" rel="noopener">doi:10.1186/cc5937</a> describes “a possible scheme for UFH” of “a bolus of 30 IU/kg followed by an initial rate of 5 to 10 IU/kg per hour in patients with normal coagulation. However, the level of anticoagulation should be individualized.” That review also notes: “Retrospective analyses indicate increased bleeding if systemic aPTT is longer than 45 seconds.”</p>
        <p>The source of that bleeding observation is van de Wetering J, Westendorp RG, van der Hoeven JG, et al. Heparin use in continuous renal replacement procedures: the struggle between filter coagulation and patient hemorrhage. <em>J Am Soc Nephrol.</em> 1996;7:145-150. <a href="https://pubmed.ncbi.nlm.nih.gov/8808122/" target="_blank" rel="noopener">PMID 8808122</a> (KDIGO reference 618).</p>
        <h4>The other KDIGO-cited RCT (not the starting default)</h4>
        <p>Reeves JH, Cumming AR, Gallagher L, et al. A controlled trial of low-molecular-weight heparin (dalteparin) versus unfractionated heparin as anticoagulant during continuous venovenous hemodialysis with filtration. <em>Crit Care Med.</em> 1999;27:2224-2228 (KDIGO reference 620). UFH arm: bolus 2000–5000 U, then 10 U/kg/h, titrated to an aPTT of 70–80 seconds (mean aPTT 79 seconds). This is shown as a published alternative, not as the app’s starting value, because it conflicts with the 40–45 second target and with the bleeding observation at aPTT &gt; 45 seconds.</p>
        <h4>What the calculator does</h4>
        <p class="eq">Bolus (units) = bolus (IU/kg) × weight (kg)<br>
        Infusion (units/h) = rate (IU/kg/h) × weight (kg)<br>
        If a bag concentration (units/mL) is entered: mL/h = (units/h) ÷ (units/mL)</p>
        <p>These are unit conversions only. A no-bolus option is provided so you can match a unit protocol; it is not a cited “preferred” regimen. Bag concentration and monitoring interval have <strong>no cited default</strong> and are left blank for you to fill. We do not pre-fill an anti-Xa range for UFH; the anti-Xa figures in the KDIGO-cited trials were for LMWH (enoxaparin 0.25–0.30 U/ml in Joannidis 2007; a mean of 0.49 U/ml in a subset of the Reeves dalteparin arm).</p>
        <h4>Citrate helpers</h4>
        <p>Citrate starting-ratio helpers (total/ionized calcium ratio; citrate-in-blood infusion rate) appear when Citrate is selected. Their equations and citations are in the Citrate about sheet.</p>
      `,
    },
    citrate: {
      title: "Citrate anticoagulation helpers",
      html: `
        <h4>Total / ionized calcium ratio</h4>
        <p class="eq">Ratio = total Ca (mmol/L) / ionized Ca (mmol/L)<br>
        Total Ca in mg/dL is divided by 4 to convert to mmol/L.</p>
        <p>Meier-Kriesche HU, Gitomer J, Finkel K, DuBose T. Increased total to ionized calcium ratio during continuous venovenous hemodialysis with regional citrate anticoagulation. <em>Crit Care Med.</em> 2001;29:748-752. <a href="https://pubmed.ncbi.nlm.nih.gov/11373461/" target="_blank" rel="noopener">PMID 11373461</a>. A ratio ≥ 2.5 is the widely cited cutoff suggesting systemic citrate accumulation, especially in liver failure.</p>
        <p>Link A, et al. Total-to-ionized calcium ratio predicts mortality in CRRT with citrate. <em>Crit Care.</em> 2012. <a href="https://pubmed.ncbi.nlm.nih.gov/22643456/" target="_blank" rel="noopener">PMID 22643456</a> reported ≥ 2.4 as a mortality-associated threshold. We show 2.5 as the primary cutoff and 2.4 as an alternate published value.</p>
        <h4>Citrate-in-blood infusion rate</h4>
        <p class="eq">Citrate (mmol/h) = Qb (mL/min) × 60 / 1000 × target (mmol/L blood)<br>
        Rate (mL/h) = Qb × 60 × target / solution concentration (mmol/L)</p>
        <p>The equation is stoichiometry. The target of about 3 mmol/L blood (worked examples 3–4) is from Oudemans-van Straaten HM, Ostermann M. Bench-to-bedside review: Citrate for continuous renal replacement therapy. <em>Crit Care.</em> 2012;16:249. <a href="https://doi.org/10.1186/cc11645" target="_blank" rel="noopener">doi:10.1186/cc11645</a> <a href="https://pubmed.ncbi.nlm.nih.gov/23216871/" target="_blank" rel="noopener">PMID 23216871</a>. Table 1 of that review lists ACD-A at 113 mmol/L citrate and 4% TSC at 136 mmol/L. A worked example there uses Qb 150 mL/min, target 4 mmol/L, citrate dose 36 mmol/h.</p>
        <h4>Caveats</h4>
        <ul>
          <li>This is a starting-ratio helper, not a complete RCA protocol. Protocols titrate to post-filter ionized calcium. Calcium replacement is not calculated.</li>
          <li>Citrate accumulation is a clinical diagnosis (rising ratio, falling ionized Ca, rising calcium requirement, often metabolic acidosis) — the ratio alone is a screening marker.</li>
        </ul>`,
    },
    "pd-anthro": {
      title: "Watson V and body-surface area",
      html: `
        <h4>Equations</h4>
        <p class="eq">Male V (L) = 2.447 − 0.09516×age + 0.1074×height<sub>cm</sub> + 0.3362×weight<sub>kg</sub><br>
        Female V (L) = −2.097 + 0.1069×height<sub>cm</sub> + 0.2466×weight<sub>kg</sub><br>
        (The female equation has no age term, as published.)<br>
        Mosteller BSA (m²) = √(height<sub>cm</sub> × weight<sub>kg</sub> / 3600)<br>
        DuBois BSA = 0.007184 × weight<sup>0.425</sup> × height<sup>0.725</sup></p>
        <h4>Citations</h4>
        <p>Watson PE, Watson ID, Batt RD. Total body water volumes for adult males and females estimated from simple anthropometric measurements. <em>Am J Clin Nutr.</em> 1980;33:27-39. <a href="https://doi.org/10.1093/ajcn/33.1.27" target="_blank" rel="noopener">doi:10.1093/ajcn/33.1.27</a> <a href="https://pubmed.ncbi.nlm.nih.gov/6986753/" target="_blank" rel="noopener">PMID 6986753</a>. The male age coefficient is <strong>0.09516</strong> as published (a circulated variant uses 0.09156; we do not).</p>
        <p>Mosteller RD. Simplified calculation of body-surface area. <em>N Engl J Med.</em> 1987;317:1098. <a href="https://doi.org/10.1056/NEJM198710223171717" target="_blank" rel="noopener">doi:10.1056/NEJM198710223171717</a>. Default for PD CrCl normalization (stated).</p>
        <p>Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and weight be known. <em>Arch Intern Med.</em> 1916;17:863-871. Reported alongside Mosteller.</p>
        <h4>Caveats</h4>
        <ul>
          <li>Watson V is an anthropometric estimate, not a measured volume. ISPD and KDOQI commonly use it for PD Kt/V.</li>
          <li>These equations are for adults.</li>
        </ul>`,
    },
    "pd-rx": {
      title: "PD prescription planner",
      html: `
        <h4>Equation</h4>
        <p class="eq">Instilled volume = Σ (exchanges × fill)<br>
        24-h drain volume = instilled + 24-h net UF</p>
        <h4>Caveats</h4>
        <ul>
          <li>Net UF must be measured or estimated; it is not predicted from dextrose concentration (no uncited UF model).</li>
          <li>Dwell times are recorded for the prescription summary. They are not used to invent a D/P from PET curves.</li>
        </ul>`,
    },
    "pd-ktv": {
      title: "Weekly Kt/V urea and creatinine clearance",
      html: `
        <h4>Equations</h4>
        <p class="eq">Peritoneal daily Kt (L) = (D/P urea) × 24-h drain (L)<br>
        Renal daily Kt (L) = (U/P urea) × 24-h urine (L)<br>
        Weekly Kt/V = 7 × (Ktp + Ktr) / V<sub>Watson</sub><br><br>
        Peritoneal CrCl (L/week) = (D/P Cr) × drain (L) × 7<br>
        Residual (L/week) = 0.5 × (C<sub>urea</sub> + C<sub>Cr</sub>)<sub>renal</sub> × 7<br>
        Normalized = × 1.73 / BSA &nbsp;(Mosteller default; DuBois also shown)</p>
        <h4>Citations</h4>
        <p>ISPD 2020: Brown EA, Blake PG, Boudville N, et al. International Society for Peritoneal Dialysis practice recommendations: Prescribing high-quality goal-directed peritoneal dialysis. <em>Perit Dial Int.</em> 2020;40(3):244-253. <a href="https://doi.org/10.1177/0896860819895364" target="_blank" rel="noopener">doi:10.1177/0896860819895364</a>. Person-centred, goal-directed prescribing. “There is no specific clearance target that guarantees sufficient dialysis for an individual.” Increasing Kt/V &gt; 1.7 may improve uraemia-related symptoms if present; “If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target.”</p>
        <p>Historical minimum 1.7: Lo WK, Bargman JM, Burkart J, et al. Guideline on targets for solute and fluid removal in adult patients on chronic peritoneal dialysis. <em>Perit Dial Int.</em> 2006;26:520-522. <a href="https://doi.org/10.1177/089686080602600502" target="_blank" rel="noopener">doi:10.1177/089686080602600502</a>; and KDOQI PD Adequacy 2006, <em>Am J Kidney Dis.</em> 2006;48(suppl 1).</p>
        <h4>Caveats</h4>
        <ul>
          <li>D/P urea should come from a 24-hour collection on the actual prescription. A 4-hour PET D/P applied to short APD cycles overestimates clearance. We do not apply an uncited dwell-time model.</li>
          <li>Residual kidney function uses the mean of urea and creatinine clearance, standard ISPD / KDOQI practice, to avoid overestimating Ccr from tubular secretion.</li>
          <li>The 1.7 figure is shown as a historical reference, never as a pass/fail on its own.</li>
        </ul>`,
    },
    pet: {
      title: "PET interpretation",
      html: `
        <h4>Twardowski 4-h categories (widely taught bands)</h4>
        <p class="eq">D/P creatinine: Low 0.34–0.49 · Low-average 0.50–0.64 · High-average 0.65–0.81 · High 0.82–1.03<br>
        D/D₀ glucose: High 0.12–0.26 · High-average 0.27–0.38 · Low-average 0.39–0.49 · Low 0.50–0.61</p>
        <p>Twardowski ZJ, Nolph KD, Khanna R, et al. Peritoneal equilibration test. <em>Perit Dial Bull.</em> 1987;7:138-147.</p>
        <p>Classification is primarily by 4-h D/P creatinine; D/D₀ is supportive. A 0.38 vs 0.37 top of the high-average D/D₀ band varies by 0.01 in some lab manuals — we use 0.38 (same judgment as the Nephrology Toolbox).</p>
        <h4>ISPD 2021</h4>
        <p>Morelle J, Stachowska-Pietka J, Öberg C, et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. <em>Perit Dial Int.</em> 2021. <a href="https://doi.org/10.1177/0896860820982218" target="_blank" rel="noopener">doi:10.1177/0896860820982218</a> <a href="https://pubmed.ncbi.nlm.nih.gov/33563110/" target="_blank" rel="noopener">PMID 33563110</a>.</p>
        <ul>
          <li>Determine PSTR from a 4-h PET using 2.5%/2.27% or 4.25%/3.86% dextrose/glucose, with creatinine as the index solute (practice point). Do this early (6–12 weeks) and when clinically indicated.</li>
          <li>Faster PSTR is associated with lower survival on PD (GRADE 1A), in part from lower UF. Lower net UF can be avoided by shortening glucose-based exchanges, using icodextrin, and/or higher glucose concentrations (GRADE 1A). APD and icodextrin may mitigate mortality risk associated with fast PSTR (practice point).</li>
          <li>Insufficient UF is suspected when 4-h net UF is &lt; 400 mL on 4.25% dextrose (3.86% glucose) or &lt; 100 mL on 2.5% dextrose (2.27% glucose) (GRADE 1B).</li>
        </ul>
        <h4>Twardowski 1987 prescription observations (abstract)</h4>
        <ul>
          <li>High-average: did well on standard CAPD even after losing residual function.</li>
          <li>High: likely inadequate ultrafiltration on standard CAPD; did better with short-dwell modalities (nightly PD or DAPD).</li>
          <li>Low and low-average: likely to develop inadequate-dialysis symptoms as residual function became negligible, particularly with high BSA.</li>
        </ul>
        <h4>Caveats</h4>
        <ul>
          <li>ISPD 2021 prefers local laboratory and centre distributions over treating historical Twardowski bands as universal.</li>
          <li>Use a standard 2.5% (or 2.27%) 4-hour PET as originally described; correct dialysate creatinine for glucose interference if the lab requires it.</li>
        </ul>`,
    },
    "pd-fluid": {
      title: "PD fluid balance and exposure",
      html: `
        <h4>Equations</h4>
        <p class="eq">24-h balance = intake − (PD net UF + urine + other losses)<br>
        Instilled grams = 10 × labeled % × volume (L)</p>
        <h4>Citation</h4>
        <p>Balance is a mass-balance identity. Labeled dextrose / icodextrin concentrations follow standard bag labels; ISPD 2021 quotes both 2.5%/2.27% and 4.25%/3.86% dextrose/glucose conventions. Icodextrin is typically 7.5%.</p>
        <h4>Caveats</h4>
        <ul>
          <li>Grams reported are <strong>instilled exposure</strong>, not absorption. Grams absorbed are omitted: a cited method for a mixed daily prescription would need measured drain glucose, and we will not invent one.</li>
        </ul>`,
    },
  };

  const overlay = $("overlay");
  const sheet = $("sheet");
  let lastFocus = null;

  function openSheet(key) {
    const a = ABOUT[key];
    if (!a) return;
    lastFocus = document.activeElement;
    $("sheet-title").textContent = a.title;
    $("sheet-body").innerHTML = a.html;
    overlay.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add("open");
      sheet.classList.add("open");
    });
    $("sheet-close").focus();
  }
  function closeSheet() {
    overlay.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => {
      overlay.hidden = true;
      sheet.hidden = true;
    }, 280);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-about]");
    if (btn) openSheet(btn.getAttribute("data-about"));
  });
  overlay.addEventListener("click", closeSheet);
  $("sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet();
  });

  /* ── prescription order sheets (formatting only; no new math) ── */
  const RX = window.CrrtPdPrescription;

  function ffFlagFromPct(ffPct) {
    if (!F.isNum(ffPct)) return "";
    const frac = ffPct / 100;
    if (frac > F.TARGETS.FF_WARN) return "warning";
    if (frac >= F.TARGETS.FF_CAUTION) return "caution";
    return "";
  }

  function citrateSolutionLabel() {
    if ($("c-acda").classList.contains("is-on")) return "ACD-A 113 mmol/L";
    if ($("c-tsc").classList.contains("is-on")) return "4% TSC 136 mmol/L";
    const cs = num($("c-cit-s"));
    return cs !== null ? fmt(cs, 0) + " mmol/L" : "";
  }

  function numFromMetric(id) {
    const t = ($(id) && $(id).textContent) || "";
    if (!t || t === "—") return null;
    const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isWriteIn(value) {
    return !value || /^_+$/.test(value.trim());
  }

  function rowHtml(line) {
    const sub = /^\s/.test(line);
    const trimmed = line.trim();
    const idx = trimmed.indexOf(":");
    if (idx < 0) {
      return trimmed
        ? '<div class="rx-section">' + esc(trimmed) + "</div>"
        : "";
    }
    const label = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1).trim();
    let cls = "rx-row" + (sub ? " sub" : "");
    if (/\bWARNING\b/.test(value)) cls += " flag-warning";
    else if (/\bCAUTION\b/.test(value)) cls += " flag-caution";
    const rv = isWriteIn(value) ? '<span class="line"></span>' : esc(value);
    return (
      '<div class="' +
      cls +
      '"><span class="rk">' +
      esc(label) +
      '</span><span class="rv">' +
      rv +
      "</span></div>"
    );
  }

  function bathLineHtml(kind) {
    return (
      '<div class="rx-bath-line"><span class="kind">' +
      esc(kind) +
      ':</span>' +
      '<span class="rx-writein"><span class="lbl">K</span><span class="line"></span></span>' +
      '<span class="rx-writein"><span class="lbl">Ca</span><span class="line"></span></span>' +
      '<span class="rx-writein"><span class="lbl">Bicarbonate</span><span class="line"></span></span></div>'
    );
  }

  function renderSheet(el, rx) {
    if (!el || !rx) return;
    const lines = rx.text.split("\n");
    const body = [];
    let phase = "seek";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (phase === "seek") {
        if (line.startsWith("Patient:")) phase = "after-patient";
        continue;
      }
      if (phase === "after-patient") {
        if (line.trim() === "") phase = "body";
        continue;
      }
      if (line.startsWith("Prescriber:") || line === rx.footer) break;
      body.push(line);
    }

    const rowBits = [];
    let bathBits = "";
    let labsHtml = "";
    let inBath = false;
    body.forEach((line) => {
      if (line === "Fluid composition / bath (write in)") {
        inBath = true;
        return;
      }
      if (inBath) {
        if (line.startsWith("Monitoring labs:")) {
          inBath = false;
          labsHtml =
            '<div class="rx-section" style="margin-top:14px">Monitoring labs</div>' +
            '<div class="rx-writein" style="margin-top:4px"><span class="line"></span></div>';
          return;
        }
        if (/Replacement:/.test(line)) bathBits += bathLineHtml("Replacement");
        else if (/Dialysate:/.test(line)) bathBits += bathLineHtml("Dialysate");
        return;
      }
      if (line.trim() === "") return;
      if (line.startsWith("Monitoring labs:")) {
        labsHtml =
          '<div class="rx-section" style="margin-top:14px">Monitoring labs</div>' +
          '<div class="rx-writein" style="margin-top:4px"><span class="line"></span></div>';
        return;
      }
      rowBits.push(rowHtml(line));
    });

    el.innerHTML =
      '<div class="rx-head">' +
      '<div class="rx-kicker">Wellness Tech LLC</div>' +
      '<div class="rx-title">' +
      esc(rx.title) +
      "</div>" +
      '<div class="rx-date">Date: ' +
      esc(rx.date) +
      "</div>" +
      '<div class="rx-id-line">' +
      '<div class="rx-writein"><span class="lbl">Patient</span><span class="line"></span></div>' +
      '<div class="rx-writein"><span class="lbl">MRN</span><span class="line"></span></div>' +
      "</div></div>" +
      '<div class="rx-rows">' +
      rowBits.join("") +
      "</div>" +
      (bathBits
        ? '<div class="rx-section">Fluid composition / bath (write in)</div><div class="rx-bath">' +
          bathBits +
          "</div>"
        : "") +
      labsHtml +
      '<div class="rx-sig">' +
      '<div class="rx-writein"><span class="lbl">Prescriber</span><span class="line"></span></div>' +
      '<div class="rx-writein"><span class="lbl">Date/time</span><span class="line"></span></div>' +
      "</div>" +
      '<p class="rx-footer">' +
      esc(rx.footer) +
      "</p>";
    el.dataset.text = rx.text;
  }

  function renderCrrtRx(opts) {
    if (!RX) return;
    const rx = RX.formatCrrtPrescription(opts);
    renderSheet($("c-rx-sheet"), rx);
  }

  function renderPdRx(ctx) {
    if (!RX) return;
    const ktv = ctx.ktv;
    const crcl = ctx.crcl;
    const opts = { modality: pdMod };
    if (pdMod === "capd") {
      opts.exchanges = num($("p-nex"));
      opts.fillL = num($("p-fill"));
      opts.dwellH = num($("p-dwell"));
      opts.dextrosePct = num($("p-dex"));
      opts.icodextrin = $("p-ico").getAttribute("aria-pressed") === "true";
    } else {
      opts.cycles = num($("p-cyc"));
      opts.nightFillL = num($("p-nfill"));
      opts.nightDwellH = num($("p-ndwell"));
      opts.nightDextrosePct = num($("p-ndex"));
      opts.lastFillL = num($("p-lfill"));
      opts.dayDwellH = num($("p-ldwell"));
      opts.icodextrin = $("p-lico").getAttribute("aria-pressed") === "true";
      const instilled = ctx.vol && F.isNum(ctx.vol.instilled) ? ctx.vol.instilled : null;
      opts.totalVolumeL = instilled;
    }
    if (ktv) opts.weeklyKtv = ktv.weeklyKtvTotal;
    if (crcl) opts.weeklyCrClMosteller = crcl.totalLWeek173Mosteller;
    const rx = RX.formatPdPrescription(opts);
    renderSheet($("p-rx-sheet"), rx);
  }

  function bindCopyPrint(btnId, sheetId) {
    const btn = $(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const text = ($(sheetId) && $(sheetId).dataset.text) || "";
      const finish = (ok) => {
        if (!ok) return;
        btn.classList.add("is-copied");
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("is-copied");
          btn.textContent = "Copy";
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => finish(false));
        return;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      finish(ok);
    });
  }

  bindCopyPrint("c-rx-copy", "c-rx-sheet");
  bindCopyPrint("p-rx-copy", "p-rx-sheet");
  $("c-rx-print").addEventListener("click", () => window.print());
  $("p-rx-print").addEventListener("click", () => window.print());

  /* first paint */
  suggestAndFill(true);
  recalcCrrt();
  recalcPd();
})();
