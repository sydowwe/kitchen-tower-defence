---
description: Split an oversized step into session-sized part files — and stop there
argument-hint: <step number, e.g. 20>
---

Split step **$1** into part files. This session produces **prompts, not code**.

## 1. Load

Read `CLAUDE.md`, `steps/RUNNING-A-STEP.md`, `steps/CONVENTIONS.md`, and the step file for $1. Read
`../../steps/00-done/03-map-and-renderer.md` and its three part files as the reference for what good output looks
like.

## 2. Read the repo the step will actually run against

Every file the step names, every export it assumes, every spec that would break. This is the whole
value of the split session: the part files must describe the code as it is, not as the plan guessed
it would be two months ago.

Note every contradiction you find — inside the step, or between the step and the docs — and resolve
each one deliberately.

## 3. Split

Per `steps/RUNNING-A-STEP.md` § *How to split*: group by shared reading list and shared assertions,
name which part carries the tests, apply author-twice where a part can't judge its own output, and
settle each shared format decision once, in the part that implements it.

Produce:

- `steps/NN-title.md` rewritten as an **index** — goal, part table, dependency order, the seam that
  can't be split, step-level acceptance. Not a promptable file; say so at the top.
- `steps/NN-title/X-name.md` per session — a complete step file per `CONVENTIONS.md`, with
  `Already in the repo`, `Decisions already made` (each with its reason) and, where a later part
  depends on it, `Hands to the next part`.

Put every silent gotcha you found while reading the code inline in the Build item it belongs to,
with its symptom. Those are worth more than any other line in the files.

## 4. Stop

Do **not** start building part A. The point of the split is that each part begins in a fresh context
holding only what it needs; spending that context here throws it away.

Commit the part files as `Split step $1 into session-sized part files`, then report: the parts and
what each covers, every contradiction you resolved and which way it went, and any decision you had
to make that I should overrule if you got it wrong.

Then tell me to `/clear` and run `/step $1A`.
