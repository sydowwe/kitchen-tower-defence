# Open Questions and Known Risks

Things not settled, things assumed without discussion, and things most likely to need changing once the game is playable. Update this as you go — an empty section here is a section that got resolved.

---

## 1. Genuinely undecided

| Question | Why it's open | When it must be answered |
|---|---|---|
| **What does the Cookie Jar's destruction penalty actually do?** "Drops 200 crumbs to the enemy side" needs a concrete mechanic — a wave-strength boost, a burst of extra spawns, or a direct spawn of enemies worth 200. | Never specified | Step 10. Pick one and write it into `DECISIONS.md`. |
| **Does the game need a "recommended tile" placement hint?** The step 22 harness needs track-coverage scoring anyway, so exposing it to players is nearly free. | Might be helpful onboarding, might remove the interesting decision | Step 22 or 23 |
| **Is there any catch-up mechanic for a player stuck on a night?** Currently: retry with installations intact, plus 40% Grocery Money on a loss. That may not be enough on Nightmare. | Only measurable with real playtesting | After step 22's data |
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
- ~~**The fruit fly gap, nights 1–7.**~~ **Answered in step 11C.** The question was whether one Toaster can clear a rot backlog, or whether `HATCH_TICKS` (2100) and the Toaster's 0.3/sec were mistuned against each other. Measured headless on night 6 — crumbs pre-scattered, *nothing collected all night*, so every pile hatches — with a ground board carrying no Spray Bottle: **no air answer loses the night** at wave 8 of 9, 20 fruit flies leaked and the fridge emptied by them alone; **one Toaster wins it**, 16 of them shot down. One tower turns a lost night into a won one, so neither number moves. Three things the measurement also settled. The pressure is real rather than cosmetic: on a night 8 where nothing is swept, 15 of the 20 food items go to fruit flies and only 4 or 5 to the night's own authored flies, and two Toasters cannot cover both. The same night *swept* is won comfortably by the same board — so **sweeping, not the tower roster, is the dominant variable**, which is the mechanic working. And the Spray Bottle's `targets: 'both'` is the other answer to fruit flies from night 5, so the gap is nights 1–4, not 1–7.
- **Noise cap 100 with 1.5/s decay.** Whether Mousetrap (noise 2) and Toaster (noise 3) can realistically fill it in Act I is untested. If they can't, the mechanic is inert until Act IV, which defeats the point of shipping it early.
- ~~**Pushback resistance curve.**~~ **Answered headless in step 18C; still unwatched.** The question was whether the floor (what fraction of a push still lands on a fully resisting enemy) stops a stack of Fans locking a lane. Measured on night 18 on two seeds, with a fixed ground line that holds the ground and loses the night to flyers by wave 3 when nothing answers air. **One Fan earns its slot.** Two Spray Bottles alone lose at wave 11; add one Fan on the first leg of the lane and they win with 0–1 food lost, the meter flat at 1. Placement decides it: 23 of the 52 lane-side tiles give that result and 21 give nothing, at 25, 35 and 45 degrees alike. **The noise did the anti-spam job, and the draft 35% floor did not.** At the normal cap, two Fans win but wake the house 3–4 times, and three wake it every other wave; at 20% of max HP a wake, the line is gone by wave 12 and the night is lost. With the meter switched off, three overlapping Fans plus a single Spray Bottle won night 18 with no food lost, holding flyers near the spawn until the Fans' chip damage killed them. With every noise installation owned (cap 155, 2.0/sec decay), the same three won through four wakes. **So the floor moved to 25%**, keeping decay at 240 ticks and four pushes to the floor. That leaves one Fan's value where it was, and it takes four overlapping cones to hold a Moth and five to hold a Fly. Three Fans with one Spray Bottle now lose with the meter off (wave 8) and with every installation (wave 13); four still win either way. Not yet confirmed by a person playing it: whether one Fan reads as holding a door, and whether 21 dead tiles out of 52 make it feel fussy to place.
- ~~**The Honey Pot's risk/reward.**~~ **Answered headless in step 17D; still unwatched.** The question was whether 7 crumbs/sec plus a free kill zone, against losing the tower if undefended, lands strictly-good or strictly-bad. Measured on night 16 on two seeds against a fixed Salt Shaker and Toaster line, pot placed either inside the line's reach or beside the lane out of every tower's: **defended**, the 150-HP pot lived 80–120 seconds and paid 570–830 crumbs on its 175 before the feeders finished it; **undefended**, it lived 11–19 seconds and paid 75–131 back. Neither case changed the food lost, because feeders are held either way. So it has a middle, and the middle is placement: the pot pays inside a kill zone and is a donation outside one. The HP is what holds that open: at 200 an unguarded pot placed at dusk broke even, and at 250 it paid, so above ~200 it is strictly good. Not yet confirmed by a person playing it: whether a defended pot dying at the two-minute mark reads as a fair trade or as a betrayal.
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

---

## 6. Resolved

Questions from §1 that have been answered, kept with what was chosen so nobody reopens them blind.

| Question | Answer | Where |
|---|---|---|
| **How many food items should a thief be able to carry visibly?** The Mouse steals 5; five glyphs riding on one sprite may look absurd. | **Two, then a count.** The first two items taken ride on its back at shelf size, side by side along the way it is running; anything past two is a small `+N` beside them. "It has the pizza and the cheese" reads at 3×, and the number says there is more without turning the sprite into a pile of food with a tail. | Step 19C, `render/layers/entities.ts` (`drawCarry`) |
| **Endless mode: which map, and does it use installations?** Player's choice of beaten map was assumed; whether owned installations apply was not decided. | **Any of the six maps, and yes.** Endless opens for life on the first clear of any tier, on every map (every map's nights come before night 18, so all of them are beaten). A run is played at the current campaign's tier, with its installations (their loadout slots included) and every tower any campaign night unlocks, and it pays no Grocery Money: a mode with no end paying the campaign's currency would be the farm the campaign refuses. So it is neither a victory lap nor a fresh start — it is the kitchen you have, pushed until it breaks. Bests are kept per tier and per map. | Step 21E, `core/campaign.ts` (`worldOptionsForEndless`, `applyEndlessResult`) |
