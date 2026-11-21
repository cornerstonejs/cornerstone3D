# The 6.0 codemod on OHIF Viewers: the dry run

## What was run

- OHIF Viewers, branch `master`, commit `6fe59945a05eb51874c034868597159facf67343`
  (20 November 2026, `3.14.0-beta.101`). It uses `@cornerstonejs/*` 5.18.3. 198 of its
  files import a cornerstone package, 125 of them in `extensions/cornerstone`.
- The seven packages of the codemod, from the registry of the 6.0 branch (not npm), in the
  order of the aggregate workflow, with `npx codemod workflow run -w <package> -t <OHIF>`.
  Nothing in OHIF was committed: the run went on a copy, and its diff was read and kept
  in the lane folder.
- Each step ended with exit 0 in 3 to 5 seconds, about 30 seconds in all. No crash, no hang.

## The counts

| | Before the fixes | After the fixes |
|---|---|---|
| Files changed | 25 | 25 |
| Sites rewritten | 158 | 157 |
| Wrong rewrites | 3 | 0 |
| Unsure rewrites | 9 | 9 |
| Removed types and events left with no report | 5 | 0 |
| Manual report | 132 sites in 31 files | 138 sites in 33 files |
| Review report | 15 sites in 6 files | 16 sites in 6 files |

After the fixes, every removed enum value, type and core function that the OHIF output
still uses is in the report (checked against the 5.x and 6.0 sources). A few member
calls and reads are not; they are in the last section.

The 157 rewritten sites: 92 removed types became their class (`PlanarViewport`,
`ECGViewport`), 30 `*_NEXT` names their plain names, 7 `STACK` or `ORTHOGRAPHIC` became
`PLANAR`, 9 events, 4 settings calls, one `setStack`, one `setEcg`, 3 `setCamera({ flip })`,
2 `resetCamera()`, 7 `getAllVolumeIds()`, one unused import of `BaseVolumeViewport`.

## What was wrong, and the fixes

Three wrong rewrites, in the classes-and-types package. Each fix has a fixture test that
failed first.

1. A type predicate. OHIF's `isVolume3DViewportType(viewport): viewport is
   Types.IVolumeViewport` returns true for `VOLUME_3D` only, and `isVolumeViewportType`
   returns true for `ORTHOGRAPHIC` or `VOLUME_3D`. The codemod made both
   `viewport is PlanarViewport`. TypeScript trusts a predicate, so a 3D viewport was typed
   as planar. Now a predicate whose function names a 3D type stays and is reported.
2. A cast of an object whose own `type` is `VOLUME_3D` (an OHIF test mock) became
   `PlanarViewport`. Now such a cast takes the family of its last `type` entry
   (`VolumeViewport3D` here), and it is reported when a spread after the `type` can
   replace it.

Five sites of removed names had no rewrite and no report:

3. `EVENTS` of `@cornerstonejs/core` is the same enum as `Enums.Events`, but the events
   package did not know it: `EVENTS.IMAGE_LOAD_ERROR` and `EVENTS.STACK_VIEWPORT_SCROLL`
   were left with no report. Now `EVENTS` counts like `Enums.Events`.
4. Removed types imported from the subpath `@cornerstonejs/core/types`
   (`import { IStackViewport, IVolumeViewport } from '@cornerstonejs/core/types'`, and
   `ViewportProperties`) had no report. Now each is reported by its `Types` name.

On the 251 example files the output is byte for byte the same as before, with the same
reports, so the measure stays at 0 wrong and 860 of 1,335 sites rewritten.

## The unsure rewrites

- `getAllVolumeIds()` became `getActors().map((entry) => entry.referencedId)` at 7 sites,
  with no report. This is finding 6 of the external review, and lane R1 changes that rule.
  In OHIF it matters (read, not run): with a labelmap or a surface on the viewport the
  list also has image ids, geometry ids or undefined. OHIF then calls `id.includes(...)`
  (a TypeError on undefined) and `cache.getVolume(id)` on each (undefined for an image id,
  so the window level panel takes the volumes as not loaded; a throw for undefined). In
  `initCineService.ts` the call was rewritten but the guard before it,
  `if (!viewport?.getAllVolumeIds) return null`, was not. On 6.0 the guard always returns,
  so the cine of a dynamic volume does nothing.
- `getCornerstoneViewportType()` returned `ViewportType.STACK` or `ORTHOGRAPHIC`, and both
  became `PLANAR`. That is right for a viewport type. But OHIF also calls the function with
  `false` to get a stack-or-volume "data shape" (`dataShapeType` in
  `CornerstoneCacheService`). That shape is now lost. The comparisons with `STACK` and
  `ORTHOGRAPHIC` that read it are in the manual report.

## The report, by kind, with the guide section each needs

78 of the 138 manual sites are in OHIF's legacy lane (`LegacyViewportAdapter`,
`LegacyViewportOperations`, `LegacyViewportBackend`, `LegacySegmentationBackend`,
`getLegacyViewportType`) and in the tests of its legacy type mapping. That code goes on
6.0 (see the first steps below).

| Kind | Sites | Where in the guide |
|---|---|---|
| `ViewportType.STACK` / `ORTHOGRAPHIC` compared or stored, and the strings `'planarNext'` and kin | 51 | Step 1 and Step 2 (`getCurrentMode()`, `utilities.getViewportContentMode()`); api-map "Viewport types" |
| Camera and view: `getCamera` 13, `setCamera` 5, `get/setViewPresentation` 9, `jumpToWorld`, `isInAcquisitionPlane` | 29 | Step 5 and Step 6; api-map "Members of every legacy viewport" |
| The look: `setProperties` 17, `getProperties` 8, `resetProperties`, `getBlendMode` 3, `Types.ViewportProperties` 3 | 32 | Step 4; api-map "The keys of setProperties" |
| The data: `setVolumes` 3, `addVolumes`, `setStack` 2, `Types.IVolumeInput` | 7 | Step 3 |
| Types: the two predicates, the two `core/types` imports, `isGenericViewport` 2 | 6 | Step 2; api-map "Classes and TypeScript types", "The type of a viewport in 6.0" |
| Slices: `getImageSliceDataForVolumeViewport` 2, `getTargetImageIdIndex` | 3 | Step 6; api-map "Functions of the core package" |
| Events: `STACK_VIEWPORT_SCROLL` | 3 | Step 9; api-map "Events" (listen to `CAMERA_MODIFIED` and `NEW_IMAGE`) |
| Members and helpers: `getAllVolumeIds` 2, `viewportSupportsVolumeCompatibility`, `_actors`, `isDisabled`, `requestedType` | 6 | Step 7 and Step 8; api-map "Functions of the core package" |
| Settings: `useGenericViewport` | 1 | Step 12 |
| Review: `STACK_NEW_IMAGE`, `VOLUME_NEW_IMAGE`, `IMAGE_LOAD_ERROR` | 9 | Step 9 |
| Review: `AXIAL` for an `ORTHOGRAPHIC` | 4 | Step 1 |
| Review: `setUseCPURendering` | 3 | Step 12 (OHIF calls it after `init()` already) |

The line of an entry is the line when its step ran. A later step can add an import line
above it, so it can be one or two lines higher than the final file.

## What an OHIF developer does by hand, in order

1. Move to the latest 5.x (5.19.4). Turn OHIF's next lane on for every mode
   (`genericViewports.enabled`, `?useNextViewports=true`) and run the Playwright suite on
   5.x. On 6.0 that lane is the only one.
2. On a clean branch, still on 5.x, run the codemod and then prettier. The codemod writes
   `(entry) =>` and long lines, where OHIF's style differs.
3. Delete the legacy lane instead of porting it: the four `Legacy*` classes, the legacy
   half of `getViewportAdapter` (`isGenericViewport` is true for every 6.0 viewport), the
   legacy predicates of `getLegacyViewportType`, the legacy branch of
   `getCornerstoneViewportType`, the setting `useGenericViewport` (`init.tsx`, `AppTypes`)
   and their tests. This removes 78 of the 138 manual entries.
4. Give OHIF its own data-shape values (stack, volume, 3D, other) for `dataShapeType`
   (`CornerstoneCacheService`, `viewportDataShape`, `Viewport.getViewportType`, the
   comparisons in `CornerstoneViewportService`). For a live viewport, ask
   `viewport.getCurrentMode()`.
5. Let `getCornerstoneViewportType` take the 6.0 type strings (`'planar'`, `'volume3d'`,
   ...) as types it already has. Today only `'planarnext'` and kin pass through, so a
   stored `'planar'` that comes back throws "Invalid viewport type".
6. Work through the other 60 manual entries and the 16 review entries in the order of the
   guide's steps (table above).
7. Check the seven `getAllVolumeIds` rewrites and the guard in `initCineService.ts` (see
   "The unsure rewrites").
8. Change every `@cornerstonejs/*` package to the 6.0 beta together (core, tools,
   adapters, dicom-image-loader, metadata, utils, ai, polymorphic-segmentation,
   labelmap-interpolation).
9. Run `tsc --noEmit` and compare it with a run on 5.x. OHIF has no type check step, and
   its build does not check types.
10. Rewrite or delete the jest mocks of legacy viewports, then run jest and Playwright on
    6.0.

## What blocks OHIF on 6.0 that the codemod cannot know

- **The two lanes.** OHIF picks a legacy or a next lane with its own flag. The codemod
  ports the legacy lane line by line, but on 6.0 that lane never runs:
  `getLegacyViewportType` reads `requestedType ?? type`, every planar viewport has the
  type `'planar'`, so `isStackViewportType` and its kin are false. Only a person can
  decide to delete the lane.
- **The data shape.** OHIF uses `ViewportType.STACK`, `ORTHOGRAPHIC` and `VOLUME_3D` as
  its own stack-or-volume marker, and stores it on the viewport data. 6.0 has no such
  enum values, and the codemod turned the function that makes the marker into one that
  returns `PLANAR` for both.
- **OHIF's own type strings.** OHIF stores the viewport type and maps it again later
  (`'planarnext'` and kin). With 6.0 strings that mapping throws.
- **No type check.** A removed name such as `ViewportType.STACK` is `undefined` at run time
  in OHIF's build. It is not a build error, so a missed site shows only when it runs.
- **Names the codemod cannot tie to cornerstone.** Read, not run:
  `vp.setProperties(...)` on a callback parameter `vp` (`ViewportWindowLevel.tsx`; only
  names like `viewport` are reported by name), `cornerstone.getShouldUseCPURendering()` on
  the window object in a Cypress spec, and four feature tests such as
  `typeof viewport.addVolumes === 'function'`, each next to a reported call.
- **The other packages.** The codemod does not cover `@cornerstonejs/adapters` (16 OHIF
  imports), the dicom image loader and the AI package. Their 6.0 changes were not checked
  here.
