# Open Questions and Known Risks

Things not settled, things assumed without discussion, and things most likely to need changing once the game is playable. Update this as you go — an empty section here is a section that got resolved.

---

## 1. Genuinely undecided

| Question | Why it's open | When it must be answered |
|---|---|---|
| **What does the Cookie Jar's destruction penalty actually do?** "Drops 200 crumbs to the enemy side" needs a concrete mechanic — a wave-strength boost, a burst of extra spawns, or a direct spawn of enemies worth 200. | Never specified | Step 10. Pick one and write it into `DECISIONS.md`. |
| **Does the game need a "recommended tile" placement hint?** The step 22 harness needs track-coverage scoring anyway, so exposing it to players is nearly free. | Might be helpful onboarding, might remove the interesting decision | Step 22 or 23 |
| **Endless mode: which map, and does it use installations?** Player's choice of beaten map is assumed; whether owned installations apply is not decided. | Affects whether endless is a victory lap or a fresh challenge | Step 21 |
| **Is there any catch-up mechanic for a player stuck on a night?** Currently: retry with installations intact, plus 40% Grocery Money on a loss. That may not be enough on Nightmare. | Only measurable with real playtesting | After step 22's data |
| **How many food items should a thief be able to carry visibly?** The Mouse steals 5; five glyphs riding on one sprite may look absurd. | Visual, not mechanical | Step 19 |
| **Audio direction.** "The noise meter must be audible" is specified; nothing else is. No decisions on music, ambience, or whether there's a soundtrack at all. | Deferred to polish | Step 23 |
| **Auth token storage for the .NET backend** — httpOnly cookie versus a token in localStorage. The cookie is the safer answer (a localStorage token is readable by any XSS) but it constrains CORS and the hosting setup. | Must be decided *with* the backend, not after it | When the backend work starts |
| **Does progression need server validation?** Recommendation is no — it's single-player, and a player editing their own save only cheats themselves. Leaderboards are the exception and *should* be validated by headless replay. | Costs far more than it's worth for progression | Only if leaderboards ship |

---

## 2. Assumed without discussion

Reasonable defaults taken silently. Each is cheap to change if you disagree.

- **Upgrades are linear**, three tiers, no branching paths. This is what the original brief specified; BTD-style branching paths were never considered.
- **One save profile**, no slots. Nights are not resumable mid-play.
- **No backend in v1**, but the seam for one is built at step 20 (see [PERSISTENCE.md](PERSISTENCE.md)). A .NET 10 backend with accounts arrives later as one more adapter.
- **No localisation.** All copy is English and hard-coded.
- **Tower repair is not a v1 feature.** A destroyed tower is gone; you rebuild it.
- **Enemies never collide or separate** — they overlap freely. Correct for the genre, but it will look odd with 150 ants on a narrow track.
- **The camera is fixed.** No pan, no zoom. The whole board is always visible, which constrains map design to 24×14.
- **Wave composition is authored, not generated**, for all 18 campaign nights. Only endless generates waves.
- **Difficulty is chosen at campaign start** and stored per-profile, not per-night.

---

## 3. Balance risks

Numbers most likely to be wrong. Step 22 exists to find out; these are the ones to look at first.

- **The income curve.** The brief's own flag: the one number that can't be adjusted after launch. Target ~1.5 affordable new towers per night in Act I falling to ~0.5 by night 18.
- **Crumb rot timings (20s / 35s).** Too short and the player is punished for playing; too long and the mechanic never bites. Watch the ratio of fruit flies generated per night against what a Toaster can clear.
- **The fruit fly gap, nights 1–7.** Nothing can target flyers until the Toaster unlocks at night 8, so rot-spawned fruit flies are unkillable for the first seven nights. This is intentional — it teaches sweeping before shooting — but if early nights generate more than two or three, it stops being a lesson and becomes a tax.
- **Noise cap 100 with 1.5/s decay.** Whether Mousetrap (noise 2) and Toaster (noise 3) can realistically fill it in Act I is untested. If they can't, the mechanic is inert until Act IV, which defeats the point of shipping it early.
- **Pushback resistance curve.** Without diminishing returns, two Fans lock a lane permanently. The ~35% floor after four rapid pushes is a guess.
- **The Honey Pot's risk/reward.** 7 crumbs/sec plus a free kill zone, against losing the tower if undefended. Could easily be strictly-good or strictly-bad; there's no middle by accident.
- **Mold's spread rate.** A permanent per-night board-space tax is unusually punishing for a mid-Act-II enemy. Watch whether night 11 is where players quit.
- **Silverfish at night 17.** 110 HP with 0.4× physical is a hard wall if the player hasn't been buying cold or chemical towers. Verify it's beatable *two* ways.

---

## 4. Technical risks

- **Canvas 2D's ceiling.** Fine for v1's worst frame (~200 enemies, ~150 particles). Act III's tile effects and particle load are where it may not hold. The renderer interface exists so a Pixi swap stays a one-file change — check frame time at the step 19 milestone and decide then.
- **Vue reactivity leaking into world state.** The single most likely performance disaster in the project. If frame time regresses after step 8, this is the first thing to check.
- **Emoji font subsetting.** Colour emoji fonts are large and awkward to subset; verify the ~200KB estimate early rather than at step 23, and confirm the subset renders on all three platforms.
- **The `charges` / `state` fields on towers** are used by increasingly many towers (Sticky Tape, Fly Paper, Mousetrap, Diatomaceous Earth, Popsicle). If they start needing per-tower special cases, the behaviour vocabulary needs widening before Act III lands on top.
- **Determinism drift.** Any accidental `Math.random`, `Date.now`, or floating-point ordering dependence silently breaks the balance harness and replays. The ESLint rules from step 1 catch the obvious cases; ordering bugs in the system sequence won't be caught by anything but a determinism test. Add one that runs the same seed twice and diffs the event log.

---

## 5. Things deliberately not designed yet

Not oversights — out of scope until v1 ships.

- Any Act III or IV content. Full stats preserved in [ROADMAP-POST-V1.md](ROADMAP-POST-V1.md), but no mechanics work done.
- Boss fight design. All four bosses have stats and a one-line special; none has an actual encounter design.
- Achievements, statistics tracking, or a progression screen beyond the kitchen hub.
- Any narrative framing beyond the premise. No characters, no text between nights, no ending.
- Steam/Electron packaging, mobile, or controller support.
