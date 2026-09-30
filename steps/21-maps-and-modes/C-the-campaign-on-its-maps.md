# Step 21C — The campaign on its maps

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §2 (the enemy table's speeds) and
§6, `../../analytic-docs/DECISIONS.md` §3 (the paragraph on spawn points) and §10 (*What this changes*,
the third bullet), `../../analytic-docs/DECISION-LOG.md` (the step 16 row "Night 17's two winning
routes").
**Prereq:** steps 21A and 21B.

## Goal

The whole campaign as data, for the first time. Nights 4 to 18 move onto the maps `CONTENT.md` §6 gives
them, with its modifiers on nights 6, 11, 15, 16 and 18. Their enemies walk every lane those maps have,
and their molds stand where a tower on *that* map can reach them. This is a re-homing, not a balance
pass. Balance is step 22's, and it has the policies to measure with. **This part carries the
campaign's content assertions.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/nights.ts` | 18 nights. Every one has `mapId: 'counter'`, every entry has `pathId: 'crack'`, and 53 entries carry `startDistanceTiles` (the molds on nights 11, 12 and 15–18). The header and the notes above nights 4, 8, 10, 11 and 18 say they're on the Counter because the maps don't exist. The notes from night 11 on place molds by the Counter's "middle pocket" and "top run". Night 15's note says the dinner party is authored into its composition. Night 18's says it carries no modifier |
| `core/content/maps/*.json` (21A) | Six maps. Every first lane is `crack`. The Stove has two lanes and the Floor three |
| `core/content/modifiers.ts` (21B) | The five ids. `dinnerParty` doubles every entry's count through `waveEntryCount` |
| `core/systems/spawn.ts` (`cursorsFor`, `startWave`) | An entry with no `pathId` is dealt round-robin over every lane. A named lane the map doesn't have throws **mid-night**, and so does a `startDistanceTiles` past the lane's end. `crackSpawnMult` cuts lane 0 only |
| `core/world.ts` (`createWorld`) | Throws when a night's `mapId` isn't the map passed |
| `ui/views/GameView.vue` (`SEED`) | 1234. Every campaign night is played at it, so moving day's boxes land in the same place every time |
| `tests/content.spec.ts` | `describe('nights 4 to 9')`: "is authored on the Counter, on the lane the Counter actually has" pins `counter` and `crack` on every entry. **Replace it.** Keep green: the wave counts, the index order, the first-appearance specs (Beetle, Fly, Moth, Weevil and Silverfish each in its night's wave 3), the Mouse's waves (night 14's waves 6 and 11, night 17's wave 9), and "the last thing its wave releases" |
| `tests/scoring.spec.ts:25` | Builds `night05` on the Counter. That throws once night 5 is on the Sink |
| `tests/kitchenView.spec.ts` ("lists night 14 in full") | Pins night 14's composition counts and first waves |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **Re-home, don't re-balance.** Wave counts, compositions, unlocks and the file's rules stay: the
   Cookie Jar rules, one entry per mold and per Mouse, a new enemy in wave 3. What moves: the map, the
   lanes, where a mold stands, `spacingTicks` only where a lane's length breaks the night's pacing rule,
   and night 15's inflation (decision 5).
2. **Maps and modifiers per `CONTENT.md` §6:** 4–6 `sink`, 7–9 `pantry`, 10–12 `stove`, 13–15 `table`,
   16–18 `floor`. `dishesLeftOut` on 6, `dampNight` on 11, `dinnerParty` on 15, `movingDay` on 16,
   `heatwave` on 18. Nights 1–3 stay on the Counter, untouched. §6's "tutorial" on night 1 isn't a
   modifier: it's step 23's onboarding.
3. **A multi-lane night spreads by dropping `pathId`.** `startWave` deals such an entry round-robin
   over every lane. That's the schema's own mechanism, and it keeps each lane's spacing. Name a lane
   only where the night means one: a mold (it stands somewhere), a Mouse (one entry, one flight home),
   a wave built to split the defence. Leaving `crack` on every entry sends the whole night down lane 0,
   and the Stove's second lane is scenery.
4. **Every night's note names its two answers**: two loadouts it's written to fall to
   (`DECISIONS.md` §10). Step 22's `optimal` and `blind` policies are measured against them. Night 17's
   are the decision log's "non-physical" and "Lemon plus physical", not the step's "cold". The only cold
   tower in v1 lands 2.4 a hit on a Silverfish.
5. **Night 15 is authored as a plain night** (counts and spacing in night 14's range), with
   `modifierId: 'dinnerParty'`. The modifier doubles it at runtime. 15C authored the doubling into the
   file because the modifier didn't exist. Leaving that in and adding the modifier makes a night four
   times its size.
6. **A mold stands where a tower on its own map can reach it.** On night 16 that's measured against
   `createWorld(…).map` at seed 1234, after the boxes, not the authored map. "A mold nobody can shoot is
   a night that never ends" (the note above night 11), and moving day can box a pocket out.
7. **You may change a map** when a night on it shows a pocket in the wrong place: move a pocket, move a
   waypoint. Re-run `tests/maps.spec.ts` and `path.spec` when you do. A authored the maps knowing this.

## Build

### 1. Nights 4–9: the Sink and the Pantry, `nights.ts`

Single lanes, so `crack` stays. Map, night 6's modifier, the pacing check below, and every note that
names the Counter rewritten for the map it's on now.

### 2. Nights 10–12: the Stove

Two lanes, decision 3. Night 10's Moth arrives on one lane. Pick it and say which. Molds re-placed,
decision 6. Night 11's damp night.

### 3. Nights 13–15: the Table

One lane. Night 14's Mice stay in waves 6 and 11. Night 15 plain (decision 5), with its dinner party.

### 4. Nights 16–18: the Floor

Three lanes. Moving day on 16 (decision 6), the heatwave on 18.

### 5. The header, the specs, and one measurement per modifier night

The file's header says what's true now. Measure nights 6, 11, 15, 16 and 18 headless at seed 1234 on
Normal, each with one of its two named answers placed by hand. Put won or lost, and food lost, in the
commit message. A night that loses to its own named answer gets re-authored before you move on. The
two-answers proof is step 22's. This check is the floor.

Gotchas, all silent until a night is played:

- **The crossing time moved with the map.** Compute `lengthTiles / (speedTilesPerTick × 60)` per enemy
  per lane. A 45-tile lane keeps an Ant 45 seconds where the Counter kept it 31. A 22-tile Stove lane
  gives a Fly about 10 seconds in anyone's circle. The file's pacing rule (spawn window ≈ the gap after
  it) is about the stream. The crossing decides how much of it is on the board at once.
- **Round-robin sends a 1-count entry down lane 0 only.** `dealRoundRobin(1, 2)` is `[1]`. A lone
  Beetle or a pair of Moths meant to use the second lane has to name it.
- **Seal the Baseboard Crack cuts lane 0's cursors only.** On a two-lane map with round-robin entries
  it cuts about half as much of the night as on the Sink. That's the doc's own wording, "first ground
  spawn point". Leave it.
- **Night 15's molds come in pairs.** ×2 turns each `count: 1` mold entry into two molds on one tile:
  one patch growing twice as fast, and three at nightmare. Author that night's molds knowing it.
- **A named lane or a mold distance that doesn't fit throws mid-night**, several minutes in, naming the
  night. The spec below finds it in a second, so run it after every night.
- **The heatwave cools the Ice Cube Tray to ×0.7.** Night 18's two answers shouldn't lean on cold.
- **Night 6's fifteen piles hatch 35 seconds in.** Its answers are collecting them, or the Spray
  Bottle's `targets: 'both'` from night 5. The Toaster doesn't unlock until night 8.

## Tests

In `tests/content.spec.ts`, replacing "is authored on the Counter", plus `scoring.spec`'s night built on
the map it's on now.

- **The table:** every night's `mapId` and `modifierId` equal a literal table in the spec, transcribed
  from §6.
- **Lanes that exist:** every entry's `pathId`, where it has one, is a lane of its night's map, and
  every `startDistanceTiles` is shorter than that lane.
- **Every wave of every night starts on its own map:** build each night with `createWorld` on its
  `mapId` at seed 1234, then `startWave(world, night, i)` for every `i` with no throw.
- **Every lane is walked:** across those waves, the set of `spawns[].pathId` is every lane of the map.
- **Night 15 is plain:** its mean authored count per wave is no higher than night 14's. The modifier
  doubles it, and the file doesn't.
- The existing night specs stay green as they are, including `kitchenView.spec`'s night 14.

## Acceptance

- [ ] `mapId: 'counter'` appears on nights 1–3 and nowhere else.
- [ ] Every night's note says which map it's on, and its two answers.
- [ ] Nights 6, 11, 15, 16 and 18 each won once headless with a named answer, with the numbers in the
      commit.
- [ ] Played through the dev night picker, nights 10 and 16 visibly use every lane.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Re-balance: that's step 22's, and it has `blind` and `optimal`. Don't change an unlock, nights 1–3, an
enemy's stats or a modifier's numbers. Add no enemy to a night that doesn't already send it, except where
a lane needs one to walk it. Show nothing new on screen (F).
