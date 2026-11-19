# Hodivo Typing — Engagement, Tracking & Competition Plan

**Created:** 2026-11-19  
**Status:** Proposed roadmap (start with Step 1 only; park Steps 2–6 until Step 1 is verified end-to-end per `docs/PRODUCT_CHECKPOINT.md`)

---

## 1. Current Baseline in Codebase

We are building on top of an existing foundation:

- **Database models (`prisma/schema.prisma`):**
  - `AuthUser` / `AuthSession`: Server-verified user accounts already exist.
  - `TypingExam` & `TypingExamVersion`: Stores official exam rules (`durationSeconds`, `backspacePolicy`, `editingPolicy`, `scoringMethod`, `targetWpm`, `maxErrorPercent`, `targetKeystrokes`).
  - `TypingPassage`: Stores passages with stable `id`, `examVersionId`, `contentKey`, `revision`, `title`, `text`, `contentHash`, `sourceKind`, `status`, `examYear`, `shift`.
- **Routes (`src/routes/`):**
  - `src/routes/typing-practice.ts`: `GET /api/typing/practice-passage` (currently returns a random passage).
  - `src/routes/typing-exams.ts`: `GET /api/typing/exams`, `/versions`, `/exam-versions/:versionId/passage?passageId=...` (already supports loading a specific `passageId`).
- **Client evaluators (`lib/typing/`):**
  - `evaluate.ts`, `exam-evaluator.ts`, `scoring.ts` compute WPM, accuracy, errors, and exam qualification deterministically on the client.
- **Missing today:** No attempt persistence, no streak/progress tracking, no custom user passages, no leaderboards, and no 1v1/ghost challenge support.

---

## 2. Competitor Benchmark & Hodivo's Advantage

| Competitor                              | Strengths                                                         | Weaknesses for Indian Govt Exam Aspirants                                                             |
| :-------------------------------------- | :---------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **Monkeytype / Keybr**                  | Clean UI, personal bests, streaks, custom text, mistake analytics | Generic WPM only — no SSC/RRB/High Court error % rules, no keystroke targets, no backspace-lock rules |
| **TypeRacer**                           | Real-time multiplayer racing, ghost replays, passage leaderboards | Cartoonish UI, generic quotes, zero Indian exam relevance                                             |
| **TypingBaba / IndiaTyping / Testbook** | Indian exam passages & error formulas                             | Outdated/ad-heavy UI, paywalls, weak attempt comparison, no friend challenges or modern daily loop    |

**How Hodivo beats all of them:**
Combine **Monkeytype's clean UX, streaks & custom text** + **TypeRacer's passage leaderboards & friend races** + **Real Indian Exam Rules (`TypingExamVersion`)** + **Direct connection to live Hodivo job notifications**.

---

## 3. Core Product & Engineering Principles

1. **Same Passage ID Across Practice & Exam Modes**
   - In **Practice Mode**, hide the exam/shift name (show only the Passage ID/code, e.g. `#P-42` or `passageId`) so users focus on typing without bias.
   - Support **"Retry this passage"** and **"Load by Passage ID"** in Practice Mode (`GET /api/typing/practice-passage?passageId=...`) alongside random selection.
   - In **Exam Mode**, when the user attempts the same `passageId` under official rules, show both:
     - **Exam Mode:** Last attempt vs. Current attempt + `PASS` / `FAIL` against `targetWpm` & `maxErrorPercent`.
     - **Cross-mode reference:** Practice Best vs. Exam Best on that same `passageId`.
   - Always store `passageId` + `passageContentHash` (or `revision`) on every attempt so later passage edits never corrupt historical comparisons.

2. **Retention Loop ("Come Again & Again")**
   - **Daily Streak + Streak Freeze:** 1 completed passage/day keeps the streak alive; earn 1 Streak Freeze per 7-day streak so one missed day doesn't break motivation.
   - **Snapshot Delta Card:** Immediately after finishing, show delta vs. _Last Attempt_ and _Personal Best_ (Net WPM, Error %, Backspaces).
   - **Mistake Replay:** Track top 5 mistyped words in the session and offer a 1-click **"Practice your 5 mistakes"** drill.

3. **User-Submitted Passages (`PRIVATE` → `UNLISTED` → `PUBLIC`)**
   - **Private (default):** Any logged-in user can paste and practice their own text immediately.
   - **Unlisted (share link):** 1-click link (`/typing?passage=...`) lets friends or coaching batches practice the exact same text and compare results.
   - **Public library (gated):** Require quality/moderation checks (150–5000 chars, normalized whitespace/quotes, rate limits, report button, or review approval) before appearing in the public catalogue to prevent spam, copyright abuse, and broken WPM math.

4. **Leaderboard Integrity & Anti-Cheat**
   - Disable paste (`onPaste`) in the typing input.
   - Capture lightweight session telemetry (start/end timestamps, total keystrokes, backspace count, 5–10 progress checkpoints).
   - Validate server-side on `POST /api/typing/attempts`: check elapsed duration matches timestamps, check keystroke plausibility vs. passage length, and flag/exclude impossible speeds (e.g., `> 160 WPM` or anomalous keystroke ratios) from public leaderboards.

5. **Two-Player Competition: Ghost Race First, Live 1v1 Second**
   - Build **Async Ghost Challenge** before real-time WebSockets: a user clicks _"Challenge a Friend"_ after finishing a passage; the friend opens the link and types while seeing the challenger's cursor replay smoothly from saved checkpoints. Works anytime without needing both friends online simultaneously.
   - Add **Live 1v1 Rooms** afterward via WebSocket/SSE once the async challenge proves popular.

---

## 4. Step-by-Step Implementation Roadmap

### Step 1 — Passage ID + Attempt History & Comparison _(Start Here)_

**Goal:** Logged-in users track every Practice and Exam attempt by `passageId`, retry or load a passage by ID, and compare current vs. last attempt and Practice vs. Exam performance.

- **Schema (`prisma/schema.prisma`):**
  - Add `TypingAttempt` (`id`, `userId`, `passageId`, `passageContentHash`, `mode` (`PRACTICE` | `EXAM`), `examVersionId` (nullable), `grossWpm`, `netWpm`, `accuracy`, `errorPercent`, `keystrokes`, `backspaceCount`, `durationMs`, `passedRule` (boolean nullable), `mistypedWords` (JSON nullable), `createdAt`).
  - Index `(userId, passageId, createdAt)` and `(userId, createdAt)`.
- **API:**
  - Update `GET /api/typing/practice-passage` to optionally accept `?passageId=...` (returns that specific published passage; otherwise random).
  - `POST /api/typing/attempts` (authenticated): validates payload, runs plausibility bounds, stores attempt, returns comparison summary (`previousAttempt`, `personalBest`, `otherModeBest`).
  - `GET /api/typing/passages/:passageId/summary` (authenticated): returns Practice + Exam history for that passage.
  - `GET /api/typing/history` (authenticated): paginated recent attempts for the user's dashboard.
- **UI:**
  - Show Passage ID badge on both Practice and Exam screens, plus **"Retry this passage"** and **"Open by ID"** in Practice Mode.
  - Show post-test **Last vs. Current** and **Practice vs. Exam** comparison card (for logged-out users, show local result + _"Sign in to save & compare history"_ prompt).
- **Done when:** A logged-in user completes a passage in Practice Mode, sees it saved under `passageId`, retries or loads it in Exam Mode, and sees both attempts compared accurately; signed-out visitors still type freely without errors; tests cover auth, validation, and comparison queries.

---

### Step 2 — Daily Streaks, Snapshot Summary & Mistake Drill

**Goal:** Turn typing practice into a daily habit.

- **Schema:** Add `TypingUserStats` (`userId`, `currentStreak`, `longestStreak`, `lastActiveDate`, `streakFreezes`, `totalAttempts`, `totalDurationMs`).
- **API:** Update `POST /api/typing/attempts` transaction to update streak state; add `GET /api/typing/stats`.
- **UI:**
  - Compact streak bar (`🔥 5-day streak`, 7-day activity dots, `1 freeze available`) at the top of `/typing`.
  - Post-test **"Top 5 Mistyped Words"** mini-drill button.
- **Done when:** Completing at least one passage on consecutive days increments `currentStreak`, same-day repeats don't double-count, and the mistake drill launches immediately from results.

---

### Step 3 — User-Submitted Passages (`PRIVATE` & `UNLISTED` Share Links)

**Goal:** Let users paste their own passages, practice/track them by ID, and share with friends via link.

- **Schema:** Extend `TypingPassage` (or add `CustomTypingPassage` sharing the same attempt foreign key design) with `ownerUserId`, `visibility` (`PRIVATE` | `UNLISTED` | `PUBLIC`), and normalized `contentHash`.
- **API:** `POST /api/typing/custom-passages` (authenticated, text normalizer, 150–5000 char guard, rate-limited), `GET /api/typing/custom-passages` (user's own list), `DELETE /api/typing/custom-passages/:id` (owner check).
- **UI:** "My Passages" tab + "Paste Custom Passage" modal + 1-click "Copy Share Link".
- **Done when:** A user creates a custom passage, practices it, tracks attempts on it, and a second user can open the `UNLISTED` link and see their own attempt history separately.

---

### Step 4 — Per-Passage Leaderboards & Verification

**Goal:** Friendly competition on any shared or official passage without leaderboard spam.

- **Schema:** Add `isVerified` / `verificationStatus` and `checkpoints` (JSON, optional) on `TypingAttempt`; index `(passageId, mode, isVerified, netWpm DESC)`.
- **API:** `GET /api/typing/passages/:passageId/leaderboard?mode=EXAM|PRACTICE` returning Top 20 (best verified attempt per user) + current user's rank.
- **Anti-cheat:** Server-side plausibility checks on keystroke rate, elapsed time vs. timestamps, and paste prevention.
- **Done when:** Leaderboard shows one best score per user per mode, excludes flagged attempts, and shows the signed-in user's exact rank.

---

### Step 5 — Async Friend Challenge ("Ghost Race")

**Goal:** Let two users race on the exact same passage without needing to be online together.

- **Schema:** Add `TypingChallenge` (`id`, `code`, `passageId`, `mode`, `examVersionId`, `creatorUserId`, `creatorAttemptId`, `expiresAt`). Store 10–20 lightweight progress checkpoints (`[{ tMs, chars }]`) on `TypingAttempt`.
- **UI:** _"Challenge a Friend"_ button generates a shareable URL; the opponent sees a live moving **Ghost Cursor** representing the challenger's real pace and finishes with a side-by-side comparison card.
- **Done when:** Challenger finishes → shares link → friend types against live ghost replay → both see head-to-head WPM, accuracy, and error comparison.

---

### Step 6 — Real-Time 1v1 Live Rooms

**Goal:** Simultaneous head-to-head typing with live progress bars.

- **Infra/Schema:** Ephemeral `TypingRoom` (`roomCode`, `passageId`, `mode`, `hostUserId`, `guestUserId`, `status`: `WAITING` | `COUNTDOWN` | `ACTIVE` | `FINISHED`) + WebSocket/SSE channel broadcasting throttled 500ms `{ progressPct, wpm, errorCount }` updates.
- **UI:** Create/Join room by 6-char code, Ready toggle, 3-2-1 countdown, live opponent progress bar, and instant Rematch button.
- **Done when:** Two users join a room, start together on the same countdown, watch live progress, and get a shared final scoreboard.
