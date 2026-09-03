# Volume Viewport Test Slice Limit Plan

Goal: speed up legacy Playwright volume tests by loading fewer slices (~20) per example, then regenerate legacy (non-compat) screenshot baselines one spec at a time.

## Scope: Legacy Playwright specs using volume viewports

~16 spec files across ~12 unique examples. All load full series via `createImageIdsAndCacheMetaData()` with no existing slice cap.

| Spec | Example | Viewport type |
|---|---|---|
| `tests/volumeBasic.spec.ts` | `volumeBasic` | ORTHOGRAPHIC |
| `tests/volumeBasicTiled.spec.ts` | `volumeBasic` | ORTHOGRAPHIC |
| `tests/volumeAnnotation.spec.ts` | `volumeAnnotationTools` | ORTHOGRAPHIC |
| `tests/volumeAnnotationTiled.spec.ts` | `volumeAnnotationTools` | ORTHOGRAPHIC |
| `tests/MPRReformat.spec.ts` | `mprReformat` | ORTHOGRAPHIC |
| `tests/surfaceRendering.spec.ts` | `surfaceRenderingForTest` | VOLUME_3D |
| `tests/contourRendering.spec.ts` | `contourRendering` | ORTHOGRAPHIC |
| `tests/contourRenderingTiled.spec.ts` | `contourRendering` | ORTHOGRAPHIC |
| `tests/labelmapGlobalConfiguration.spec.ts` | `labelmapGlobalConfiguration` | ORTHOGRAPHIC |
| `tests/labelmapSwapping.spec.ts` | `labelmapSwapping` | ORTHOGRAPHIC |
| `tests/labelmapRendering.spec.ts` | `labelmapRendering` | ORTHOGRAPHIC |
| `tests/labelmapRenderingTiled.spec.ts` | `labelmapRendering` | ORTHOGRAPHIC |
| `tests/labelmapsegmentationtools.spec.ts` | `labelmapSegmentationTools` | ORTHOGRAPHIC |
| `tests/rectangleROIThresholdStatisticsMIM.spec.ts` | `rectangleROIStartEndThresholdWithSegmentation` | ORTHOGRAPHIC |
| `tests/renderingPipeline.spec.ts` (volume half) | `renderingPipelines` | ORTHOGRAPHIC |
| `tests/interpolationContourSegmentation.spec.ts` | `interpolationContourSegmentation` | ORTHOGRAPHIC + STACK |

## Approach: `?maxSlices=N` URL query param

### Why this over hardcoded `.slice(0, 20)`
Keeps the demos realistic for anyone browsing the example pages (default = full series) while letting Playwright opt into a reduced set via URL param. Cost: one added line per example. Hardcoding is simpler but visibly degrades user-facing demos.

### Implementation steps

1. **Add helper** — in `packages/*/examples/utils/demo/helpers/` (wherever `createImageIdsAndCacheMetaData` lives), export:
   ```ts
   export function limitImageIds(imageIds: string[]): string[] {
     const param = new URLSearchParams(window.location.search).get('maxSlices');
     const max = param ? parseInt(param, 10) : NaN;
     if (!Number.isFinite(max) || max <= 0 || max >= imageIds.length) {
       return imageIds;
     }
     const start = Math.floor((imageIds.length - max) / 2);
     return imageIds.slice(start, start + max);
   }
   ```
   Centering the slice preserves the middle frames, which typically contain the interesting anatomy — avoids "blank corner" baselines.

2. **Wire into each of the 12 volume examples** — wrap the `createImageIdsAndCacheMetaData(...)` result:
   ```ts
   const imageIds = limitImageIds(
     await createImageIdsAndCacheMetaData({ ... })
   );
   ```

3. **Extend `tests/utils/visitExample.ts`** — accept a `searchParams` option and merge into the example URL:
   ```ts
   export const visitExample = async (
     page: Page,
     title: string,
     options: { delay?: number; searchParams?: Record<string, string>; ... } = {}
   ) => { ... }
   ```
   Or the simpler form: add an optional 6th arg. Prefer the options-object refactor since the positional call sites are already noisy.

4. **Update the 16 volume specs** — change each `visitExample(page, '<name>')` call to pass `searchParams: { maxSlices: '20' }`.

5. **Sanity-check visuals** — spot-check a couple of examples in the browser with `?maxSlices=20` before regenerating baselines.

## Regenerating baselines (legacy, not compat)

- `PLAYWRIGHT_FORCE_COMPAT` **unset** (that's the default).
- Per spec:
  ```
  bash ./scripts/run-playright.sh --update tests/<spec>.spec.ts
  ```
  or
  ```
  npx playwright test tests/<spec>.spec.ts --update-snapshots
  ```
- After each update, diff the new `.png` baselines (use `tests/utils/next-screenshot-compare.html`) before committing.

## Order of operations

1. Land the `limitImageIds` helper + `visitExample` option (no spec changes yet).
2. For each example, in a separate commit:
   - Add `limitImageIds(...)` wrap.
   - Update the matching spec(s) to pass `maxSlices: '20'`.
   - Regenerate baselines for that spec.
   - Review diff, commit.
3. Last: `interpolationContourSegmentation` (mixed stack+volume) — may need a smaller slice count or stack-only path kept untouched.

## Open questions

- Should `surfaceRendering` (VOLUME_3D geometry rendering) also respect `maxSlices`? Fewer slices = different surface topology, may be worth keeping full for that spec.
- Should `MPRReformat` use more than 20? Reformats across oblique planes may look empty with too few slices — try 20, bump if needed.
- Tiled variants (`*Tiled.spec.ts`) share examples with their non-tiled counterparts; single change covers both but baselines must be regenerated for each spec.
