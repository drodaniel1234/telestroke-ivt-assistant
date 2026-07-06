# IVT Eligibility Assistant

A clinical decision support prototype exploring whether an LLM can reliably turn
unstructured telestroke consult notes into a transparent, evidence-linked IV
thrombolytic (IVT) eligibility checklist -- built for telestroke physicians who
receive incomplete verbal handoffs and need to reconstruct eligibility criteria
under time pressure.

## The problem

During a telestroke consult, the physician typically has 60-90 seconds on the
phone with an ED provider before needing to decide whether IV thrombolytic
therapy is indicated. The note is often long, inconsistently documented, and
scattered across sections (PMH, medications, labs, imaging). Manually
reconstructing every inclusion criterion and contraindication from that note, on
a live call, is slow and error-prone -- particularly for criteria that depend on
subtle wording (e.g. anticoagulation status) rather than a single clear
data point.

## What it does
<img width="800" height="587" alt="telestroke-ivt-assistant" src="https://github.com/user-attachments/assets/42895d95-6681-4c73-b3b0-2cc94042fbeb" />

The tool reads a telestroke note and, for each IV-tPA eligibility criterion,
returns:
- a **yes / no / unknown** determination
- a short **plain-language reasoning** sentence explaining the determination in
  its own words -- so it can handle documentation phrased inconsistently ("no
  h/o AFib" vs. "denies arrhythmia" vs. "no known atrial fibrillation" all mean
  the same thing)
- a **linked location** in the original note that a physician can check at a
  glance to verify the reasoning against the source

A separate, fully deterministic rules engine (no LLM involvement) then computes
the overall eligibility read-out -- eligible, not eligible, or "cannot
determine, clarify X before proceeding" -- from those per-criterion answers.

## Why this design

This tool is built around the FDA's non-device clinical decision support
criteria (21st Century Cures Act): it doesn't analyze a medical image or signal
directly, it displays and organizes information for a clinician, it does not
issue a clinical recommendation on its own, and -- most importantly -- it is
built so the physician can always independently review the basis for every
answer. Concretely, that last point drove several specific design decisions:

- **The LLM never states an overall eligibility verdict.** It only answers
  per-criterion, with reasoning and a source location. The eligibility banner is
  computed by ordinary code, not the model.
- **"Unknown" is a first-class, distinct outcome** -- not a fallback the UI
  quietly treats the same as "no." A criterion the model can't determine from
  the note is flagged as needing clarification, never silently assumed absent.
- **Silence is only treated as "no" where that's clinically reasonable.** A
  handful of criteria (anticoagulation/DOAC status, coagulation labs, recent
  procedures/trauma) are excluded from that default, because in a rushed acute
  note, silence on those is much more likely to mean "wasn't asked" than
  "confirmed absent." Imaging-dependent findings (e.g. vessel dissection on
  CTA) are further checked against whether the relevant study has actually
  resulted before a "no" default is applied.
- **Every non-"unknown" answer is expected to link back to a specific part of
  the note.** If it can't, that's a signal worth double-checking, not something
  hidden from the user.

## Status and known limitations

This is a working prototype tested against four synthetic sample notes, not a
production clinical tool, and it has not been validated on real patient data or
a clinically representative sample of documentation styles. Specific known
limitations:

- **"Confirmed absent" and "presumed absent by default" currently render with
  the same badge.** The reasoning text distinguishes them, but there is no
  separate visual treatment yet.
- **The silence-defaults-to-no logic is currently governed by an explicit,
  named exception list** (anticoagulation, coagulopathy, recent procedures,
  etc.) rather than a general reasoning principle the model applies on its own.
  This is more predictable and testable today, but doesn't automatically
  generalize to edge cases not yet enumerated.
- **When a note explicitly states that history is unobtainable** (e.g. an
  unidentified, aphasic patient with no collateral), the tool currently treats
  every unresolved criterion as "unknown," including rare conditions that would
  be effectively unknowable for any patient regardless of identification
  status. Whether this is the right level of conservatism versus overly
  cautious is a judgment call still under discussion.
- Tested against four hand-constructed synthetic notes; broader testing across
  more varied documentation styles is a natural next step.

## Architecture

**Stack:** Node.js + Express (backend), vanilla HTML/CSS/JavaScript (frontend,
no build step), Claude (Anthropic API) for extraction.

- LLM extraction step reads the note against a fixed criteria schema
  (`ivt_criteria_schema.json`) and the extraction rules in
  `ivt_extraction_prompt.md`, returning per-criterion value + reasoning +
  source location.
- A small Express backend (`server.js`) holds the API key server-side and
  exposes `/api/extract` and `/api/criteria` -- the key is never present in
  client-side code.
- A deterministic, client-side rules engine computes the final eligibility
  read-out from the extracted values -- no LLM involvement in that step.

### File structure

```
telestroke-ivt-assistant/
├── server.js                    # Express backend; holds API key, proxies extraction calls
├── package.json                 # Dependencies (express, dotenv) and start/dev scripts
├── ivt_criteria_schema.json     # Fixed IVT eligibility criteria (inclusion/absolute/relative)
├── ivt_extraction_prompt.md     # Extraction rules and system prompt for the LLM step
├── sample_telestroke_notes.md   # 4 synthetic test notes (see Testing below)
├── public/
│   ├── index.html               # Two-panel UI (note + checklist)
│   ├── style.css
│   └── app.js                   # Row rendering, evidence highlighting, eligibility banner logic
├── .env.example                 # Template for required environment variables
└── .gitignore                   # Excludes .env -- API key never committed
```

### Running locally

```bash
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY to .env
npm start                 # or: npm run dev
```
Open `http://localhost:8787` in a browser.

### Testing approach

Rather than testing against one "happy path" note, the extraction logic is
checked against four synthetic notes deliberately built to exercise distinct
behaviors:
- **Complete documentation** -- confirms clean extraction when the note
  cooperates
- **Ambiguous anticoagulation** -- the core test case: a listed medication with
  unconfirmed adherence should resolve to "unknown," not a guessed yes/no
- **Missing history / unidentified patient** -- confirms the "history
  unobtainable" override correctly forces unresolved criteria to "unknown"
  rather than defaulting to "no"
- **Clear absolute contraindication** -- confirms the tool correctly flags a
  hard stop (recent neurosurgery) rather than only handling ambiguity well

## Future direction & The Stroke Copilot Ecosystem

This prototype currently reads a single, isolated telestroke note per case. That
is a deliberate simplification for the current demo, not the intended end
state. The planned next stages:

1. **Multi-note, chart-level extraction.** Real telestroke decisions often
   depend on information scattered across a patient's chart history, not just
   the current encounter note -- a prior cardiology visit documenting AFib, an
   old discharge summary noting a prior ICH, a medication reconciliation from
   months ago. The next iteration would extend extraction to a synthetic
   multi-note patient chart ("synthetic EHR"), so the eligibility checklist can
   draw on a patient's full available history rather than a single note in
   isolation.
2. **A conversational layer on top of the full chart.** Once extraction works
   across a full chart rather than one note, the natural next step is a
   free-form chat interface letting a physician ask direct questions against
   that chart ("has this patient had a prior GI bleed?", "when was her last
   INR?") -- with the same evidence-linking and "I don't know, here's why"
   behavior the checklist already uses, rather than a black-box answer.

Beyond these module-specific upgrades, this tool is designed to serve as the critical decision-support node within the broader **Stroke Copilot Ecosystem**—a zero-duplicate-entry clinical pipeline aimed at minimizing cognitive load during acute codes:
* **Step 1: Bedside Capture:** Nurses rapidly compute scores via the *NIHSS Mobile Assistant*.
* **Step 2: Real-Time Logging:** Physicians track acute metrics on the fly via the *Stroke Time Tracker*.
* **Step 3: Clinical Decision Support (This Tool):** This module processes those inputs alongside the patient's chart to evaluate IVT eligibility against strict safety constraints.
* **Step 4: Automated Extraction:** The *Telestroke Quality Metric Dashboard* sweeps the finalized documentation to abstract structured data for hospital reporting.

## Disclaimer
This repository contains experimental prototype code intended solely for research, demonstration, and educational purposes. It is not an FDA-cleared medical device, nor is it a substitute for independent clinical judgment. All final clinical determinations remain the strict responsibility of the treating physician. Do not use this software for direct patient care.
