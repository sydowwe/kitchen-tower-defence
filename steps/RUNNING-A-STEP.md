# Before you run a step

For the session that has just been handed a step file, and for whoever is about to paste one.
`/step N` runs everything below; `/step-split N` runs the split. Both live in `.claude/commands/`.

The step files were all written before any code existed. Most of them will run exactly as written.
Some won't — because the repo drifted from what they assume, because they're wider than one session,
or because they contradict themselves in a way nobody could see in advance. This is what to do about
that, decided **before** the session starts building rather than three hours in.

[CONVENTIONS.md](CONVENTIONS.md) is the other half of this and a different job: the *format* of a
step file, read only when writing one. Nothing here is about how a step file is shaped.

---

## The pre-flight check

Cheap, and it happens before the first line of code. Read the step, then look at the repo it's
actually going to run against — the files it names, the tests it will break, the exports it assumes.
Three questions:

1. **Does what it assumes still exist?** Names, shapes, file paths. A step from the plan may
   describe a `MapDef` that three steps have since reshaped.
2. **Is it one session's work?** Signals below.
3. **Does it contradict itself, or a doc?** Step 3 specified a `T`-for-track character in the map
   grid *and* said track is derived from the polyline and never hand-painted. Both sentences, one
   file.

If all three are clean, build it and don't ceremony it further. That's the common case.

---

## Signals it won't fit one session

- More than one genuinely new system. Two is two sessions.
- A Build item that is really a **migration** of committed code — those cost far more than the one
  line they occupy in the step.
- An item that can't be *judged* until a later item exists: authoring a map before there's a
  renderer, tuning numbers before there's a harness.
- An item that is a new interactive tool rather than a system (a debug overlay, an editor panel).
- The `Do not` section has to name three different later steps to fence the work in.
- You can't write the acceptance criteria without "and also".

Two of these in one step is the threshold. `CONVENTIONS.md` § Sizing has the same list from the
authoring side.

---

## The three outcomes

**1. Build it as written.** The default. Don't split a step because it looks long; split it because
it fails the signals above.

**2. Reconcile, then build.** The step is one session's work, but its description of the repo is
stale or self-contradictory. Fix the step file's wrong lines *first*, in the same commit as the
work, saying which way each contradiction went and why. A step file that lies is worse than one that
is merely out of date, because the next reader trusts it.

**3. Split it into part files — and then stop.**

That last word is the important one. **Do not split a step and then build part A in the same
session.** The entire value of the split is that each part starts in a fresh context holding only
what it needs; spending that context on the split first throws the benefit away. Splitting is its
own session, and its deliverable is the part files plus a short report of what changed and why.

---

## How to split

The mechanics of the resulting files are in `CONVENTIONS.md` § *Splitting a step into parts* and
§ *Three sections a step earns once the codebase exists*. What matters at this point is where the
lines go:

**Group by shared reading list and shared assertions**, never one part per Build item. Two files
that have to agree with each other, or that share the test that catches the mistake, belong in one
session.

**Say which part carries the tests.** Usually one does — the headless one. Say so in the index and
in each part, so the parts with none don't feel under-tested and start inventing coverage. A part
with no tests gets a `Tests` section reading **None**, with the reason; an omitted section reads as
an oversight and gets "fixed".

**Author twice on purpose.** When a part produces something whose quality can only be judged with a
tool a later part builds, have the early part ship a structurally-correct draft and the later part
redo it properly. Say it in both parts, or the first session polishes something blind and the second
is reluctant to overwrite it.

**Settle shared format decisions once**, in the part that implements them, and let the later parts
inherit them through the code. Three sessions meeting the same open question will answer it three
ways.

**Name the seam that can't be split**, in the index — one sentence on what breaks if the line moves.
That's what stops a future session helpfully re-splitting the step.

---

## What a split costs, and when it isn't worth it

A split has real overhead: an index file, a `Read first:` per part, and a handoff contract between
them. It's worth it when the parts have genuinely disjoint reading lists — the session baking a
terrain canvas should never load the damage matrix. It is not worth it to turn one long session into
two short ones. If the parts would all read the same docs and touch the same files, the step is one
session that happens to be big.

---

## While building

**If the code proves a Build item wrong, change the step file.** The pre-flight catches what's
visible up front; the commoner failure is hitting item 4, finding it doesn't fit the code, and
quietly reinterpreting it. That leaves the file lying to whoever reads it next, and they will trust
it. Fix the line, say which way it went, and commit it with the work.

**Obey `Do not`.** It is the fence against the next step's territory, and momentum is exactly what it
was written to resist. If the adjacent feature looks trivial from here, that's the feeling the
section exists to overrule.

**Don't widen the reading list.** A step that says `CONTENT.md` §1 means §1. Reading the whole
document costs context the build needs, and it is how a session ends up implementing night 14 while
building night 1.

---

## Closing out

A step isn't done when the code works. It's done when the repo says so.

**1. Run all four.** From `game/`: `npm run test`, `npm run lint`, `npm run type-check`,
`npm run build`. Nearly every step's acceptance names them and nothing enforces them. If one fails,
report the output — a step described as complete over a failing command is worse than an unfinished
one, because nobody re-checks it.

**2. Tick the acceptance boxes you actually verified — and only those.** The checkboxes are the
ledger of what's been confirmed; git log only records that something happened. Leave every feel-based
criterion unticked: "the Counter looks like a place", "collecting a big pile feels good", "the armed
state is unambiguous at 3× speed from across the room". No session can close those. Ticking them
destroys the only list of what still needs a human to look at it.

**3. Fix what the step file got wrong**, per *While building* above.

**4. Commit.** `Step N: <what changed>`, straight onto the current branch — one commit per part of a
split step. No branch per step: steps are built one at a time, never in parallel, so a topic branch
buys nothing and abandoning a step is a `git reset`, not an unpicked merge. Don't merge or push
unless asked — the commit prefix is what makes `git log --grep "^Step"` a usable ledger, so keep it
exact.

**5. Hand over the feel checks.** The last output of the session is a numbered list of what to look
at, with `npm run dev` running if anything visual changed. This is what makes the feel criteria real
rather than decorative.

**Write nothing forward.** No handoff file, no "state of the repo" doc, no notes for the next step.
The next session's pre-flight reads the code, which is the only description that can't go stale.

---

## Worked example — step 3

The original `00-done/03-map-and-renderer.md` failed the check on all three questions: its map format
contradicted itself over hand-painted track, it assumed a `MapDef` that step 2 had since shipped
differently (`buildable: boolean[]`, cloned mutably per world), and it carried five Build items
across three new systems plus a hand-authoring pass that couldn't be done until the other two
existed.

It became an index plus three parts: the headless map format and path maths (carrying every test),
the renderer, then the debug overlay and the real map authored with it. The map is drafted in A and
re-authored in C — the author-twice rule. The rest of the step's difficulty was in ten or so silent
gotchas that only turned up by reading the committed code, and those went inline in the parts.

Read the four files as the reference for what this procedure produces.
