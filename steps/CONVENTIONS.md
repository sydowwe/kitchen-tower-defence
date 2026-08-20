# How to write a step file

The format of the 23 existing steps, written down so steps 24+ match instead of drifting. Read two or three existing steps alongside this — [09](09-status-effects.md) is a representative mid-project one, [14](14-tile-state.md) is a good example of a pure-substrate step, [19](19-theft.md) of a milestone step.

---

## The shape

```markdown
# Step N — Title

> Paste this entire file as your prompt into a fresh session.

**Read first:** CLAUDE.md, <the specific doc sections that matter>
**Prereq:** step N-1.

## Goal
One paragraph. What exists at the end that didn't at the start, and why it matters.

## Build
Numbered list. Each item is a file or a system.

## Tests
Bulleted. Specific assertions, not "test the thing".

## Acceptance
Checkboxes. Observable outcomes, at least one of which is about how it *feels*.

## Do not
One or two sentences naming what belongs to a later step.
```

---

## The rules that make it work

**A step ends at something runnable.** Not "the system compiles" — something you can look at, play, or measure. If a step's output can't be observed, it's too abstract or it's two steps.

**Never restate the design.** Point at `../analytic-docs/DECISIONS.md` §4 rather than re-explaining the crumb economy. There must be exactly one source of truth, or the docs and the prompts will silently diverge. The `Read first:` line does this work — be specific about *which sections*, because "read DECISIONS.md" wastes context on nine sections when two matter.

**`Do not` is load-bearing, not decoration.** It's what stops a step sprawling into the next one's territory — the most common failure mode when an agent has momentum and the next feature is obviously adjacent. Name the specific thing and which step owns it.

**Tests are assertions, not intentions.** "Burn from a fire source against a `fungal` enemy deals per-tick damage multiplied by 1.5" is a test. "Test that DoT works" is not. Write the ones that catch *silent* drift — the damage matrix becoming an average instead of a product, a duration measured in frames instead of ticks. Bugs you'd see on screen don't need tests.

**At least one acceptance criterion should be about feel.** "Collecting a big pile feels good." "The Mousetrap's armed state is unambiguous at 3× speed from across the room." These are the ones that catch a technically-correct, unfun implementation, and they're the reason to stop and play at the end of each step.

**Flag the gotcha you can foresee.** Where you know an edge case will bite — an enemy already past a barricade when it's placed, pushback sign errors on a fleeing thief, DoT bypassing the tag matrix — say so inline in the Build section. These are the notes that save a debugging afternoon, and they're worth more than any other line in the file.

**Say when a step is proving the architecture.** Several steps have an acceptance criterion like "adding a second DPS tower requires zero changes to any system file — if it doesn't, the behaviour composition is wrong, fix it now." These checkpoints are how the data-driven-content rule stays true instead of eroding. Include one whenever a step adds to the behaviour vocabulary.

**Milestone steps get a closing section** that says stop, play it, and lists the honest questions to ask. See steps 8, 13, 19, 23.

---

## Splitting a step into parts

A step that is genuinely one milestone but too wide for one session — step 2 is the example — becomes
`NN-title.md` (an index) plus `NN-title/` holding one part file per **session**. Each part is a
complete step file in its own right: its own `Read first:` with only the sections *that part* needs,
its own Build, Tests, Acceptance and `Do not`. That's the whole point — the session building the
damage matrix should never load the tower schema.

Group by **shared reading list and shared assertions**, not one part per Build item. Files that have
to agree with each other (a schema and the vocabulary it validates) or that share a test (armor strip
asserted through `resolveDamage`) belong in the same session; splitting them costs you the test that
catches the mistake. Two to four files per part is the usual size.

The index carries the step's goal, the part table, the dependency order between parts, and the
step-level acceptance criteria. It is not something you paste as a prompt.

Prefer a single file. Split only when the parts have genuinely disjoint reading lists.

---

## Sizing

Target one focused session per step — roughly 350–500 words of prompt, two to four files touched, one new system plus the content that exercises it.

Signs a step is too big: more than one genuinely new system; a Build list past ten items; you can't write acceptance criteria without saying "and also".

Signs a step is too small: no `Do not` section is needed because there's nothing adjacent to wander into; the Tests section is one bullet; it could be a paragraph inside the previous step.

---

## Before writing steps 24+

Read [DECISION-LOG.md](../analytic-docs/DECISION-LOG.md) D17 first. The short version: don't write them speculatively. Write each drop's steps when you're about to build it, from a session that can read the actual `core/content/behaviours.ts` and see what the vocabulary became — not from the roadmap's guess at what it would be.

[ROADMAP-POST-V1.md](../analytic-docs/ROADMAP-POST-V1.md) has the durable part (stats, dependencies, drop order). The step prompts are the volatile part and they age badly.
