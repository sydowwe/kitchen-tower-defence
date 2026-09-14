# Step 13 — The noise meter — **MILESTONE: Act I complete**

> This step is two sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 12.

## Goal

Make power cost something. Every tower already carries a `noise` value and `combatSystem` has been
publishing it on `towerFired` since step 6B — now it accumulates, and when it fills, a human walks
in, everything on the board runs for the skirting board, and you pay for the night in crumbs and
tower HP. This is the mechanic people describe to each other; the two parts below are the simulation
and the way it is felt.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](13-noise/A-meter-and-wake.md) | The meter, the wake, and what it costs | `core/systems/noise.ts`, the banked/unbanked split in `economy.ts`, fleeing in `movement.ts` / `resolve.ts`, `NoiseState` and the `humanWoke` event, the three noise installations |
| [B](13-noise/B-noise-on-screen.md) | Noise on screen | the dev panel that fires a wake on demand, then `TopBar.vue`'s meter, the per-shot ripple, the warm wash and desaturation in `render/`, `WakeCard.vue`, projected noise on the shop card and the ghost |

Strictly in order. B draws what A publishes.

**A carries every test this step has.** The meter, the flee, the forfeits and the tower damage sweep
share one suite because they share one assertion — that the cap fills exactly once and everything
below it is consequence — and splitting them costs the test that catches a double wake. B adds none,
by `../analytic-docs/ARCHITECTURE.md` §7, and says so in its own `Tests` section so it doesn't invent
coverage to look thorough.

B opens by building its own instrument: a dev panel with a "wake now" button and the three
installation toggles. It is fifteen minutes of work and it is what lets the rest of that session look
at the wash twenty times in two minutes instead of playing to the cap each time.

## The seam that can't be split

**The wake and the banked/unbanked income pool are one session.** The pool exists only so a wake can
take it, and the invariant that makes it correct — spending draws the unbanked pool down first, so a
wake after a big build forfeits nothing and the wallet can never go negative — is only visible when
the same session writes both the earn path and the forfeit. Put the pool in its own part and it lands
as an unread field that the wake part then has to re-derive the rules for.

## Balance is step 22's, and this is what it is being handed

**Neither part tunes a noise number.** Not the cap, not the decay, not a tower's `noise`. The
arithmetic below says the question needs a measurement rather than a judgement, and step 22 is the
step that measures — it already lists peak noise, wake count and a sweepable noise decay among its
metrics. `OPEN-QUESTIONS.md` §3 has been carrying the question since before any of this existed.

The arithmetic, so the milestone play-through knows what it is looking at and does not "fix" it:

- A Mousetrap is `noise: 2` every 396 ticks — **0.30/sec**, and only while something is inside its
  range of 1.
- A Toaster is `noise: 3` every 200 ticks — **0.90/sec**, and only while something is in the air
  inside its range of 4.
- Decay is **1.5/sec**, always.

So five Mousetraps firing without a pause merely hold the meter level, and the tenth is what makes it
climb at 1.5/sec. If Act I turns out unable to reach the cap at all, that is exactly the failure
`OPEN-QUESTIONS.md` §3 names — "the mechanic is inert until Act IV, which defeats the point of
shipping it early" — and it is a finding to carry to step 22, not a number to move here.

## Step acceptance

- [ ] Waking a human hurts, is clearly your own fault, and does not end the night.
- [ ] Loud towers are a real decision — a Toaster-heavy air defence and a quiet ground line have
      visibly different noise profiles.
- [ ] Nights 1–8 are all winnable and all require different builds.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## **MILESTONE: Act I**

Ten towers, six enemies, statuses, flyers, barricades, upgrades, targeting, crumbs, noise. This is a
complete-feeling tower defence game.

Play all eight nights start to finish before continuing. Check specifically: does difficulty rise
smoothly, does each new tower feel like it opens something, and can you afford roughly 1.5 new towers
per night? If income is off, fix it here — Act II content will only obscure the problem. If *noise*
is off, write down what you saw and leave it for step 22.

## Do not

Buy installations with Grocery Money, unlock towers per night, or pay a night out — all step 20's.
A authors the three noise installations as content and B exposes them as dev toggles; nothing spends
Grocery Money in this step.
