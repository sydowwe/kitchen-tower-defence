# How to write a step file

The format of the 23 existing steps, written down so steps 24+ match instead of drifting. Read two or three existing steps alongside this — [09](09-status-effects.md) is a representative mid-project one, [14](14-tile-state.md) is a good example of a pure-substrate step, [19](19-theft.md) of a milestone step, and [03](03-map-and-renderer.md) of a step split into parts that rewrites code an earlier step shipped.

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

## Three sections a step earns once the codebase exists

Steps 1 and 2 were greenfield: a session started from the docs and wrote new files. From step 3 on,
a step mostly *changes* committed code, and the failure mode changes with it. The session no longer
struggles to know what to build — it struggles to know **what is already there**, and it burns its
first third rediscovering facts that were sitting in front of whoever wrote the step.

These three sections are the fix. Add one when it applies. Don't pad a step with empty ones, and
don't add them to a step that genuinely writes only new files.

### `## Already in the repo`

A small table: the files the step will edit, and what is in them today. Name the **symbol**, not
just the file — `world.ts` is a shrug, `cloneMapDef() in world.ts:38 — the world gets its own
mutable copy` is a constraint the session can design against.

Include:

- every file whose contents the step replaces, and the line or block it lives in
- **the specs that will break.** A session that discovers `tests/world.spec.ts` fails halfway
  through will either patch the test badly or panic and revert good work. Told up front, it plans
  for it.
- anything committed with a comment that is *about* this step, especially if that comment is now
  wrong. Stale comments left by an earlier step are a normal cost of a plan written in advance; say
  so rather than letting the session treat it as authority.

This is the cheapest section to write and the one that saves the most, because the only alternative
is the session grepping for it.

### `## Decisions already made`

Numbered, one line each, each with **its reason on the same line**. Use it when writing the step
forced you to settle something — a data format, where a file lives, a name — that the session would
otherwise re-derive from scratch.

Two things make it worth a section rather than prose scattered through `Build`:

- **A split step needs one answer, not three.** If parts A, B and C each meet the same question
  in their own session, they will each answer it differently and part C spends its time
  reconciling. The decision belongs in the part that *implements* it, and the later parts inherit
  it through the code.
- **Overriding needs a single place to look.** End the section by saying an override is allowed but
  must be written back into the file. A prompt whose decisions have been silently overruled is
  worse than one with no decisions in it.

Give the reason even when it feels obvious. "Plain `number[]`, not `Uint8Array`, because a typed
array doesn't survive the JSON round-trip that `world.spec.ts` asserts" is a decision a session will
keep. "Use `number[]`" is one it will quietly improve on.

### `## Hands to the next part`

Split steps only. A code block of the exported signatures the following part builds against:

```
core/path.ts   samplePath(path: Path, distance: number): { x: number; y: number; angle: number }
               totalLength(path: Path): number
```

Step 2's parts had to infer each other's shapes from the index and from prose. Four lines of
signature prevents the next session opening with a refactor. It doubles as an acceptance criterion —
if those exports don't exist with those names, the part isn't done.

---

## The rules that make it work

**A step ends at something runnable.** Not "the system compiles" — something you can look at, play, or measure. If a step's output can't be observed, it's too abstract or it's two steps.

**Never restate the design.** Point at `../analytic-docs/DECISIONS.md` §4 rather than re-explaining the crumb economy. There must be exactly one source of truth, or the docs and the prompts will silently diverge. The `Read first:` line does this work — be specific about *which sections*, because "read DECISIONS.md" wastes context on nine sections when two matter.

**`Do not` is load-bearing, not decoration.** It's what stops a step sprawling into the next one's territory — the most common failure mode when an agent has momentum and the next feature is obviously adjacent. Name the specific thing and which step owns it.

**Tests are assertions, not intentions.** "Burn from a fire source against a `fungal` enemy deals per-tick damage multiplied by 1.5" is a test. "Test that DoT works" is not. Write the ones that catch *silent* drift — the damage matrix becoming an average instead of a product, a duration measured in frames instead of ticks. Bugs you'd see on screen don't need tests.

**At least one acceptance criterion should be about feel.** "Collecting a big pile feels good." "The Mousetrap's armed state is unambiguous at 3× speed from across the room." These are the ones that catch a technically-correct, unfun implementation, and they're the reason to stop and play at the end of each step.

**Flag the gotcha you can foresee.** Where you know an edge case will bite — an enemy already past a barricade when it's placed, pushback sign errors on a fleeing thief, DoT bypassing the tag matrix — say so inline in the Build section. These are the notes that save a debugging afternoon, and they're worth more than any other line in the file.

A gotcha is worth writing when it is **silent**: the code runs, the tests pass, and the damage shows up three steps later. "The offscreen canvas doesn't inherit the live context's DPR transform — the symptom is terrain drawn at quarter size in the top-left" is worth four lines. "Remember to handle errors" is worth none. Where you can, name the *symptom* as well as the cause; that's what makes it recognisable at the moment it happens rather than after the search.

**Write the step from the code, not from memory.** A step that touches committed files has to be written by someone who just read them. The plan was drafted before any of it existed, so a step's own description of a file is the oldest thing in the repo — the map format that step 3 originally specified had a hand-painted `T` for track *and* a sentence saying track is derived and never hand-painted, which is a contradiction nobody could have seen in advance. Reconcile it when you write the part files, and say in the file which way it went.

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

This section is the *format* of a split step. Deciding whether a step needs splitting at all, and
where the lines go, is a different job at a different moment — [RUNNING-A-STEP.md](RUNNING-A-STEP.md)
owns it.

---

## Sizing

Target one focused session per step — two to four files touched, one new system plus the content
that exercises it.

**Roughly 350–500 words of prompt for a greenfield step.** A step that rewrites committed code runs
longer, because `Already in the repo` and `Decisions already made` are paid for in the prompt to be
saved in the session; 600–1000 is normal and step 3A is 1400. The test isn't the word count, it's
whether each line **removes work from the session**:

| Earns its length | Doesn't |
| --- | --- |
| A file, a symbol and what's in it today | A description of a file the session will read anyway |
| A decision plus the reason it's not the obvious one | A decision with no reason — the session will overrule it |
| A silent gotcha and its symptom | A restatement of a rule already in `CLAUDE.md` |
| An assertion with the number in it | "Add tests for this" |
| A signature the next part depends on | Prose describing an interface |

If a paragraph doesn't fit the left column, it belongs in a doc under `analytic-docs/` and the
`Read first:` line should point at it instead.

Signs a step is too big: more than one genuinely new system; a Build list past ten items; you can't write acceptance criteria without saying "and also".

Signs a step is too small: no `Do not` section is needed because there's nothing adjacent to wander into; the Tests section is one bullet; it could be a paragraph inside the previous step.

---

## Before writing steps 24+

Read [DECISION-LOG.md](../analytic-docs/DECISION-LOG.md) D17 first. The short version: don't write them speculatively. Write each drop's steps when you're about to build it, from a session that can read the actual `core/content/behaviours.ts` and see what the vocabulary became — not from the roadmap's guess at what it would be.

[ROADMAP-POST-V1.md](../analytic-docs/ROADMAP-POST-V1.md) has the durable part (stats, dependencies, drop order). The step prompts are the volatile part and they age badly.
