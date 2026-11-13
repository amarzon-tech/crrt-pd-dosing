# Content review — CRRT & PD Dosing (draft)

**App:** CRRT & PD Dosing, v0.1.1-draft
**Publisher:** Wellness Tech LLC
**For:** Dr Amar Damodar (Dr D)
**Status:** `DRAFT=true`. The slim banner reads “Draft – not for clinical use until reviewed by Dr D.” Do not set `DRAFT` to false, or remove the banner, without Dr D’s sign-off in his own words.

This is a clinician-facing, static, offline PWA. No login, ads, analytics, network calls after first load, or data collection. Inputs are never stored.

Every formula and numeric target below is taken from a cited primary source or guideline. Please tick each item after you have reviewed the equation, the citation, the caveats, and the on-screen wording.

Antibiotic / drug dosing tables are **not** included, because a complete ISPD peritonitis 2022 table was not transcribed number-for-number into this draft. Say if you want a cited table added later.

Shared anthropometrics and PD/CRRT math are kept consistent with the Nephrology Toolbox (`amarzon-tech/neph-toolbox`), which was read but not modified.

---

## CRRT

### Effluent dose (prescribed, predilution-corrected, delivered)

Live prescription builder: weight, modality, target prescribed dose (default **25 mL/kg/h**), suggested rates, predilution correction, and delivered dose after downtime.

**Equation**

```
Qeff = Qd + Qr_pre + Qr_post + Qnet
Prescribed dose = Qeff / weight                 (mL/kg/h)
Qp = Qb × 60 × (1 − Hct)
DF = Qp / (Qp + Qpre)                           (1 if Qpre = 0)
Corrected dose = (Qeff × DF) / weight
Delivered ≈ corrected × (1 − downtime fraction)
```

**Target**

- KDIGO AKI 2012, recommendation **5.8.4** (not 5.8.3, which is intermittent Kt/V 3.9): deliver an effluent volume of **20–25 mL/kg/h** for CRRT in AKI (1A). “This will usually require a higher prescription of effluent volume.”
- Rationale (Kidney Int Suppl. 2012;2, p. 114): “In clinical practice, in order to achieve a delivered dose of 20–25 ml/kg/h, it is generally necessary to prescribe in the range of **25–30 ml/kg/h**, and to minimize interruptions in CRRT.”

**Citation**

KDIGO Clinical Practice Guideline for Acute Kidney Injury. *Kidney Int Suppl.* 2012;2:1-138. Evidence: Palevsky PM et al. (ATN). *N Engl J Med.* 2008;359:7-20. Bellomo R et al. (RENAL). *N Engl J Med.* 2009;361:1627-1638. Predilution factor: Macedo E, Mehta RL. Continuous dialysis therapies: Core Curriculum 2016. *Am J Kidney Dis.* 2016;68:645-661. [doi:10.1053/j.ajkd.2016.03.427](https://doi.org/10.1053/j.ajkd.2016.03.427)

**Caveats**

- Delivered dose is time-weighted effluent. KDIGO also notes that filter efficiency declines; we do **not** invent a filter-efficiency coefficient.
- Predilution correction assumes a urea sieving coefficient ≈ 1 and applies DF to total effluent (usual clinical approximation).
- Plasma flow has **no** further 0.93 plasma-water factor (judgment, same as the Toolbox).
- The default prescribed target of 25 is the lower end of KDIGO’s usual *prescription* range, not the delivered-dose target.

- [ ] Sign-off: CRRT effluent dose (prescribed, corrected, delivered)

---

### Suggested rates by modality

Remaining effluent after net UF is assigned as:

- CVVH post → post-filter replacement
- CVVH pre → pre-filter replacement
- CVVH mixed → split by a clinician-adjustable predilution share (default 50%, **not** a guideline target)
- CVVHD → dialysate (convection is net UF only)
- CVVHDF → remaining split by a clinician-adjustable dialysate share (default 50%, **not** a guideline target), then replacement by the predilution share

**Citation:** assignment is a description of the modalities, not a dose recommendation. Dose numbers come from KDIGO 5.8.4 as above.

**Caveats:** if net UF already exceeds the target effluent, rates are not auto-filled.

- [ ] Sign-off: Suggested rates by modality

---

### Filtration fraction and minimum Qb

**Equation**

```
Quf = Qpre + Qpost + Qnet     (for CVVHD, Quf = Qnet only)
FF_post-style = Quf / Qp
FF_pre        = Quf / (Qp + Qpre)
Used FF       = FF_pre if Qpre > 0, else FF_post-style
Min Qb for FF = 0.25:
  Qb = (Quf / 0.25 − Qpre) / (60 × (1 − Hct))
```

The minimum-Qb rearrangement is derived from the FF equation, not a published “recommended Qb.”

**Caution thresholds:** 20% (caution) and 25% (warning). Practice-based, **not** a KDIGO numeric target.

**Citation**

Neri M, et al. Nomenclature for renal replacement therapy in AKI: basic principles. *Crit Care.* 2016;20:318. [doi:10.1186/s13054-016-1489-9](https://doi.org/10.1186/s13054-016-1489-9)

Murugan R, Hoste E, Mehta RL, et al. Precision fluid management in CRRT. *Blood Purif.* 2016. [doi:10.1159/000448528](https://doi.org/10.1159/000448528) — “A high FF (>0.25) is typically associated with increased risk of poor filter performance and clotting.”

**Judgment / disagreement (please decide)**

Neri distinguishes **filtration fraction** (ideally below 30%) from **concentration ratio** (keep below 20–25%). We warn at 20% and 25% on the used FF, and state this in the About sheet.

- [ ] Sign-off: Filtration fraction and minimum Qb

---

### Net UF / fluid-balance planner

**Equation** (mass-balance identity, not a published coefficient)

```
24-h net UF = intake − other losses − desired balance
Hourly (24-h continuous) = daily UF / 24
Hourly while running    = daily UF / (24 × uptime)
```

The running-time hourly rate is used as the suggested Qnet so the 24-h total is still achieved despite downtime. No assumed insensible loss is added. Desired balance is negative for net removal.

**Citation:** KDIGO 2012 recommendation 5.8.2 (provide RRT to achieve the fluid balance that meets the patient’s needs). The identities themselves are conservation of volume.

- [ ] Sign-off: Net UF / fluid-balance planner

---

### Citrate: total / ionized calcium ratio

**Equation**

```
Ratio = total Ca (mmol/L) / ionized Ca (mmol/L)
Total Ca in mg/dL is divided by 4.
```

**Cutoffs**

- **≥ 2.5** — widely cited Meier-Kriesche 2001 cutoff suggesting citrate accumulation (primary).
- **≥ 2.4** — Link et al. 2012 mortality-associated threshold, shown as an alternate published value (caution).

**Citation**

Meier-Kriesche HU, Gitomer J, Finkel K, DuBose T. Increased total to ionized calcium ratio during continuous venovenous hemodialysis with regional citrate anticoagulation. *Crit Care Med.* 2001;29:748-752. [PMID 11373461](https://pubmed.ncbi.nlm.nih.gov/11373461/)

Link A, et al. Total-to-ionized calcium ratio predicts mortality in CRRT with citrate. *Crit Care.* 2012. [PMID 22643456](https://pubmed.ncbi.nlm.nih.gov/22643456/)

**Caveats:** the ratio is a screening marker. Clinically relevant accumulation is usually accompanied by falling ionized calcium, rising calcium requirement, and often metabolic acidosis. The exact wording of the 2.5 cutoff in the 2001 paper’s full text should be confirmed (abstracts and later papers cite ≥ 2.5; we follow that convention).

- [ ] Sign-off: Citrate total / ionized calcium ratio

---

### Citrate-in-blood infusion helper

**Equation** (stoichiometry)

```
Citrate mmol/h = Qb (mL/min) × 60 / 1000 × target (mmol per L blood)
Rate mL/h      = Qb × 60 × target / solution concentration (mmol/L)
```

**Target:** default **3 mmol/L** blood; published examples in the cited review use **3–4**. User-adjustable.

**Solution concentrations** (same review, Table 1): ACD-A **113 mmol/L**; 4% trisodium citrate **136 mmol/L**.

**Citation**

Oudemans-van Straaten HM, Ostermann M. Bench-to-bedside review: Citrate for continuous renal replacement therapy, from science to practice. *Crit Care.* 2012;16:249. [doi:10.1186/cc11645](https://doi.org/10.1186/cc11645) [PMID 23216871](https://pubmed.ncbi.nlm.nih.gov/23216871/). The review states that complex protocols “use a fixed citrate dose proportional to blood flow targeting a citrate concentration in the filter of about 3 mmol/L.” A worked example uses Qb 150 mL/min, target 4 mmol/L, citrate dose 36 mmol/h (which this equation reproduces).

**Caveats:** starting-ratio helper only, not a complete RCA protocol. Protocols titrate to post-filter ionized calcium. **Calcium replacement is not calculated.**

- [ ] Sign-off: Citrate infusion helper

---

## PD

### Watson total body water (V)

**Equation**

```
Male:   V = 2.447 − 0.09516×age + 0.1074×height_cm + 0.3362×weight_kg
Female: V = −2.097 + 0.1069×height_cm + 0.2466×weight_kg
```

The female equation has no age term, as published. The male age coefficient is **0.09516** (a circulated variant uses 0.09156; we do not).

**Citation**

Watson PE, Watson ID, Batt RD. *Am J Clin Nutr.* 1980;33:27-39. [doi:10.1093/ajcn/33.1.27](https://doi.org/10.1093/ajcn/33.1.27) [PMID 6986753](https://pubmed.ncbi.nlm.nih.gov/6986753/)

**Caveats:** anthropometric estimate, not a measured volume. ISPD and KDOQI commonly use Watson for PD Kt/V. Adult equations.

- [ ] Sign-off: Watson V

---

### Body-surface area (Mosteller default, DuBois shown)

**Equation**

```
Mosteller BSA (m²) = √(height_cm × weight_kg / 3600)
DuBois BSA         = 0.007184 × weight_kg^0.425 × height_cm^0.725
```

**Citation**

Mosteller RD. *N Engl J Med.* 1987;317:1098. [doi:10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717)

Du Bois D, Du Bois EF. *Arch Intern Med.* 1916;17:863-871.

Mosteller is the default for PD CrCl normalization (stated in the UI); DuBois is also reported.

- [ ] Sign-off: BSA (Mosteller default, DuBois shown)

---

### Weekly Kt/V urea (peritoneal + residual)

**Equation**

```
Peritoneal daily Kt (L) = (D/P urea) × 24-h drain (L)
Renal daily Kt (L)      = (U/P urea) × 24-h urine (L)
Weekly Kt/V             = 7 × (Ktp + Ktr) / V_Watson
Drain volume            = instilled + 24-h net UF
```

**Guidance**

- **ISPD 2020** (person-centred, goal-directed): “There is no specific clearance target that guarantees sufficient dialysis for an individual.” Increasing Kt/V > 1.7 may improve uraemia-related symptoms if present; “If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target.”
- **Historical 1.7** (ISPD 2006 / KDOQI 2006) is shown as a reference, never as a pass/fail on its own. A rearranged “drain volume that would yield peritoneal Kt/V 1.7” is also shown, labelled as a historical reference.

**Citation**

Brown EA, Blake PG, Boudville N, et al. International Society for Peritoneal Dialysis practice recommendations: Prescribing high-quality goal-directed peritoneal dialysis. *Perit Dial Int.* 2020;40(3):244-253. [doi:10.1177/0896860819895364](https://doi.org/10.1177/0896860819895364)

Lo WK, Bargman JM, Burkart J, et al. Guideline on targets for solute and fluid removal in adult patients on chronic peritoneal dialysis. *Perit Dial Int.* 2006;26:520-522. [doi:10.1177/089686080602600502](https://doi.org/10.1177/089686080602600502)

National Kidney Foundation. KDOQI Clinical Practice Guidelines and Clinical Practice Recommendations for 2006 Updates: Peritoneal Dialysis Adequacy. *Am J Kidney Dis.* 2006;48(suppl 1).

**Caveats**

- D/P urea should come from a **24-hour collection on the actual prescription**. A 4-hour PET D/P applied to short APD cycles overestimates clearance. We do **not** apply an uncited dwell-time model.
- Drain volume uses entered net UF; UF is not predicted from dextrose (no uncited UF model).

- [ ] Sign-off: Weekly Kt/V urea and ISPD 2020 / historical 1.7 wording

---

### Weekly creatinine clearance (L/week/1.73 m²)

**Equation**

```
Peritoneal CrCl (L/week) = (D/P Cr) × drain (L) × 7
Renal Ccr    (L/week)    = (U/P Cr) × urine (L) × 7
Renal Curea  (L/week)    = (U/P urea) × urine (L) × 7
RKF (L/week)             = 0.5 × (Curea + Ccr)_renal     (mean)
Total                    = peritoneal + RKF
Normalized               = × 1.73 / BSA
```

Residual as the mean of urea and creatinine clearance is standard ISPD / KDOQI PD adequacy practice (avoids overestimating Ccr from tubular secretion).

**Citation:** same ISPD 2020 / KDOQI 2006 sources as above. Historical CrCl figures (e.g. 45–50 L/week/1.73 m² in some earlier guidance) are **not** used as on-screen targets, because ISPD 2020 is less prescriptive. Say if you want a historical CrCl figure displayed the same way as 1.7.

- [ ] Sign-off: Weekly CrCl and residual kidney function

---

### PET interpretation (Twardowski categories + ISPD 2021 implications)

**4-h D/P creatinine (classic Twardowski bands)**

| Category     | D/P creatinine |
|--------------|----------------|
| Low          | 0.34–0.49      |
| Low-average  | 0.50–0.64      |
| High-average | 0.65–0.81      |
| High         | 0.82–1.03      |

Values below 0.34 or above 1.03 are reported as low or high with a note.

**4-h D/D₀ glucose**

| Category     | D/D₀ glucose |
|--------------|--------------|
| High         | 0.12–0.26    |
| High-average | 0.27–0.38    |
| Low-average  | 0.39–0.49    |
| Low          | 0.50–0.61    |

**Judgment:** 0.38 vs 0.37 as the top of the high-average D/D₀ band varies by 0.01 in some lab manuals. We use **0.38**, consistent with the Nephrology Toolbox.

Classification is primarily by 4-h D/P creatinine; D/D₀ is supportive. Discordant categories are flagged.

**ISPD 2021 UF screening (GRADE 1B):** insufficient UF suspected when 4-h net UF is **< 400 mL** on 4.25% dextrose (3.86% glucose) or **< 100 mL** on 2.5% dextrose (2.27% glucose).

**Prescription implications (wording from the sources, not invented advice)**

- Twardowski 1987 abstract: high-average did well on standard CAPD even after losing residual function; high transporters were likely to have inadequate UF on standard CAPD and did better with short-dwell modalities (NPD or DAPD); low and low-average were likely to develop inadequate-dialysis symptoms as residual function became negligible, particularly with high BSA.
- ISPD 2021 key recommendations: faster PSTR is associated with lower survival (GRADE 1A), in part from lower UF. Lower net UF “can be avoided by shortening glucose-based exchanges, using a polyglucose solution (icodextrin), and/or prescribing higher glucose concentrations” (GRADE 1A). Icodextrin can improve fluid status (GRADE 1A). APD and icodextrin may mitigate the mortality risk associated with fast PSTR (practice point).

**Citation**

Twardowski ZJ, Nolph KD, Khanna R, et al. Peritoneal equilibration test. *Perit Dial Bull.* 1987;7:138-147.

Morelle J, Stachowska-Pietka J, Öberg C, et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. *Perit Dial Int.* 2021. [doi:10.1177/0896860820982218](https://doi.org/10.1177/0896860820982218) [PMID 33563110](https://pubmed.ncbi.nlm.nih.gov/33563110/)

**Caveats:** ISPD 2021 prefers local laboratory and centre distributions over treating historical Twardowski bands as universal. Use a standard 2.5% (or 2.27%) 4-hour PET as originally described; correct dialysate creatinine for glucose interference if the lab requires it.

- [ ] Sign-off: PET categories, UF screen, and prescription-implication wording

---

### PD fluid balance and dextrose / icodextrin exposure

**Equation**

```
24-h balance = intake − (PD net UF + urine + other losses)
Instilled grams = 10 × labeled percent × volume_L
```

Grams are **instilled exposure**, not absorption. Absorbed glucose is **omitted**: a cited method for a mixed daily prescription would need measured drain glucose, and we will not invent one.

Labeled concentrations follow standard bag labels; ISPD 2021 quotes both 2.5%/2.27% and 4.25%/3.86% dextrose/glucose conventions. Icodextrin is 7.5%.

- [ ] Sign-off: PD fluid balance and instilled exposure (absorption omitted)

---


---

## Prescription output (formatting only)

A prescription-style order sheet was added to both tabs, built from values the app already calculates or that you entered. **No formula math was changed.** Copy produces the same plain text; Print prints only the visible tab’s sheet.

**CRRT sheet.** Weight, modality (CVVH / CVVHD / CVVHDF, with the pre / post / mixed note), target effluent dose in mL/kg/h and mL/h (mL/h is the entered target × weight, a unit conversion only), blood flow, replacement rate and pre/post split, dialysate rate, net UF goal, anticoagulation as entered, filtration fraction with the existing 20% caution / 25% warning flags, and the downtime-adjusted prescribed dose (the app’s existing predilution-corrected, downtime-adjusted delivered estimate). Fluid composition (K / Ca / bicarbonate bath) and monitoring labs are always blank write-in lines — the app has no inputs for them.

**PD sheet.** CAPD: exchanges, fill volume, dwell, dextrose %, icodextrin as selected. APD: instilled total volume, night cycles, fill, dwell, last fill, day dwell (last-fill dwell), night dextrose, last-fill fluid. Plus weekly Kt/V urea and weekly CrCl (Mosteller) when those can already be calculated; otherwise blank.

**Header / footer.** Date (the device’s local calendar date, not stored), blank Patient / MRN lines, blank prescriber signature and date/time, and the footer “Draft – verify before use; clinical judgment required.”

**Anticoagulation control.** The app previously had citrate helpers only, and those helpers already carry starting values (target 3 mmol/L, ACD-A 113 mmol/L). A None / Citrate / Heparin chip was added with **no option pre-selected**, so the sheet does not assume citrate from those helper defaults. If you leave it unselected, the sheet keeps a blank write-in line. Heparin dose and PTT / anti-Xa are write-in only; there is still no heparin calculator.

- [ ] Sign-off: Prescription order-sheet wording and blank write-in lines (no new math)

## Items not included, on purpose

- No antibiotic or intraperitoneal drug dosing (ISPD peritonitis 2022 tables would need every number transcribed from the guideline table and cited as such).
- No grams of glucose absorbed.
- No uncited dwell-time adjustment of PET D/P for short APD cycles.
- No uncited prediction of UF from dextrose concentration.
- No calcium-replacement arm of an RCA protocol.
- No 0.93 plasma-water correction.
- No assumed insensible losses.

---

## Judgment calls and source disagreements for your review

1. **KDIGO recommendation number.** Delivered CRRT effluent 20–25 mL/kg/h is recommendation **5.8.4**. (5.8.3 is intermittent Kt/V 3.9.) The Toolbox review document had cited 5.8.3 for effluent dose; this app uses 5.8.4 after checking the 2012 PDF.

2. **Filtration-fraction threshold.** We caution at 20% and warn at 25%. Neri 2016 says FF ideally < 30% and concentration ratio < 20–25%. Murugan/Mehta 2016 flags FF > 0.25.

3. **Plasma-water factor 0.93** is not applied.

4. **Citrate ratio 2.5 vs 2.4.** Primary cutoff 2.5 (Meier-Kriesche, as widely cited); 2.4 shown as Link 2012’s published alternate. We did not use a 2.1 “sensitive” cut because we did not pin it to a primary paper we could cite cleanly.

5. **Citrate target 3 mmol/L** (range 3–4 from the 2012 review’s examples). Starting helper only.

6. **PET D/D₀ HA/LA boundary 0.38** (some manuals 0.37).

7. **Watson male age coefficient 0.09516**, as published.

8. **Mosteller** default BSA; DuBois also shown.

9. **ISPD 2020 vs historical 1.7.** On-screen status is informational, never a red/green pass-fail.

10. **Mixed / CVVHDF rate splits** default to 50% and are labelled as starting splits, not guideline targets.

11. **ISPD 2020 page numbers.** We cite *Perit Dial Int.* 2020;**40(3):244-253** and doi:10.1177/0896860819895364 (the practice-recommendations paper). A nearby article in the same issue is 40:323-329.


12. **Prescription anticoagulation.** No anticoagulant is pre-selected on the order sheet. Citrate infusion details appear only when you choose Citrate. Helper defaults (3 mmol/L, ACD-A) are not copied onto the sheet unless that choice is made.

13. **“Downtime-adjusted prescribed dose”** on the CRRT sheet is the existing predilution-corrected, downtime-adjusted delivered estimate already shown in the results panel. It is not a new formula.

14. **Target effluent mL/h** on the CRRT sheet is the entered target (mL/kg/h) × weight. Unit conversion only.

Please also confirm you are comfortable with KDIGO / ISPD range labels being shown as interpretive chips (aids, not orders).
