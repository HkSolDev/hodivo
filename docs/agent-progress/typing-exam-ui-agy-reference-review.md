# AGY reference review — 13 November 2026

Observed status: SUCCESS. Conversation: 18faf1bb-acd9-428e-bb5e-41c606996940. Static review only; no browser checks. Coordinator verified the navy tokens and stacked grid rows against exam.css. Landmark wording is advisory: no claim of official platform identity. Final-text character counts must not be called physical keystrokes.

# UI/UX Reference-Fidelity Checklist: Typing Exam Replica (exam-v1)

**Review Baseline:** `e5876be` | **Batch:** `typing-exam-execution-20261113`
_Scope Limitation:_ No runtime or live browser inspection has been performed. This evaluation is derived strictly from static analysis of `index.html`, `exam.css`, and the `exam-v1` frozen contract.

---

### Desktop Visual Landmarks & Design System

- **Palette:** TCS iON dark navy header (`--ion-brand-dark: #0f2744` to `--ion-brand-primary: #1b3a57`), neutral canvas (`#f0f2f5`), white card surfaces (`#ffffff`), slate borders (`#cbd5e1`/`#e2e8f0`), and red brand accent (`#dc2626`).
- **Header & Controls:** 4-row layout: header with red iON badge, exam metadata, node ID, candidate profile card, and color-coded status timer (`--safe`, `--warning`, `--critical`); followed by toolbar with passage selector, `A-`/`A`/`A+` zoom controls, backspace pill, and live stroke counters.
- **Panels & Typography:** Split 50/50 stacked layout (`.ion-split-screen`). UI in system sans-serif (`--ion-font-ui`); passage and input locked to authentic serif (`"Times New Roman", serif`), synchronized via `--passage-font-size: 15px` and `--passage-line-height: 1.7`.
- **Footer:** Left exit link + warning text; right secondary reset and primary submit (`#0284c7`) buttons.

---

### Actionable Reference-Fidelity & Responsive Checklist

1. **Layout Shell & Overflow Isolation (`html`, `body`, `.ion-exam-layout`)**
   _Hazard:_ Hardcoded `height: 100vh; overflow: hidden;` clips the interface when resized or at 200% zoom.
   _Action:_ On 1440/1920px viewports, preserve fixed viewport height. At 320/390/568/834px and 200% zoom, allow container scrolling or adapt grid row sizing so controls never become unreachable.

2. **Header Neutrality & Wrap (`.ion-header`, `.ion-brand-badge`, `.ion-candidate-card`)**
   _Hazard:_ Reference hardcodes dummy candidate PII (`RAMESH K. SHARMA`, roll number) and fixed margins.
   _Action:_ Retain visual hierarchy and red badge, but use neutral simulation labels (per Contract §2). Wrap items flexibly below 768px; hide auxiliary node badges before clipping the timer.

3. **Timer Semantics & Live Announcement Bug (`.ion-timer`, `.ion-timer__digits`)**
   _Hazard:_ Reference marks the countdown container `aria-live="polite"`, causing screen readers to announce every second.
   _Action:_ Keep visual font-mono countdown and color transitions (green/amber/red pulse), but remove second-by-second ARIA live chatter; announce only at critical milestones (e.g., 5m, 1m, expiry).

4. **Toolbar & Counter Flow (`.ion-toolbar`, `.ion-toolbar__stats`, `.ion-stat-pill`)**
   _Hazard:_ Fixed row toolbar causes horizontal overflow on 320px/390px viewports.
   _Action:_ Allow toolbar controls (zoom, backspace pill) and counters to wrap into compact flex-rows without pushing panels off-screen.

5. **Passage/Editor Typography Sync (`.ion-passage-content`, `.ion-typing-textarea`)**
   _Hazard:_ Font zoom buttons alter `--passage-font-size`, risking misalignment under 200% browser zoom.
   _Action:_ Preserve Times New Roman styling across both panels; ensure font-zoom scaling combines cleanly with browser zoom without breaking text boundaries or clipping line heights.

6. **Split-Screen Panel Balancing (`.ion-split-screen`, `.ion-panel`)**
   _Hazard:_ `grid-template-rows: 1fr 1fr` crushes the typing area on short screens (e.g., 568px landscape or mobile virtual keyboard).
   _Action:_ Desktop retains 1:1 ratio. On mobile/virtual keyboard mode, allow the master panel to shrink to a scrollable window (min 80–95px) while reserving active focus space for the textarea.

7. **Keyboard Shortcuts & Tab Integrity (`.ion-typing-textarea`)**
   _Hazard:_ Reference CSS disables user-selection (`user-select: none`); test engines often suppress Tab and zoom keys.
   _Action:_ Never suppress browser shortcuts, native zoom, or Tab navigation. Block paste/drop per contract, but provide an explicit insert-tab UI button rather than trapping Tab key cycles.

8. **Footer Action Adaptations (`.ion-footer`, `.ion-footer__actions`, `.ion-btn`)**
   _Hazard:_ Wide flex space collapses on narrow screens (320px), potentially clipping the primary submit button.
   _Action:_ Stack warning text above actions or condense on mobile so "Reset Exam" and "Submit Examination" remain prominent and tap-accessible.

9. **Submit Dialog Focus & Height Containment (`.ion-modal`, `.ion-modal__dialog`)**
   _Hazard:_ Fixed centering modal lacks focus traps and overflows vertically on low-height screens (568px).
   _Action:_ Implement accessible modal mechanics (dialog focus lock, restore on cancel, Escape key support) and add `max-height: 90vh; overflow-y: auto`.

10. **Simulation Completion vs. Bogus Official Scoring (`.ion-modal__dialog--result`, `.ion-score-card`)**
    _Hazard:_ Reference modal renders an official "Qualified" badge and SSC calculation.
    _Action:_ Contract mandates `scoringAvailable=false`. Render raw completion metrics (time taken, total strokes) without inventing SSC pass/fail decisions or speculative formulas.
