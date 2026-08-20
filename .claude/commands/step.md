---
description: Build a step from steps/ — pre-flight, build, verify, close out
argument-hint: <step number or part, e.g. 5 or 3A>
---

Build step **$1** of the Kitchen Defense plan.

## 1. Load

Read `CLAUDE.md`, then the step file for $1 in `steps/` (`NN-*.md`, or `NN-*/X-*.md` for a part of a
split step). Read only the doc sections its `Read first:` line names — not whole documents.

If `steps/NN-*.md` turns out to be an **index** (it says "this step is N sessions, paste one part
file"), stop and tell me which part to run. Do not run an index.

## 2. Pre-flight

Follow `steps/RUNNING-A-STEP.md`. Check the step against the repo as it is *now* — the files it
names, the exports it assumes, the tests it will break — and answer its three questions. Then state
the outcome in one line before touching anything:

- **clean** → build it
- **stale or self-contradictory** → say which lines, fix the step file as you go, then build
- **too wide for one session** → stop, report why, and recommend `/step-split $1`. Do not start
  building a step you have just judged too big.

## 3. Build

Work through `Build` in order. Obey the `Do not` section — it names work that belongs to a later
step, and doing it here costs more than it saves. Write the tests the `Tests` section specifies as
assertions with real numbers in them, not intentions.

If the code proves a Build item wrong mid-way, change the step file to match what you did and say
which way it went. Never silently reinterpret an item.

## 4. Verify

From `game/`: `npm run test`, `npm run lint`, `npm run type-check`, `npm run build`. All four, and
report the actual output if any fails. Do not describe the step as done with a failing command.

## 5. Close out

- Tick the acceptance checkboxes in the step file that are **objectively verified**. Leave the
  feel-based ones (`looks like a place`, `feels good`, `unambiguous at 3× speed`) unticked — those
  are mine to judge, and ticking them for me destroys the only record of what still needs looking at.
- Commit as `Step $1: <what changed>` on the current branch — no topic branch. Do not merge or push.
- Then hand me: the four command results, the unticked feel criteria as a numbered list of things to
  look at, and `npm run dev` if there is anything visual to see.
