# Step 13 — The noise meter — **MILESTONE: Act I complete**

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 12.

## Goal

Make power cost something. Every tower already carries a `noise` value and `combatSystem` has been
publishing it on `towerFired` since step 6B — now it accumulates, and when it fills, a human walks
in, everything on the board runs for the skirting board, and you pay for the night in crumbs and
tower HP. This is the mechanic people describe to each other; the three parts below are the
simulation, the way it is felt, and whether the numbers actually reach the cap in Act I.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](13-noise/A-meter-and-wake.md) | The meter, the wake, and what it costs | `core/systems/noise.ts`, the banked/unbanked split in `economy.ts`, fleeing in `movement.ts` / `resolve.ts`, `NoiseState` and the `humanWoke` event |
| [B](13-noise/B-noise-on-screen.md) | Noise on screen | `TopBar.vue`'s meter, the per-shot ripple, the warm wash and desaturation in `render/`, `WakeCard.vue`, projected noise on the shop card and the ghost |
| [C](13-noise/C-counterplay-and-the-curve.md) | The three installations, the dev toggles, and the Act I noise curve | `core/content/installations.ts`, a dev panel, the night 1–8 pass, the answer to `OPEN-QUESTIONS.md` §3 |

Strictly in order. B draws what A publishes; C tunes numbers A authored blind and needs B on screen
to judge the one claim that is about feel.

**A carries every test this step has.** The meter, the flee, the forfeits and the tower damage sweep
share one suite because they share one assertion — that the cap fills exactly once and everything
below it is consequence — and splitting them costs the test that catches a double wake. B and C add
none, by `../analytic-docs/ARCHITECTURE.md` §7; each says so in its own `Tests` section so neither
invents coverage to look thorough.

The noise numbers are authored twice on purpose. A ships the doc's cap 100 and decay 1.5/s as they
stand and does not tune them; C measures whether Act I can reach the cap at all and re-tunes. Judging
the curve in A means judging it with no meter on screen and no dev toggles to vary it with.

## The seam that can't be split

**The wake and the banked/unbanked income pool are one session.** The pool exists only so a wake can
take it, and the invariant that makes it correct — spending draws the unbanked pool down first, so a
wake after a big build forfeits nothing and the wallet can never go negative — is only visible when
the same session writes both the earn path and the forfeit. Put the pool in its own part and it
lands as an unread field that the wake part then has to re-derive the rules for.

## Step acceptance

- [ ] Waking a human hurts, is clearly your own fault, and does not end the night.
- [ ] Loud towers are a real decision — a Toaster-heavy air defence and a quiet ground line have
      visibly different noise profiles.
- [ ] Nights 1–8 are all winnable and all require different builds.
- [ ] `OPEN-QUESTIONS.md` §3's "Noise cap 100 with 1.5/s decay" is answered with a measurement, not
      an opinion, and struck through the way 11C struck the fruit fly gap.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## **MILESTONE: Act I**

Ten towers, six enemies, statuses, flyers, barricades, upgrades, targeting, crumbs, noise. This is a
complete-feeling tower defence game.

Play all eight nights start to finish before continuing. Check specifically: does difficulty rise
smoothly, does each new tower feel like it opens something, and can you afford roughly 1.5 new towers
per night? If income is off, fix it here — Act II content will only obscure the problem.

## Do not

Buy installations with Grocery Money, unlock towers per night, or pay a night out — all step 20's.
C exposes the three noise installations as dev toggles and nothing else.
