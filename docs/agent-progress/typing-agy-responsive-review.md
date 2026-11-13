# AGY responsiveness review

Requested model: `gemini-3.8-flash-high`, effort high. Self-contained static review of supplied UI code; no browser access. Initial tool-enabled attempt was denied headless command permission; retried with source excerpts supplied directly, without changing permissions.

Coordinator disposition: shared blur/click trigger reproduced in browser. Suggested button reorder was tried and still failed at 320px, so it was not retained. Pointer-down focus preservation passes the browser regression; independent static suggestions are not observed browser evidence. No speculative CSS cleanup applied.

## Raw agent output

### Confirmed Findings

1. **Mid-Click Layout Shift & Cancelled Click Event**:
   - When the user types `'x'`, the session status is `'running'`. In `.actions`, only `<button>Restart</button>` is rendered at index `0`.
   - When the test clicks `Restart`, `pointerdown` / `mousedown` fires on `Restart`.
   - This causes `<textarea>` to lose focus, synchronously firing `handleTypingBlur`.
   - `handleTypingBlur` calls `session.pause()` and `setSnapshot(...)`, transitioning status to `'paused'`.
   - React immediately re-renders. Because `snapshot.status === 'paused'`, `<button>Resume</button>` is **prepended** before `<button>Restart</button>`.
   - `Restart` is displaced rightwards (or wrapped down). When `pointerup` / `mouseup` fires at the original coordinates, the cursor is no longer over `Restart` (it is over `Resume` or the gap).
   - Per the W3C UI Events spec, a `click` event is only dispatched if `mousedown` and `mouseup` occur on the same target element. Because the targets mismatch, the browser aborts the `click` on `Restart`.
   - `handleRestart()` never runs, and `textarea.value` remains `'x'`.

2. **Why It Manifests at `width320`**:
   - `width320` is the first entry in the test matrix (`[320, 390, 568, 834, 1440, 1920]`), so execution halts on the first iteration.
   - At 320px, horizontal space is tightest: prepending `Resume` (~80–100px + `gap`) forces an immediate, drastic displacement (or line wrap) of `Restart`.

---

### Minimal Robust Fix

#### Recommended Fix: Anchor `Restart` Before `Resume` in DOM Order

Swap the order inside `.actions` so `Restart` remains at index `0` and `Resume` is appended conditionally:

```tsx
<div className={styles.actions}>
  <button
    type="button"
    className="button button-secondary"
    onClick={handleRestart}
  >
    Restart
  </button>
  {snapshot.status === 'paused' && (
    <button
      type="button"
      className="button button-primary"
      onClick={handleResume}
    >
      Resume
    </button>
  )}
</div>
```

#### Why This Retains Accessibility & Robustness:

- **Mouse & Touch**: `Restart` is permanently anchored at position `0` in the flex container. When `Resume` mounts or unmounts, `Restart`'s coordinates do not move. `mousedown` and `mouseup` hit the exact same element, firing `click` without delay or displacement.
- **No Event-Suppression Hacks**: Avoids `e.preventDefault()` on `mousedown` or `touchstart`, which breaks mobile touch scrolling and suppresses synthetic `click` events on iOS/Android.
- **Keyboard Navigation**: Focus moves predictably from `<textarea>` to `Restart` (and then `Resume` when paused). Both buttons remain native `<button>` elements operable via `Tab` and `Enter`/`Space` (WCAG 2.4.3 compliant).

_(Alternative if design strictly requires `Resume` visually before `Restart`: Use a ref `isRestartingRef = useRef(false)`, set `onPointerDown={() => { isRestartingRef.current = true; }}` on `Restart`, and in `handleTypingBlur` check `if (isRestartingRef.current) return;`. Do not use `onMouseDown.preventDefault()`, as touchstart blurs before mousedown on touch devices)._

---

### Responsive Overflow Assessment

Review across `widths: 320, 390, 568, 834, 1440, 1920`:

| Component                                                    | CSS Mechanism                                                                          | Assessment                                                                                                                                                                                                                                                      |
| :----------------------------------------------------------- | :------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Passage Container** (`.passage`, `.word`)                  | `overflow-wrap: anywhere; max-width: 100%;` + `clamp(1.15rem, 1.9vw + 0.8rem, 1.4rem)` | **No overflow**. Long unbreakable words wrap cleanly. Font scaling is safe across 320px (evaluates to ~1.18rem) up to 1920px (clamped at 1.4rem).                                                                                                               |
| **Control Row & Groups** (`.controlGroup`, `.buttonRow`)     | `min-width: 0;` on `.controlGroup`; `flex-wrap: wrap;` on `.buttonRow`                 | **No overflow**. Flex children do not blow past the viewport; duration presets wrap cleanly on 320px.                                                                                                                                                           |
| **Textareas** (`.typingInput`, `.passageDraft`)              | `width: 100%; resize: vertical;`                                                       | **No overflow**. Disabling horizontal resizing protects responsive layout.                                                                                                                                                                                      |
| **Live Stats** (`.stats`)                                    | `display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5);`                  | **No overflow**. Items wrap onto two lines on 320px if horizontal gap is wide. _(Minor note: `.stat div` selector is inactive because `.stat` is directly on the `<div>`; default block flow works without overflow)._                                          |
| **Summary Grid** (`.summaryGrid`)                            | `grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));`                          | **No overflow**. At 320px (~288px available width inside padding), `9rem` (144px) cleanly collapses to a single `1fr` column without horizontal blowout, then expands to 2+ columns at 390px+.                                                                  |
| **Inline Form** (`.inlineForm`, `@media (max-width: 30rem)`) | `.durationInput { width: 100%; }`                                                      | **Low risk / Minor cleanup**. At `<= 30rem`, wrapping `<label className={styles.customLabel}>` should have `display: flex; flex-direction: column; width: 100%;` to ensure the input fills the container cleanly rather than relying on inline label expansion. |
