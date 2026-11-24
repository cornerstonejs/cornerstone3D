# Cornerstone3D 6.0 Names after 6.0.0-beta.2

Rewrites the names of Cornerstone3D that changed after 6.0.0-beta.2. It is
the last step of `@cornerstonejs/cornerstone3d-6`. It needs no step before
it: it reads the names of a 6.0 beta as they stand, also where code of the
opt-in next viewports of 5.x uses them.

## Usage

On code that is on a 6.0 beta already:

```sh
npx codemod @cornerstonejs/cornerstone3d-6-api-names
```

From 5.x, with or without the opt-in next viewports, run the whole
migration, which ends with this step:

```sh
npx codemod @cornerstonejs/cornerstone3d-6
```

## Changes

The step has one file of rules per family, in `scripts/families`. A family
that has no entry yet changes nothing.

### Generic names

- `GenericViewport` becomes `BaseViewport`; `GenericVolumeViewport3D`,
  `VideoGenericViewport`, `WSIGenericViewport` and `ECGGenericViewport`
  become `VolumeViewport3D`, `VideoViewport`, `WSIViewport` and
  `ECGViewport`, in the import and in every use. A re-export keeps its
  public name (`export { BaseViewport as GenericViewport }`).
- `Types.IGenericViewport` becomes `Types.IViewport`.
- `utilities.resolveGenericViewportVolumeId` becomes
  `utilities.resolveViewportVolumeId`.
- `ViewportType.PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`,
  `WHOLE_SLIDE_NEXT` and `ECG_NEXT`, of `Enums.ViewportType` and of
  `Enums.ViewportTypes`, become `PLANAR`, `VOLUME_3D`, `VIDEO`,
  `WHOLE_SLIDE` and `ECG`. The 5.x strings `'planarNext'` and its kin are
  the work of the `viewport-types` step, which rewrites them on code of a
  6.0 beta too.
- The modules of the entry points `@cornerstonejs/core/utilities/*`,
  `@cornerstonejs/tools/utilities/*` and `@cornerstonejs/tools/tools/*` that
  6.0 renamed: `resolveGenericViewportVolumeId` becomes
  `resolveViewportVolumeId`, `genericViewportToolHelpers` becomes
  `viewportToolHelpers`, and
  `displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap`
  becomes `planarVolumeLabelmap`. A renamed name in such an import keeps its
  local name (`import { resolveViewportVolumeId as resolveGenericViewportVolumeId }`).
- Reported, manual: `utilities.isGenericViewport(...)` (true for every
  viewport in 6.0: delete the test and the branch for the other case),
  `renderingEngineExportsV2` (import each class and function by its own
  name), and `IGenericViewport`, `isGenericViewport` and
  `resolveGenericViewportVolumeId` imported from the subpaths
  `@cornerstonejs/core/types` and `@cornerstonejs/core/utilities`, an import
  of the deleted module `@cornerstonejs/core/types/IGenericViewport`, and a
  namespace import of a renamed module whose names changed.

### Display sets

None yet.

### Appearance and framing

None yet.

### Events

None yet.

### Render modes

None yet.

### Viewport members and queries

None yet.

## Reported

- Manual: each site of a removed name, and each site of a renamed name
  that the step cannot rewrite, with the reason: a receiver that only its
  name shows to be a viewport, a name imported from a path under the
  package, a moved name in brackets or in a destructuring pattern, a key
  whose value runs code where the key goes, another rewrite that overlaps
  the site. A computed key and a rest element of a destructuring pattern of
  an object whose members a rule renames. A string that holds the value of
  a renamed enum member (a listener of it compiles and never runs).
- Review: each rewritten site of a rule that names a decision of the
  guide, and two operands that the renames make the same, such as two
  events of one `||` that are one event now.
- Manual, at line 1: `the file was not analysed:` with the reason, for a
  file whose names cannot be looked up. See the README of
  `@cornerstonejs/cornerstone3d-6`.

## How the step decides

It follows the rules of the other 6.0 steps: it changes a site only where
the file shows that it is Cornerstone's. A name is Cornerstone's when it is
bound to an import of the package, to its namespace import, or to a `const`
that holds one of those (`const { Events } = Enums`); `EVENTS` of the core is
`Enums.Events`. A receiver is a viewport, an engine or a typed value as
`lib.ts` shows it (`viewportEvidence`, `isRenderingEngine`, the annotation
or cast of a binding that holds one value). An object literal reaches
Cornerstone when it is an argument of a proven call, an entry of an array
argument, or the value of a `const` passed there.

## Contributing

A lane that changes a public name adds its rule here, in the file of its
family, and its fixtures. Lanes that work in parallel edit different files:

| Family                       | File                                         | Lanes                                                              |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Generic names                | `scripts/families/generic-names.ts`          | N1                                                                 |
| Display sets                 | `scripts/families/display-sets.ts`           | N2, DS1 to DS3                                                     |
| Appearance and framing       | `scripts/families/appearance-and-framing.ts` | N3; AP1, AP2 in the table `appearance`; VS1 in the table `framing` |
| Events                       | `scripts/families/events.ts`                 | EV1, EV2                                                           |
| Render modes                 | `scripts/families/render-modes.ts`           | RM1                                                                |
| Viewport members and queries | `scripts/families/viewport-members.ts`       | RM2                                                                |

Do not edit `scripts/lib.ts`: it is an equal copy in every 6.0 step, and
`yarn validate:registry` fails when the copies differ. Do not edit
`scripts/rules.ts` for one rule; a helper that one family needs goes in its
family file.

### 1. Add the rule

A family file exports `rules`, three tables, and `rewrite(run)`. Most rules
are one line of a table. `scripts/rules.ts` documents every field. The
entries below show the shape of each kind; they are not rules of the step,
and the new names in them are not decided by this README.

```ts
export const rules: Rules = {
  exports: [
    // a top-level export, its import, its uses and its re-exports
    { name: 'GenericViewport', to: 'BaseViewport' },
    // a member of an exported object, namespace or enum
    { namespace: 'Types', name: 'IGenericViewport', to: 'IViewport' },
    {
      namespace: 'Enums.Events',
      name: 'VOI_MODIFIED',
      to: 'DISPLAY_SET_APPEARANCE_CHANGED',
      review: 'the detail has a cause',
      value: 'CORNERSTONE_VOI_MODIFIED',
    },
    // a name that moves to another object, with the import it needs
    {
      namespace: 'utilities',
      name: 'genericViewportDisplaySetMetadataProvider',
      moveTo: 'displaySetRegistry',
    },
    // a removed name: each site is reported
    { name: 'oldHelper', manual: 'call newHelper(viewport)' },
  ],
  members: [
    // a member of a viewport, an engine, a typed value or a returned value
    { receiver: 'viewport', name: 'getViewPresentation', to: 'getViewFraming' },
    {
      receiver: { returnOf: 'getViewReference' },
      name: 'dataId',
      to: 'displaySetId',
    },
  ],
  keys: [
    // a key of an object literal that reaches a Cornerstone call
    {
      in: { receiver: 'viewport', method: 'setDisplaySets', argument: 0 },
      key: 'dataId',
      to: 'displaySetId',
    },
    {
      in: { call: 'displaySetRegistry.add', argument: 1 },
      key: 'kind',
      remove: true,
    },
    {
      in: { type: 'PublicViewportInput' },
      key: 'defaultOptions.orientation',
      manual: 'read the guide',
    },
  ],
};
```

What each entry does:

- `to` renames the site; `moveTo` (exports of the core only) replaces the
  whole access with a path from the top of the core and adds its import;
  `remove` (keys) deletes the key where its value runs no code.
- An entry without `to`, `moveTo` or `remove` reports each site:
  `manual: 'text'` in `cornerstone3d-6-manual`, or `review: 'text'` alone in
  `cornerstone3d-6-review` for a name that stays and does something else.
- On a rewriting entry, `review: 'text'` puts each rewrite in the review
  list, and `manual: 'text'` is the reason of each site that it cannot
  rewrite.
- `label` replaces the name of the site in a report. The report reads
  `label` or `label: text`; without `label` it is the path of the name
  (`Events.VOI_MODIFIED`, `Types.IGenericViewport`), the member name, or
  `setDisplaySets: the key dataId`.
- `package` names another package than `@cornerstonejs/core`, such as
  `@cornerstonejs/tools`.
- Two names that become one name (two events into one) need nothing more:
  the step reports two operands that the renames make the same.

What a table cannot say goes in `rewrite(run)` of the family. It runs before
the tables of every family. Use the helpers of `rules.ts` (`pathOf`,
`importOf`, `receiverEvidence`, `report`, `noteRewritten`) and of `lib.ts`;
add edits with `run.edits.add(...)` and core imports with
`run.imports.ensure(...)`, never by editing an import statement of the core
directly. Put the start of each node you rewrite or report in
`run.handled` (`report` and `noteRewritten` do it), so that the tables leave
it.

A rename must not lead to a name that another entry renames again: the step
runs once, and the idempotency check runs it on its own output.

### 2. Add four fixtures

Each fixture is a folder with `input.<ext>`, `expected.<ext>` and, when the
step reports a site, `metrics.json`. Name the folders after the family, so
that two lanes never add the same folder:

| Fixture                  | Folder                                       | What it shows                                                                                                                                                 |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One that rewrites        | `tests/typescript/<family>-<rule>`           | every shape the rule rewrites, with its report entries                                                                                                        |
| One that must not change | `tests/typescript/<family>-<rule>-negative`  | the same names on objects that are not Cornerstone's, such as OHIF's `DisplaySetService.EVENTS` or its own `LutPresentation`: `expected.ts` equals `input.ts` |
| An edge case             | `tests/typescript/<family>-<rule>-edge`      | a shape between the two: a name bound by a `let`, a shadowing name, a quoted or bracketed key, a re-export, a name taken already                              |
| A `.js` file with JSX    | `tests/tsx/<family>-<rule>-jsx-in-a-js-file` | `input.js` with JSX: the step looks its names up on the syntax tree there                                                                                     |

The fixtures of `.ts` files are parsed as TypeScript; put `.tsx`, `.js`,
`.jsx`, `.mjs` and `.cjs` fixtures in `tests/tsx`. Write `input` by hand,
then let the tool write `expected` and `metrics.json`, and read both:

```sh
cd packages/codemods/registry/cornerstone3d/6/api-names
npx codemod jssg test -l typescript -u --filter <family>-<rule> scripts/api-names.ts tests/typescript
npx codemod jssg test -l tsx -u --filter <family>-<rule> scripts/api-names.ts tests/tsx
```

### 3. Run only your fixtures

From `packages/codemods`:

```sh
node scripts/test-registry-packages.mjs --package 6/api-names --filter <family>-<rule>
```

It runs the fixtures whose name holds the filter, then runs the step on
their `expected` files, which must not change. Without `--filter` it runs
every fixture of the package, with the self-test of the table engine
(`tests/self-test`, made-up names, run with `scripts/self-test.ts`).

### 4. Run the rule on real code

From `packages/codemods`, run the step on this repository's examples and
tests, and on the code blocks of the docs (`--markdown`), without writing
anything (`--dry-run`), and read what it rewrote and reported, per rule and
per file:

```sh
node scripts/run-registry.mjs --dry-run --steps api-names --diff /tmp/api-names.diff \
  ../*/examples ../*/test
node scripts/run-registry.mjs --dry-run --steps api-names --markdown \
  ../docs/docs/concepts ../docs/docs/how-to-guides ../docs/docs/tutorials \
  ../docs/docs/getting-started ../docs/docs/contribute ../docs/docs/examples.md
```

Leave `docs/migration-guides` out: its code shows the old names on purpose.
A site that the rule should rewrite or report and does not is a new
fixture, not a hand edit. Without `--dry-run` the runner writes the changed
files back. The README of `packages/codemods` describes the runner and the
measure of the whole migration.

## Development

From `packages/codemods`:

```sh
node scripts/test-registry-packages.mjs --package 6/api-names
npx codemod workflow validate -w registry/cornerstone3d/6/api-names
```
