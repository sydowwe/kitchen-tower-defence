# Step 2B — Content pipeline: schemas and the behaviour vocabulary

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/ARCHITECTURE.md` §4, `../../../analytic-docs/CONTENT.md` §1–2.
**Prereq:** step 2A.

## Goal

The two halves of "content is data, not classes": the schema that makes a typo fail loudly at boot,
and the fixed vocabulary a tower composes itself from. Get these right and adding tower number forty
is a config object rather than a pull request against a system file.

## Build

### 1. `core/content/schema.ts`

Zod schemas for `TowerDef`, `EnemyDef`, `MapDef`, `NightDef`, `StatusDef`, `InstallationDef`. Infer
the TS types from the schemas rather than declaring them twice.

A `validateContent(defs)` entry point that runs at **module load in dev only**
(`import.meta.env.DEV`) and throws with **the offending id and field path** in the message —
`tower 'saltShaker': damage.type: expected 'chemical' | ...` beats a bare zod dump.

Notes:

- Name fields are i18n **keys** (`nameKey: 'tower.saltShaker.name'`), never strings. Schema them as
  keys with a pattern so a raw English string fails validation.
- Durations are tick counts; schema them as non-negative integers, which rejects the `1500` that was
  meant to be milliseconds only if you also bound the range — do bound the obvious ones.
- Every id is unique across its own kind; validate the collection, not just each entry.

### 2. `core/content/behaviours.ts`

The vocabulary from `../../../analytic-docs/ARCHITECTURE.md` §4 (`attack`, `coneAttack`, `aura`,
`income`, `collect`, `charge`, `barricade`, `bait`, `suppress`, `pushback`, `tileEffect`, `reveal`)
as typed factory functions returning **discriminated-union behaviour descriptors**.

**Data, not closures.** `attack({ damage: 8, ... })` returns `{ kind: 'attack', damage: 8, ... }`. A
behaviour that captures a function is a behaviour that can't be serialised into a save, diffed in a
balance report, or asserted on in a test — and it will be the first thing that breaks the replay
guarantee.

Implement only `attack` fully. The rest are typed stubs: the factory and its descriptor type exist
and are exhaustive in the union; the interpreting system doesn't.

The schema and the vocabulary have to agree — a `TowerDef`'s behaviour list is validated against the
descriptor union, which is the reason these two files are built in one sitting.

## Tests

- A valid tower def passes its schema.
- A def with a misspelled damage type throws, and the message contains the def's id.
- A def with a duplicate id in the collection throws.
- A def with a raw string where a `nameKey` belongs throws.
- `attack(...)` returns a plain object that survives `JSON.parse(JSON.stringify(b))` unchanged.
- A `switch` over the behaviour union with a `never` default compiles — the union is exhaustive.
- No behaviour descriptor has a function-typed field (type-level assertion, as in step 2A).

## Acceptance

- [x] Types are inferred from the schemas — there is no hand-written `interface TowerDef`.
- [x] Validation is stripped from a production build (verify it is inside a `DEV` branch).
- [x] A tower def is a list of behaviour descriptors and nothing else — no `class`, and no `extends`
      for behaviour. (An `interface TowerDefOf<Id> extends TowerDef` that narrows the id for
      typing is not inheritance and is fine; step 2D added one.)
- [x] Vocabulary checkpoint: sketch a second, imaginary DPS tower on paper. If expressing it would
      need a *new* behaviour kind rather than different numbers, the vocabulary is wrong and it is
      cheaper to fix here than in step 12.
      *Sketched three and ran them through the real schema rather than judging them on paper: a
      lobbed splashing chemical turret (numbers on `attack`), a point-blank burst on the track
      (`attack` + `charge` + a radius-0.5 `aura`, which is also what Cardboard Box T3's reflect
      is), and a shot that pierces along a straight line — the one shape no kind carries, and no
      v1 tower is it. The full CONTENT.md §1 roster and its eight T3 upgrades fit the twelve kinds;
      what they still want is fields owned by later steps, never a thirteenth kind.*

## Do not

Write any actual tower or enemy content — step 2D does that. Do not interpret any behaviour; the
combat system in step 6 reads `attack`. Do not implement `charge`, `aura` or `pushback` past their
type stubs (steps 10, 17, 18 own them), and do not schema fields for mechanics that don't exist yet —
the step that adds a mechanic extends its schema.
