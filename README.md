# CRRT & PD Dosing

Draft clinician tools for **CRRT** and **peritoneal dialysis** dosing, for Dr Amar Damodar (Dr D). Published by Wellness Tech LLC.

**Draft — not for clinical use until reviewed by Dr D.** `DRAFT=true` in `js/config.js`. Do not remove the banner or flip that flag without his sign-off in his own words.

Preview: [https://amarzon-tech.github.io/crrt-pd-dosing/](https://amarzon-tech.github.io/crrt-pd-dosing/)

## What it is

A static, offline progressive web app:

- No login, ads, analytics, or data collection. Inputs are never stored.
- Live results as you type (no Calculate button).
- Every formula and numeric target is cited in an About sheet and in [CONTENT_REVIEW.md](CONTENT_REVIEW.md).

**CRRT tab.** Prescription builder (weight, modality, target dose defaulting to 25 mL/kg/h with the KDIGO 2012 25–30 vs 20–25 note), suggested effluent / replacement / dialysate rates, predilution correction, filtration fraction with a 20–25% caution, net UF planner, delivered dose after downtime, and citrate helpers (total/ionized calcium ratio; citrate-in-blood starting rate). A prescription-format order sheet (Copy / Print) is built from those same values; fluid composition and monitoring labs are blank write-in lines.

**PD tab.** CAPD / APD prescription planner, weekly Kt/V urea (Watson V, peritoneal + residual) against ISPD 2020 person-centred guidance and the historical 1.7 figure, weekly CrCl (Mosteller default, DuBois shown), PET interpretation (Twardowski categories + ISPD 2021 implications and UF screen), and fluid-balance plus instilled dextrose / icodextrin exposure (absorption omitted). A prescription-format order sheet (Copy / Print) lists the CAPD or APD prescription plus weekly Kt/V and CrCl when they can be calculated.

## Run tests

```bash
node tests/formulas.test.js
node tests/prescription.test.js
```

## Privacy and support

amardamodar@gmail.com. The app works offline after the first load (service worker). Medical content remains a draft until Dr D signs off.
