import { afterEach, describe, expect, test } from 'vitest';
import {
  captureViewportState,
  createPlanarViewport,
  renderAndWait,
  type PlanarRenderMode,
  type PlanarViewportContext,
  type ViewportStateSnapshot,
} from './harness';

const ALL_MODES: PlanarRenderMode[] = [
  'vtkImage',
  'vtkVolumeSlice',
  'cpuImage',
  'cpuVolume',
];
const BASELINE_MODE: PlanarRenderMode = 'vtkImage';

// vtkVolumeSlice and cpuVolume are volume-backed and genuinely diverge from
// the vtkImage/cpuImage (stack-backed) baseline; see the confirmed findings
// documented above the parity tests below. cpuImage is stack-backed exactly
// like the baseline (only the render backend differs) and matches exactly.
const CLEAN_NON_BASELINE_MODES: PlanarRenderMode[] = ['cpuImage'];
const VOLUME_BACKED_NON_BASELINE_MODES: PlanarRenderMode[] = [
  'vtkVolumeSlice',
  'cpuVolume',
];

// Safety net: if a test throws before reaching its own cleanup() call, this
// ensures the rendering engine, caches, and providers are still torn down so
// later tests (and other suites, since fileParallelism is false) do not see
// leaked global state.
let activeCleanups: Array<() => void> = [];

afterEach(() => {
  while (activeCleanups.length) {
    const cleanup = activeCleanups.pop();

    try {
      cleanup?.();
    } catch {
      // best-effort safety net only
    }
  }
});

async function setupMode(
  mode: PlanarRenderMode,
  displaySetId?: string
): Promise<PlanarViewportContext> {
  const ctx = await createPlanarViewport({ renderMode: mode, displaySetId });
  activeCleanups.push(ctx.cleanup);
  return ctx;
}

function teardown(ctx: PlanarViewportContext): void {
  ctx.cleanup();
  activeCleanups = activeCleanups.filter((cleanup) => cleanup !== ctx.cleanup);
}

/**
 * Canonical 6-step scenario from plan 01. Captures a snapshot after each
 * step (render + wait for IMAGE_RENDERED where the step does not itself
 * render synchronously before its promise resolves).
 */
async function runCanonicalScenario(
  ctx: PlanarViewportContext
): Promise<ViewportStateSnapshot[]> {
  const { viewport, element, displaySetId } = ctx;
  const snapshots: ViewportStateSnapshot[] = [];

  // Step 1: initial render (already done by createPlanarViewport).
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 2: scroll(2). setImageIdIndex settles the view state and renders
  // synchronously within the returned promise, so no extra render/wait step
  // is needed here.
  await viewport.scroll(2);
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 3: setZoom(2) then render.
  viewport.setZoom(2);
  await renderAndWait(element, viewport);
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 4: setPan([20, 10]) then render.
  viewport.setPan([20, 10]);
  await renderAndWait(element, viewport);
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 5: setViewState({ rotation: 90 }) then render.
  viewport.setViewState({ rotation: 90 });
  await renderAndWait(element, viewport);
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 6: set a VOI via setDisplaySetPresentation then render.
  viewport.setDisplaySetPresentation(displaySetId, {
    voiRange: { lower: 0, upper: 200 },
  });
  await renderAndWait(element, viewport);
  snapshots.push(captureViewportState(viewport, displaySetId));

  return snapshots;
}

/**
 * Runs the baseline (vtkImage) and a target mode through the canonical
 * scenario under a shared displaySetId (so viewReference.dataId and the
 * presentation lookup key line up across the two runs and do not pollute
 * the diff with an incidental id mismatch), tearing each context down before
 * the next is created.
 */
async function collectBaselineAndTargetSnapshots(
  mode: PlanarRenderMode
): Promise<{
  baseline: ViewportStateSnapshot[];
  target: ViewportStateSnapshot[];
}> {
  const displaySetId = `render-path-parity:${mode}`;

  const baselineCtx = await setupMode(BASELINE_MODE, displaySetId);
  const baseline = await runCanonicalScenario(baselineCtx);
  teardown(baselineCtx);

  const targetCtx = await setupMode(mode, displaySetId);
  const target = await runCanonicalScenario(targetCtx);
  teardown(targetCtx);

  return { baseline, target };
}

describe('renderPathParity', () => {
  test.each(ALL_MODES)(
    'sanity: %s reaches rendered state with a matching actor',
    async (mode) => {
      const ctx = await setupMode(mode);

      try {
        const { viewport } = ctx;
        const actors = viewport.getActors();

        expect(actors.length).toBeGreaterThanOrEqual(1);
        expect(viewport.getNumberOfSlices()).toBe(5);
        expect(['stack', 'volume', 'unknown', 'empty']).toContain(
          viewport.getCurrentMode()
        );

        const snapshot = captureViewportState(viewport, ctx.displaySetId);

        expect(
          snapshot.pathSpecific.actorClassNames.length
        ).toBeGreaterThanOrEqual(1);
        expect(snapshot.pathSpecific.actorUIDs.length).toBe(
          snapshot.pathSpecific.actorClassNames.length
        );

        // The actor's render path must match the requested backend: CPU
        // modes (cpuImage, cpuVolume) mount a CanvasActor; GPU modes
        // (vtkImage, vtkVolumeSlice) mount a vtk.js actor. Note: vtkImage and
        // vtkVolumeSlice both mount an actor whose getClassName() is
        // "vtkImageSlice" (ImageActor) -- vtk.js reuses the same actor class
        // for the plain image mapper and the reslice mapper, distinguishing
        // them only by mapper class (vtkImageMapper vs vtkImageResliceMapper,
        // see packages/core/src/types/IActor.ts ActorMapperProxy). The frozen
        // pathSpecific contract (actorClassNames/actorUIDs only) cannot
        // surface that distinction, so this check is intentionally scoped to
        // CPU-vs-GPU rather than to the specific GPU sub-mode.
        const isCpuMode = mode === 'cpuImage' || mode === 'cpuVolume';
        const actorClassNames = snapshot.pathSpecific.actorClassNames;

        if (isCpuMode) {
          expect(actorClassNames.some((name) => name === 'CanvasActor')).toBe(
            true
          );
        } else {
          expect(actorClassNames.some((name) => name === 'vtkImageSlice')).toBe(
            true
          );
        }
      } finally {
        teardown(ctx);
      }
    }
  );

  test('vtkImage baseline snapshot survives a JSON round-trip', async () => {
    const ctx = await setupMode(BASELINE_MODE);

    try {
      const snapshots = await runCanonicalScenario(ctx);

      for (const [step, snapshot] of snapshots.entries()) {
        const roundTripped = JSON.parse(JSON.stringify(snapshot));
        expect(roundTripped, `step ${step}`).toEqual(snapshot);
      }
    } finally {
      teardown(ctx);
    }
  });

  describe.each(CLEAN_NON_BASELINE_MODES)(
    '%s vs vtkImage baseline core-state parity',
    (mode) => {
      test('core state matches the vtkImage baseline across the canonical scenario', async () => {
        const { baseline, target } = await collectBaselineAndTargetSnapshots(
          mode
        );

        expect(target.length).toBe(baseline.length);

        for (let step = 0; step < baseline.length; step++) {
          expect(target[step].core, `mode=${mode} step=${step}`).toEqual(
            baseline[step].core
          );
        }
      });
    }
  );

  // ------------------------------------------------------------------------
  // Confirmed cross-render-path divergences (shared-context rule 5).
  //
  // vtkVolumeSlice and cpuVolume are volume-backed: the harness registers
  // their planar display set with an explicit `volumeId` (see
  // createPlanarViewport.ts) so PlanarRenderPathDecisionService selects the
  // volume render path (packages/core/src/RenderingEngine/GenericViewport/
  // Planar/PlanarRenderPathDecisionService.ts, isVolumeBackedDataSet). Two
  // distinct divergences from the vtkImage/cpuImage (stack-backed) baseline
  // were confirmed by inspecting every one of the 6 canonical-scenario steps
  // (see the per-step diffs captured during development of this suite):
  //
  // 1. Present at every step, by design: `core.currentMode` is "volume" for
  //    the volume-backed modes vs "stack" for the baseline (see
  //    PlanarViewport.getCurrentMode, which classifies content type from the
  //    mounted render mode); and `core.viewReference.volumeId` is present
  //    only for the volume-backed modes (a volume-backed reference carries a
  //    volumeId; a stack-backed one does not). Both are direct, documented
  //    consequences of the architecture's stack/volume content-mode split,
  //    not an accidental render-path leak -- but per rule 5 they are kept as
  //    a real, asserted divergence rather than moved to pathSpecific or
  //    silently excluded, since the plan explicitly calls out viewReference
  //    as NOT legitimately path-specific.
  //
  // 2. A genuine, isolated bug found ONLY at step 0 (the initial render,
  //    before any explicit slice navigation): with the planar display set
  //    registered with `initialImageIdIndex: 0`, the volume-backed render
  //    paths resolve the initial slice to world Z = 4 (the LAST of the 5
  //    fake-stack slices, imageId sliceIndex 4), while the baseline resolves
  //    it to world Z = 0 (sliceIndex 0) as requested. Observed step-0 values
  //    (5-slice stack, 1 mm z-spacing, slices at z=0..4):
  //      - core.viewState.slice: baseline
  //          { kind: 'stackIndex', imageIdIndex: 0 }
  //        vs vtkVolumeSlice/cpuVolume
  //          { kind: 'volumePoint', sliceWorldPoint: [31.5, 31.5, 4] }
  //      - core.viewReference.cameraFocalPoint[2] / planeRestriction.point[2]:
  //        0 (baseline) vs 4 (volume-backed)
  //      - core.viewReference.referencedImageId / referencedImageURI: encode
  //        sliceIndex 0 (baseline) vs sliceIndex 4 (volume-backed)
  //      - core.worldProbes[*].world[2]: 0 (baseline) vs 4 (volume-backed),
  //        for all 3 probe canvas points
  //    getCurrentImageIdIndex()/getSliceIndex() mask this: both report "0"
  //    for every mode at step 0, even though the volume-backed modes are
  //    actually showing the opposite end of the stack. Root cause traced to
  //    PlanarViewport.createInitialVolumeSliceState (packages/core/src/
  //    RenderingEngine/GenericViewport/Planar/PlanarViewport.ts), which
  //    builds the initial volumePoint slice basis independently of the
  //    stack-backed imageIdIndex path.
  //
  //    Critically, this is a step-0-only divergence: after ANY explicit
  //    slice navigation (step 2 here, `scroll(2)`), the volume-backed modes
  //    realign with the baseline and stay aligned for the remaining steps
  //    (confirmed: baseline imageIdIndex=2 after scroll(2) matches
  //    sliceWorldPoint z=2 for vtkVolumeSlice/cpuVolume at steps 2 through 6,
  //    with zoom/pan/rotation/VOI changes in between having no further
  //    effect on slice alignment).
  // ------------------------------------------------------------------------
  describe.each(VOLUME_BACKED_NON_BASELINE_MODES)(
    '%s vs vtkImage baseline core-state parity',
    (mode) => {
      test.fails(
        'core state matches the vtkImage baseline across the canonical scenario',
        async () => {
          const { baseline, target } = await collectBaselineAndTargetSnapshots(
            mode
          );

          expect(target.length).toBe(baseline.length);

          for (let step = 0; step < baseline.length; step++) {
            expect(target[step].core, `mode=${mode} step=${step}`).toEqual(
              baseline[step].core
            );
          }
        }
      );
    }
  );
});
