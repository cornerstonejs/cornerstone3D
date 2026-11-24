import { afterEach, describe, expect, test } from 'vitest';
import { Enums } from '@cornerstonejs/core';
import {
  captureViewportState,
  createPlanarViewport,
  renderAndWait,
  type HarnessRenderMode,
  type PlanarViewportContext,
  type ViewportStateSnapshot,
} from './harness';

const ALL_MODES: HarnessRenderMode[] = [
  'vtkFrame',
  'vtkCpuSlice',
  'vtkGpuVolumeSlice',
  'canvasFrame',
  'canvasCpuSlice',
];
const BASELINE_MODE: HarnessRenderMode = 'vtkFrame';

/** The `slice-draw` of the render plan layer that each mode of the harness mounts. */
const DRAW_PATH_OF_MODE: Partial<Record<HarnessRenderMode, string>> = {
  vtkFrame: 'frame-gpu',
  vtkCpuSlice: 'cpu-gpu',
  vtkGpuVolumeSlice: 'gpuVolume-gpu',
  canvasFrame: 'frame-cpu',
  canvasCpuSlice: 'cpu-cpu',
};

// vtkGpuVolumeSlice and canvasCpuSlice are volume-backed and genuinely diverge from
// the vtkFrame/canvasFrame (stack-backed) baseline; see the confirmed findings
// documented above the parity tests below. canvasFrame is stack-backed exactly
// like the baseline (only the render backend differs) and matches exactly.
const CLEAN_NON_BASELINE_MODES: HarnessRenderMode[] = ['canvasFrame'];
const VOLUME_BACKED_NON_BASELINE_MODES: HarnessRenderMode[] = [
  'vtkCpuSlice',
  'vtkGpuVolumeSlice',
  'canvasCpuSlice',
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
  mode: HarnessRenderMode,
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
 * render synchronously before its promise resolves). `scrollDelta` is the
 * scroll of step 2: 2 moves a stack from its first image to its third; a
 * volume counts slices along the view direction, so on this axial view it
 * needs -2 to reach the same image.
 */
async function runCanonicalScenario(
  ctx: PlanarViewportContext,
  scrollDelta = 2
): Promise<ViewportStateSnapshot[]> {
  const { viewport, element, displaySetId } = ctx;
  const snapshots: ViewportStateSnapshot[] = [];

  // Step 1: initial render (already done by createPlanarViewport).
  snapshots.push(captureViewportState(viewport, displaySetId));

  // Step 2: scroll(2). setImageIdIndex settles the view state and renders
  // synchronously within the returned promise, so no extra render/wait step
  // is needed here.
  await viewport.scroll(scrollDelta);
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

  // Step 6: set a VOI via setDisplaySetAppearance then render.
  viewport.setDisplaySetAppearance(displaySetId, {
    voiRange: { lower: 0, upper: 200 },
  });
  await renderAndWait(element, viewport);
  snapshots.push(captureViewportState(viewport, displaySetId));

  return snapshots;
}

/**
 * Runs the baseline (vtkFrame) and a target mode through the canonical
 * scenario under a shared displaySetId (so viewReference.displaySetId and the
 * presentation lookup key line up across the two runs and do not pollute
 * the diff with an incidental id mismatch), tearing each context down before
 * the next is created. `targetScrollDelta` is the scroll of step 2 for the
 * target mode.
 */
async function collectBaselineAndTargetSnapshots(
  mode: HarnessRenderMode,
  targetScrollDelta = 2
): Promise<{
  baseline: ViewportStateSnapshot[];
  target: ViewportStateSnapshot[];
}> {
  const displaySetId = `render-path-parity:${mode}`;

  const baselineCtx = await setupMode(BASELINE_MODE, displaySetId);
  const baseline = await runCanonicalScenario(baselineCtx);
  teardown(baselineCtx);

  const targetCtx = await setupMode(mode, displaySetId);
  const target = await runCanonicalScenario(targetCtx, targetScrollDelta);
  teardown(targetCtx);

  return { baseline, target };
}

/**
 * The core state of a snapshot without the fields of the volume content mode:
 * the mode name, the slice indices counted along the view direction, the
 * slice of the view state, and the volume id of the view reference.
 */
function withoutVolumeContentMode(
  core: ViewportStateSnapshot['core']
): Record<string, unknown> {
  const {
    currentMode: _currentMode,
    sliceIndex: _sliceIndex,
    currentImageIdIndex: _currentImageIdIndex,
    viewState,
    viewReference,
    ...rest
  } = core;
  const { slice: _slice, ...viewStateRest } = viewState as Record<
    string,
    unknown
  >;
  const {
    volumeId: _volumeId,
    sliceIndex: _referenceSliceIndex,
    ...viewReferenceRest
  } = viewReference as Record<string, unknown>;

  return {
    ...rest,
    viewState: viewStateRest,
    viewReference: viewReferenceRest,
  };
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
        // modes (canvasFrame, canvasCpuSlice) mount a CanvasActor; GPU modes
        // (vtkFrame, vtkGpuVolumeSlice) mount a vtk.js actor. Note: vtkFrame and
        // vtkGpuVolumeSlice both mount an actor whose getClassName() is
        // "vtkImageSlice" (ImageActor) -- vtk.js reuses the same actor class
        // for the plain image mapper and the reslice mapper, distinguishing
        // them only by mapper class (vtkImageMapper vs vtkImageResliceMapper,
        // which `actor.getMapper()` gives). The frozen
        // pathSpecific contract (actorClassNames/actorUIDs only) cannot
        // surface that distinction, so this check is intentionally scoped to
        // CPU-vs-GPU rather than to the specific GPU sub-mode.
        const isCpuMode = mode === 'canvasFrame' || mode === 'canvasCpuSlice';
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

        const { slice, draw } = viewport.getRenderPlan()[0];

        expect(`${slice}-${draw}`).toBe(DRAW_PATH_OF_MODE[mode]);
      } finally {
        teardown(ctx);
      }
    }
  );

  test('vtkFrame baseline snapshot survives a JSON round-trip', async () => {
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
    '%s vs vtkFrame baseline core-state parity',
    (mode) => {
      test('core state matches the vtkFrame baseline across the canonical scenario', async () => {
        const { baseline, target } =
          await collectBaselineAndTargetSnapshots(mode);

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
  // vtkGpuVolumeSlice and canvasCpuSlice are volume-backed: the harness mounts
  // their planar display set with `mode: 'volume'` (see
  // createPlanarViewport.ts) so PlanarRenderPathDecisionService selects the
  // volume render path (packages/core/src/RenderingEngine/Viewports/
  // Planar/PlanarRenderPathDecisionService.ts, resolvePathInputs). Two
  // distinct divergences from the vtkFrame/canvasFrame (stack-backed) baseline
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
  // 2. The volume-backed modes count slices along the view direction, as the
  //    5.x volume viewport did in `getSliceIndex` and
  //    `getCurrentImageIdIndex`: on this axial view the first image (z = 0)
  //    is slice 4 of 5, in `core.sliceIndex`, `core.currentImageIdIndex`
  //    and `core.viewReference.sliceIndex`, and `core.viewState.slice` is a
  //    `volumePoint`. A scroll moves along the view direction too, so the
  //    volume-backed run scrolls by -2 where the stack scrolls by 2 to reach
  //    the same image. Everything else, the shown plane included, equals the
  //    baseline at every step. An earlier pin here showed the volume-backed
  //    modes opening on the last image (z = 4); they open on the first image
  //    now.
  // ------------------------------------------------------------------------
  // vtkGpuVolumeSliceFrames: a reduced volume draws the acquired frames in the
  // acquisition plane. A one-pixel bar on a 512 x 512 stack shows the
  // difference: `low` halves the texture and blurs the bar, the frame keeps it.
  describe('vtkGpuVolumeSliceFrames (acquired frames of a reduced volume)', () => {
    const stack = { rows: 512, columns: 512, barStart: 256, barWidth: 1 };

    const setupFrames = async (mode: HarnessRenderMode) => {
      const ctx = await createPlanarViewport({
        renderMode: mode,
        stack,
        width: 512,
        height: 512,
      });
      activeCleanups.push(ctx.cleanup);
      return ctx;
    };

    const frameEntry = (ctx: PlanarViewportContext) =>
      ctx.viewport.getActors().find((entry) => !entry.referencedId);

    const showsFrame = (ctx: PlanarViewportContext) =>
      frameEntry(ctx)?.actor.getVisibility() === true;

    const centerRow = (ctx: PlanarViewportContext) => {
      const canvas = ctx.viewport.getCanvas();
      const { width, height } = canvas;

      return Array.from(
        canvas
          .getContext('2d')
          .getImageData(0, Math.floor(height / 2), width, 1).data
      ).filter((_, i) => i % 4 === 0);
    };

    test('shows the frame in the acquisition plane, as the stack draws it', async () => {
      const stackCtx = await setupFrames('vtkFrame');
      const stackRow = centerRow(stackCtx);
      teardown(stackCtx);

      const ctx = await setupFrames('vtkGpuVolumeSliceFrames');

      await expect.poll(() => showsFrame(ctx)).toBe(true);
      await renderAndWait(ctx.element, ctx.viewport);

      expect(ctx.viewport.getCurrentMode()).toBe('volume');
      expect(ctx.viewport.getDefaultActor().referencedId).toBeDefined();
      expect(ctx.viewport.getFidelityState().lossy).toBe(false);
      expect(Math.max(...centerRow(ctx))).toBe(Math.max(...stackRow));
      teardown(ctx);
    });

    test('shows the reduced slice off the acquisition plane, and the same frame actor on return', async () => {
      const ctx = await setupFrames('vtkGpuVolumeSliceFrames');

      await expect.poll(() => showsFrame(ctx)).toBe(true);
      await renderAndWait(ctx.element, ctx.viewport);
      const framePeak = Math.max(...centerRow(ctx));
      const frameActor = frameEntry(ctx).actor;

      // 5 degrees moves the plane by more than half a slice (CS-B4).
      const angle = (5 * Math.PI) / 180;
      ctx.viewport.setViewState({
        orientation: {
          viewPlaneNormal: [0, Math.sin(angle), Math.cos(angle)],
          viewUp: [0, -Math.cos(angle), Math.sin(angle)],
        },
      });
      await renderAndWait(ctx.element, ctx.viewport);

      expect(showsFrame(ctx)).toBe(false);
      expect(ctx.viewport.getFidelityState().lossy).toBe(true);
      expect(Math.max(...centerRow(ctx))).toBeLessThan(framePeak);

      ctx.viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);
      await renderAndWait(ctx.element, ctx.viewport);
      expect(showsFrame(ctx)).toBe(false);

      ctx.viewport.setOrientation(Enums.OrientationAxis.AXIAL);
      await expect.poll(() => showsFrame(ctx)).toBe(true);
      expect(frameEntry(ctx).actor).toBe(frameActor);
      teardown(ctx);
    });
  });

  describe.each(VOLUME_BACKED_NON_BASELINE_MODES)(
    '%s vs vtkFrame baseline core-state parity',
    (mode) => {
      test('core state matches the vtkFrame baseline across the canonical scenario, apart from the volume content mode', async () => {
        const { baseline, target } = await collectBaselineAndTargetSnapshots(
          mode,
          -2
        );

        expect(target.length).toBe(baseline.length);

        for (let step = 0; step < baseline.length; step++) {
          const label = `mode=${mode} step=${step}`;
          const base = baseline[step].core;
          const core = target[step].core;
          const reference = core.viewReference as Record<string, unknown>;
          const slice = (core.viewState as { slice: { kind: string } }).slice;
          const sliceAlongView =
            base.numberOfSlices - 1 - base.currentImageIdIndex;

          expect(base.currentMode, label).toBe('stack');
          expect(core.currentMode, label).toBe('volume');
          expect(core.currentImageIdIndex, label).toBe(sliceAlongView);
          expect(core.sliceIndex, label).toBe(sliceAlongView);
          expect(reference.sliceIndex, label).toBe(sliceAlongView);
          expect(reference.volumeId, label).toBeDefined();
          expect(slice.kind, label).toBe('volumePoint');
          expect(withoutVolumeContentMode(core), label).toEqual(
            withoutVolumeContentMode(base)
          );
        }
      });
    }
  );
});
