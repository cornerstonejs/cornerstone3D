# Cornerstone3D 6.0 Migration

Runs the Cornerstone3D 6.0 migration codemods in the recommended order. They
do the mechanical part of the
[6.0 upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step):
the renames, and the rewrites that need no knowledge of the application. They
report every site that needs the application, and they write no comment into
your code.

They change code only where the file shows that it is Cornerstone's: a name
bound to an import of `@cornerstonejs/*`, a viewport got from a rendering
engine, an enabled element or a Cornerstone type, a viewport input or a
configuration that reaches a Cornerstone call. A variable named `viewport`
alone puts the site in the report. A CommonJS module gets no `import`.

They rewrite a site only when every input it depends on has a shape they
fully understand, and report it otherwise:

- A receiver or an engine is shown by a `const`, or by a parameter that the
  file never writes, whose value or top type is Cornerstone's. A `let`, a
  `var`, an assignment and a type argument (`History<Types.IViewport>`) show
  nothing.
- A mount, a type or a family holds only for the same binding in the same
  function: a shadowing name, a closure, or a test of another value (a
  parameter `type`, a `cardType`) proves nothing.
- An argument that a rewrite reads twice is read once into a `const` when it
  is not a name, a literal or an array of those; a spread argument is
  reported.
- A quoted key, a key with a default, a string in brackets and an
  `export { ... } from` name the same member as the plain form: each is
  rewritten or reported.

## Usage

Start from the latest 5.x, on a clean branch.

```sh
npx codemod @cornerstonejs/cornerstone3d-6
```

To preview changes before writing files:

```sh
npx codemod @cornerstonejs/cornerstone3d-6 --dry-run
```

Then run your formatter and your type checker, and work through the report.

## The report

At the end of the run the tool prints two metrics. Each entry names a rule, a
file and a line.

- `cornerstone3d-6-manual`: a site that the codemod did not change. The rule
  says what it is, for example `setVolumes: the input has callback` or
  `ViewportType.PERSPECTIVE`. Look up the name in
  [Every legacy call and what replaces it](https://www.cornerstonejs.org/docs/migration-guides/6x/api-map).
- `cornerstone3d-6-review`: a site that the codemod rewrote where the guide
  lists a decision, for example a `STACK_NEW_IMAGE` listener that now hears
  `NEW_IMAGE` for the slices of a volume too, or an `ORTHOGRAPHIC` viewport
  that got the 5.x default orientation `AXIAL` written out.

Two review rules are about a rewrite that is right name by name and still
changes what the code says:

- A rule that starts with
  `ViewportType.PLANAR: one function returned STACK and ORTHOGRAPHIC`, at
  the line of the function. It returned `STACK` on one path and
  `ORTHOGRAPHIC` on another, and returns `PLANAR` on both now. Read its
  callers. Where a caller passes the answer to a viewport input, there is
  nothing to do. Where the application stores or compares it to tell a stack
  from a volume, the answer is lost: give the application its own values for
  the shape of its data, and ask `viewport.getCurrentMode()` for a live
  viewport.
- A rule such as
  `ViewportType.VOLUME_3D: two operands of one || are the same now`, at the
  line of the second operand; also for `&&`, for two `case` labels of one
  `switch`, for two entries of a list used with `includes`, and for a
  renamed class such as `VolumeViewport3D`.
  `type === VOLUME_3D || type === VOLUME_3D_NEXT` is one test after the
  rename. Where the code meant "any 3D viewport", delete one of the two.
  Where it told a legacy viewport from a next one, the test is true for
  every viewport of that type in 6.0: delete the branch for the legacy
  viewport, and read the other tests of that type near it. Of two equal
  `case` labels only the first runs.

## JavaScript files, and a file that is not analysed

To know what a name refers to, the codemods ask the semantic analysis of the
Codemod tool. It reads JSX only in `.jsx` and `.tsx` files. Where it cannot
read a `.js`, `.mjs` or `.cjs` file (JSX is the common reason), the codemods
look the names up themselves on the syntax tree: imports, variables,
parameters, functions, classes and `catch` clauses, each with its scope. Such
a file is rewritten and reported as the same code in a `.jsx` file is.

A step never stops on a file. A file that cannot be analysed stays as it is
and has one entry in `cornerstone3d-6-manual`, at line 1. Its rule starts
with `the file was not analysed:` and gives the reason:

- a TypeScript file that the tool cannot read, for example
  ``the file was not analysed: Identifier `x` has already been declared``;
- a JavaScript file with JSX where a name that the codemod looks up is
  declared twice in one scope:
  `the file was not analysed: x is declared twice in one scope`.

The step reports nothing else in that file. Fix the file and run the codemod
again, or do the file by hand with the guide.

## Included Migrations

In the order in which they run:

1. `@cornerstonejs/cornerstone3d-6-settings`: the removed settings
   (`useGenericViewport`, `useCPURendering` and the CPU functions).
2. `@cornerstonejs/cornerstone3d-6-viewport-types`: `STACK`,
   `ORTHOGRAPHIC`, the `_NEXT` names and the `*Next` strings.
3. `@cornerstonejs/cornerstone3d-6-classes-and-types`: the legacy classes,
   `Types.IStackViewport` and its kin, the deprecated class aliases.
4. `@cornerstonejs/cornerstone3d-6-events`: `STACK_NEW_IMAGE`,
   `VOLUME_NEW_IMAGE` and `IMAGE_LOAD_ERROR` with their event types.
5. `@cornerstonejs/cornerstone3d-6-display-sets`: `setStack`, `setVolumes`,
   `setVolumesForViewports`, `setVideo` and `setEcg`.
6. `@cornerstonejs/cornerstone3d-6-viewport-members`: the legacy members with
   a fixed 6.0 call, such as `resetCamera` and `setProperties`.
7. `@cornerstonejs/cornerstone3d-6-tools`: two moved modules of the tools,
   and the removed names of the tools.
8. `@cornerstonejs/cornerstone3d-6-api-names`: the names that changed after
   6.0.0-beta.2. On code that is on a 6.0 beta already, run it alone.

Each package has a README with what it changes and what it reports.

## Publishing

Publish the eight child packages before this aggregate package. The workflow
resolves them from the Codemod registry at runtime.
