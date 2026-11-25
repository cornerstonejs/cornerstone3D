# Cornerstone3D Codemods

Codemod registry packages for Cornerstone3D migrations. These are published to
the Codemod registry so users run them with `npx codemod`.

## Usage

Run the full Cornerstone3D v5 migration:

```sh
npx codemod @cornerstonejs/cornerstone3d-5
```

Run only the Generic Viewport migration:

```sh
npx codemod @cornerstonejs/cornerstone3d-5-generic-viewport
```

Run the full Cornerstone3D 6.0 migration, from the latest 5.x:

```sh
npx codemod @cornerstonejs/cornerstone3d-6
```

It prints the sites that it leaves to you as the metrics
`cornerstone3d-6-manual` and `cornerstone3d-6-review`. See
[registry/cornerstone3d/6/README.md](registry/cornerstone3d/6/README.md).

## Registry Packages

This workspace currently includes:

- `@cornerstonejs/cornerstone3d-5`: runs all available Cornerstone3D v5
  migration packages in the recommended order.
- `@cornerstonejs/cornerstone3d-5-generic-viewport`: migrates removed
  RenderingEngine viewport accessor APIs.

The Generic Viewport migration changes:

- `getStackViewports()` -> `getViewports().filter(utilities.viewportSupportsStackCompatibility)`
- `getVolumeViewports()` -> `getViewports().filter(utilities.viewportSupportsVolumeCompatibility)`
- `getStackViewport(id)` -> `getViewport(id)`

For simple variable declarations, `getStackViewport(id)` also adds a runtime
capability guard.

- `@cornerstonejs/cornerstone3d-6`: runs the eight Cornerstone3D 6.0
  migration packages in the recommended order: `-settings`,
  `-viewport-types`, `-classes-and-types`, `-events`, `-display-sets`,
  `-viewport-members`, `-tools` and `-api-names` (each under
  `@cornerstonejs/cornerstone3d-6-`). `-api-names` holds the names that
  changed after 6.0.0-beta.2; on code that is on a 6.0 beta already it runs
  alone. Each package keeps a copy of `scripts/lib.ts`, because each is
  published on its own; `yarn validate:registry` checks that the copies are
  equal.

## Development

Validate all registry packages and run fixture tests:

```sh
cd packages/codemods
yarn validate
```

Validate only registry workflow metadata:

```sh
cd packages/codemods
yarn validate:registry
```

Check the API map against the steps (`validate` runs it too):

```sh
cd packages/codemods
yarn validate:api-map
```

`scripts/check-api-map.mjs` reads the code of the Legacy cell of each
`Replaced` or `Removed` row of
`packages/docs/docs/migration-guides/6x/3-api-map.md` that is not Private,
and checks that a step names it as a rule does (in quotes, as the key of a
table, in a regular expression of names or at the end of a module path). A
name that no step can reach, such as a member that 6.0 keeps as a deprecated
one or a key that is reported with its call, is listed in `UNREACHABLE` of
the script with the reason. A name in neither place fails the check, with
its line in the map.

Run only the JSSG fixture tests:

```sh
cd packages/codemods
yarn test
```

`yarn test` runs the fixtures of every registry package. A 6.0 package keeps
the fixtures of `.ts` files in `tests/typescript`, parsed as TypeScript, and
the others in `tests/tsx`; each `metrics.json` holds the sites that a fixture
reports. A package with `scripts/self-test.ts` also runs the fixtures of
`tests/self-test` with it (`-api-names` tests its table engine there on
made-up names).

After the fixtures of a folder, the test runs the package on the `expected`
files of that folder, as inputs: a package changes nothing in its own
output. A fixture that a package does not pass this way would be named in
`idempotencySkips` of `scripts/test-registry-packages.mjs`, with the reason.
None is.

Run the fixtures of one package, or only those whose name holds a filter:

```sh
cd packages/codemods
node scripts/test-registry-packages.mjs --package 6/api-names --filter display-sets
```

`--no-idempotency` leaves out the runs on the `expected` files, and
`--only-idempotency` runs only those.

## Running the local packages on code

The aggregate workflows take their steps from the Codemod registry, so a
rule that is not published yet runs only from its local package.
`scripts/run-registry.mjs` runs the local 6.0 packages on files, step by
step in the order of `registry/cornerstone3d/6/workflow.yaml`, each with
`npx codemod --disable-analytics workflow run -w <package> -t <copy>
--allow-dirty --no-interactive`:

```sh
cd packages/codemods
# every step on this repository's examples, without writing anything
node scripts/run-registry.mjs --dry-run ../*/examples
# one step, also on the code blocks of the docs, with the diff
node scripts/run-registry.mjs --dry-run --steps api-names --markdown \
  --diff /tmp/run.diff ../docs/docs/concepts ../docs/docs/tutorials
# every step on an application, written back in place
node scripts/run-registry.mjs /path/to/application/src
```

The steps run on a copy of the targets in a work folder; without
`--dry-run` the changed files are written back at the end. It prints, per
step, the files and lines it changed and the sites it reported; per rule,
the rewritten, manual and review sites; per file, the same. The rewritten
sites of a rule come from the metric `cornerstone3d-6-rewritten`, which the
runner turns on (`--param cornerstone3d-6-rewritten=true`) and which only
`-api-names` fills; for the other steps the changed lines stand for it.
With `--markdown` the `ts`, `tsx`, `js` and `jsx` code blocks of the `.md`
and `.mdx` files are files of their own (`page.md.snippet-3.ts`), and a
changed block goes back into its page. The pages of a `migration-guides`
folder are always left out, also when one is named as a target: their code
shows the old names on purpose (the runner prints how many it left out). `--json` writes every entry, `--steps` takes names separated by
commas, `--registry` another registry folder, `--help` the rest.

## Measure

`scripts/measure-registry.mjs` measures every 6.0 step, in the order of the
workflow, on real code that it copies with `git archive` into a folder
outside the repository (by default in the temporary folder of the system):

```sh
cd packages/codemods
# the example files of a commit of this repository, v5.19.4 by default
node scripts/measure-registry.mjs --ref v5.19.4
# a commit of an OHIF checkout, which is only read
node scripts/measure-registry.mjs --ohif ~/dev/Viewers-base --ohif-ref 6fe59945a0
```

The numbers, as they are counted:

- Sites: on the examples, the matches of the 5.x names that 6.0 removes or
  renames, in six families (viewport types, types and classes, events,
  settings, data calls, members), in every `.ts`, `.tsx` and `.js` file of
  `packages/*/examples`, outside comment lines. Rewritten: the sites of the
  input less those of the output. The patterns are those of the measures of
  19 to 21 November 2026, so the numbers compare.
- Rewritten on OHIF: by kind, the matches of each legacy name (such as
  `IStackViewport` or `.setStack(`) on the removed lines of the diff less
  those on its added lines, as the OHIF dry run of 20 November 2026 counted.
- Manual and review: the sites of the metrics, and the files that have one.
- Type errors: the input and the output are type checked against the
  sources of this checkout: the examples in the layout of the repository
  with `utils` linked, OHIF with the `node_modules` folders of the checkout
  linked into the copy. An error of the output is new when the input had no
  error with the same code and message at the same place: the line that
  the output line stood on before the run (lines move by what the hunks of
  the diff above them added or removed), or, for a line that the run
  changed, one of the old lines of its hunk. The path of the checked tree
  in a message counts as the same in both. The new errors of the changed
  files are printed with file and line:
  - on a changed line, an error at a site that a step left and reported (a
    name that the error quotes stood there before the run and a manual or
    review entry of the file names it, as
    `(<PlanarViewport>viewport).setStack(ids)`: the cast was rewritten and
    the `setStack` left with its report), or else a wrong rewrite;
  - off the changed lines (`new errors off changed lines`), for a reader to
    judge, with whether a manual or review entry of a step is on that line
    of the output (the line of an entry is carried from the input of its
    step to the output). A rewrite can give an error on another line, as a
    renamed event gives its untyped listener the type of its detail, and
    a rewritten cast gives the members of the 6.0 class to the lines that
    use the viewport.
    New errors in the files that the run did not change are printed too.
- Wrong: a syntax error that the run made (the TypeScript parser on each
  file), or a new type error on a changed line that is not at a site a step
  left and reported.

It prints the numbers and writes `measure.json` (the numbers, every new
type error and every report entry), `diff.patch` and the logs of the type
checks (`before.tsc.log`, `after.tsc.log`) into the measure folder
(`--work`). `--skip-typecheck` leaves the type checks out.

The numbers of 25 November 2026, at `f87fc2c46` with the work of task FX2
(every step, `-api-names` with its six families). Type errors: of the
output, and in brackets of the input; new on changed lines (all at a site
left and reported); new off changed lines (in brackets: on a line with a
report).

| Input                                                       | Files      | Sites | Rewritten   | Manual           | Review         | Type errors   | New, changed lines | New, off changed lines | Wrong |
| ----------------------------------------------------------- | ---------- | ----- | ----------- | ---------------- | -------------- | ------------- | ------------------ | ---------------------- | ----- |
| Examples of `58914567b` (the input of the earlier measures) | 251        | 1,335 | 900 (67.4%) | 463 in 170 files | 67 in 38 files | 713 (1,395)   | 5                  | 184 (178)              | 0     |
| Examples of `v5.19.4`                                       | 249        | 1,334 | 899 (67.4%) | 459 in 169 files | 65 in 37 files | 710 (1,385)   | 5                  | 184 (178)              | 0     |
| OHIF `6fe59945a0` (master, 5.x)                             | 32 changed |       | 158         | 221 in 42 files  | 53 in 20 files | 8,823 (8,962) | 8                  | 23 (20)                | 0     |

`-api-names` alone, on code that is on a 6.0 beta (the rewritten sites from
its metric):

| Input                                                                                                             | Files                    | Rewritten | Manual           | Review         | Type errors   | New, changed lines | New, off changed lines | Wrong |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- | ---------------- | -------------- | ------------- | ------------------ | ---------------------- | ----- |
| OHIF `78432e76cb` (`feat/cornerstone3d-6`)                                                                        | 16 changed, 39 lines     | 39        | 66 in 15 files   | 16 in 8 files  | 9,068 (9,098) | 0                  | 1 (0)                  | 0     |
| Examples of 6.0.0-beta.2 (`1b3b2247e`)                                                                            | 207 changed              |           | 38 in 17 files   | 30 in 20 files | 379 (1,001)   | 2                  | 4 (4)                  | 0     |
| Examples, tests, `utils` and docs code blocks of 6.0.0-beta.2 (`1b3b2247e`): 834 files and 332 blocks of 67 pages | 275 changed, 1,418 lines | 1,463     | 401 in 120 files | 78 in 48 files |               |                    |                        |       |

None of these runs makes a new type error in a file that it did not
change. On the examples, the 5 new errors on changed lines are each at a
site left and reported: 3 `setStack` on a line whose cast was rewritten,
and 2 `event.detail` of a listener whose `colormap.opacity` read is
reported. On OHIF master, 8: 7 a `setProperties`, `setVolumes` or
`getCamera` left and reported on a line whose cast was rewritten, and 1 the
`VOLUME_3D` test that two operands of one `||` are now, listed for review.

The new errors off changed lines are mostly a cast that the run rewrote to
a 6.0 class on one line and a 5.x member that the run left with a report
on a later line (`viewport.setProperties(...)` after
`getViewport<PlanarViewport>(...)`): 178 of 184 on the examples sit on a
line with a report. Of the others, 2 are reported on the line where their
call starts (`volumeAPI`, `axisBasedImageStretching`), and 4 were errors of
the examples in 5.x already, which showed only because the types of the
input do not resolve against 6.0: a video view state read for
`flipHorizontal` and `flipVertical`, which 5.x did not have, a `scale` in a
`Types.ViewPresentation`, which 5.x did not have, and `background:
number[]` where 5.x asked for `RGB`. On OHIF master, 20 of 23 sit on a
reported line; 2 are OHIF passing an `IViewport` where it typed
`IVolumeViewport`, an error in 5.x too, and 1 is an untyped listener of the
renamed `DISPLAY_SETS_CHANGED` (`evt => evt.detail`) whose review entry is on
the line of `addEventListener`, above it; the same listener is the one new
error of the OHIF branch. The measure found three misses of a rule, fixed
with fixtures (row 208 of `v6-open-issues.md`): `setZoom(zoom, true)` and
`setPan(pan, true)`, a 5.x member read without a call (`if
(!viewport.getAllVolumeIds)`), and a parameter typed `BaseVolumeViewport`
that the file passes a 3D viewport.

The output of 6.0.0-beta.2 type checks against this tree with 502 errors
where its input had 1,150 (the tests import the sources of the packages, which changed by
hand); 2 are on changed lines, both left and reported. Compared file by file
with this tree's own examples and tests (the right answer), the step changed
nothing that the tree kept, and every other difference is a reported site,
a local name the tree renamed (the step keeps local names), or a hand edit
that a lane listed (text, comments, tests that import `../src`, Playwright
page code).

A second run on this repository's examples, tests, `utils` and docs changes
nothing: the display sets family writes `mode: 'volume'` only for a
registration on the beta registry (row 199 of `v6-open-issues.md`).

At `1b3b2247e`, with `-api-names` empty, the examples of `58914567b` gave 860
rewritten, 466 manual and 25 review, and OHIF 157 rewritten, 138 manual and
25 review.

## Registry Publishing

The package is intentionally private to npm. Publishing happens through the
Codemod registry packages under `packages/codemods/registry`.

Publish migration packages before aggregate packages that reference them.

To publish `cornerstone3d/5/generic-viewport`:

```sh
git tag cornerstone3d/5/generic-viewport@v0.1.0
git push origin cornerstone3d/5/generic-viewport@v0.1.0
```

To publish `cornerstone3d/5`:

```sh
git tag cornerstone3d/5@v0.1.0
git push origin cornerstone3d/5@v0.1.0
```

`Publish Codemod Registry Entry` resolves those tags to directories under
`packages/codemods/registry/` and publishes them with
`codemod/publish-action@v1`. `Validate Codemod Registry Entries` checks pull
requests and pushes to `main`.
