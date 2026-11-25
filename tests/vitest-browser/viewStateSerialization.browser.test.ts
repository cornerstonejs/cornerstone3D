// Plan 6: serialization and session restore.
//
// Pins the persistence contract downstream apps (OHIF hanging protocols,
// session restore) depend on: the publicly readable state of a viewport can
// be serialized to JSON, the viewport destroyed, and a fresh viewport
// restored to an equivalent state from that JSON alone.

import { afterEach, describe, expect, test } from 'vitest';
import { Enums, type PlanarViewport } from '@cornerstonejs/core';
import {
  captureViewportState,
  createPlanarViewport,
  recordEvents,
  renderAndWait,
  round6,
  type CreatePlanarViewportOptions,
  type FakeStackOptions,
  type PlanarViewportContext,
} from './harness';

const { Events, InterpolationType } = Enums;

/**
 * The serializable payload under test, exactly as specified by plan 06.
 */
interface PersistedViewportState {
  viewState: ReturnType<PlanarViewport['getViewState']>;
  presentation: ReturnType<PlanarViewport['getDisplaySetPresentation']>;
  reference: ReturnType<PlanarViewport['getViewReference']>;
}

// Safety net matching the pattern in renderPathParity.browser.test.ts: track
// every context created by a test so afterEach can always tear it down, even
// if the test throws before reaching its own cleanup call.
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

async function makeViewport(
  opts?: CreatePlanarViewportOptions
): Promise<PlanarViewportContext> {
  const ctx = await createPlanarViewport(opts);
  activeCleanups.push(ctx.cleanup);
  return ctx;
}

function teardown(ctx: PlanarViewportContext): void {
  ctx.cleanup();
  activeCleanups = activeCleanups.filter((cleanup) => cleanup !== ctx.cleanup);
}

/**
 * Builds the raw (un-normalized) persistence payload straight off the public
 * getters, exactly as a downstream app would before doing any sanitation of
 * its own. Used by the JSON-safety test to inspect what the API actually
 * hands back.
 */
function buildRawPayload(
  viewport: PlanarViewport,
  displaySetId: string
): PersistedViewportState {
  return {
    viewState: viewport.getViewState(),
    presentation: viewport.getDisplaySetPresentation(displaySetId),
    reference: viewport.getViewReference(),
  };
}

/**
 * Deep-clones and rounds every number, converts typed arrays to plain
 * arrays, and drops undefined-valued object properties. This mirrors the
 * (unexported) normalization walker inside
 * harness/captureViewportState.ts -- duplicated locally per the plan 06
 * instruction to add local helpers rather than edit harness files.
 */
function normalizeDeep(value: unknown): unknown {
  if (typeof value === 'number') {
    return round6(value);
  }

  if (
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Uint8Array
  ) {
    return Array.from(value, (item) => round6(item));
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDeep(item));
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      const normalized = normalizeDeep(source[key]);

      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }

    return out;
  }

  return value;
}

/**
 * Builds the serializable payload and returns it as a JSON string.
 *
 * Normalizes before stringifying. Test 1 below probes whether the raw
 * public state (viewState/presentation/reference straight off the getters)
 * is JSON-safe as-is; whatever it finds is recorded in the suite report.
 * Regardless of that finding, `persist` normalizes up front (typed array ->
 * plain array, numbers rounded) so every downstream test in this file
 * restores from a genuinely JSON-safe string -- matching what a real app
 * would ship after its own serialization step.
 */
function persist(viewport: PlanarViewport, displaySetId: string): string {
  return JSON.stringify(
    normalizeDeep(buildRawPayload(viewport, displaySetId))
  );
}

/**
 * Applies a persisted payload to a viewport.
 *
 * Only `setViewState` and `setDisplaySetPresentation` are used --
 * `setViewReference` is intentionally NOT called on top of `setViewState`.
 *
 * Decision (verified empirically by the round-trip test below, and by
 * reading PlanarViewport.setImageIdIndex /
 * PlanarViewReferenceController.applyImageViewReference): for image-backed
 * render paths (vtkImage, cpuImage -- the two modes this suite exercises),
 * `PlanarViewState.slice` already carries `{ kind: 'stackIndex',
 * imageIdIndex }`, and that field is a direct, clamped index into the
 * display set's imageIds array. `setViewState(payload.viewState)` restores
 * it verbatim, which is exactly what `setViewReference` would end up doing
 * internally (it resolves a referencedImageId/sliceIndex back into the same
 * imageIdIndex and calls the same `setImageIdIndex`). So for these two
 * render modes, `setViewState` alone fully encodes and restores the slice;
 * calling `setViewReference` afterward would be redundant. (Volume-backed
 * modes, where `slice` is a `volumePoint` and the mapping is less direct,
 * are out of scope for this suite -- see renderPathParity.browser.test.ts
 * for their documented divergences.)
 */
function restore(
  viewport: PlanarViewport,
  displaySetId: string,
  json: string
): void {
  const payload = JSON.parse(json) as PersistedViewportState;

  viewport.setViewState(payload.viewState);

  if (payload.presentation) {
    viewport.setDisplaySetPresentation(displaySetId, payload.presentation);
  }
}

/**
 * Non-trivially navigates a viewport: slice 3 (of the default 5-slice
 * stack), zoom 1.7, pan [12, -8], rotation 90, flipHorizontal true, plus a
 * non-default interpolation type and VOI range via setDisplaySetPresentation.
 */
async function applyNavigatedState(ctx: PlanarViewportContext): Promise<void> {
  const { viewport, element, displaySetId } = ctx;

  await viewport.setImageIdIndex(3);
  viewport.setZoom(1.7);
  viewport.setPan([12, -8]);
  viewport.setViewState({ rotation: 90, flipHorizontal: true });
  viewport.setDisplaySetPresentation(displaySetId, {
    interpolationType: InterpolationType.NEAREST,
    voiRange: { lower: 0, upper: 120 },
  });

  await renderAndWait(element, viewport);
}

async function createNavigatedViewport(
  opts: CreatePlanarViewportOptions = {}
): Promise<PlanarViewportContext> {
  const ctx = await makeViewport(opts);
  await applyNavigatedState(ctx);
  return ctx;
}

/**
 * Fields legitimately excluded from a core-state equality check after a
 * destroy/recreate or cross-mode restore round trip. An empty list is the
 * goal; every entry here is a finding, not a convenience -- see the suite
 * report for justification of anything listed.
 */
const VOLATILE_FIELDS: string[] = [];

function omitVolatileFields(core: unknown): unknown {
  if (!VOLATILE_FIELDS.length) {
    return core;
  }

  const clone = JSON.parse(JSON.stringify(core));

  for (const path of VOLATILE_FIELDS) {
    const segments = path.split('.');
    let target: Record<string, unknown> | undefined = clone;

    for (let i = 0; i < segments.length - 1 && target; i++) {
      target = target[segments[i]] as Record<string, unknown> | undefined;
    }

    if (target) {
      delete target[segments[segments.length - 1]];
    }
  }

  return clone;
}

function sharedStackAndId(name: string): {
  stack: FakeStackOptions;
  displaySetId: string;
} {
  return {
    stack: {
      name: `serialization-${name}`,
      frameOfReferenceUID: `VITEST_SERIALIZATION_${name.toUpperCase()}_FRAME_OF_REFERENCE`,
    },
    displaySetId: `vitest-serialization-${name}-displayset`,
  };
}

describe('viewStateSerialization', () => {
  // Real finding, kept as test.fails per shared-context rule 5 (confirmed by
  // dumping the raw payload, not a test mistake -- see the report for the
  // full field list). `viewState` and `presentation` are perfectly clean:
  // every number round-trips through JSON.stringify byte-identical to its
  // round6'd form (rotation: 90, flipHorizontal: true, anchorCanvas:
  // [0.53, 0.48], scale: [1.7, 1.7], interpolationType: 0,
  // voiRange: {lower: 0, upper: 120}). The mismatch is entirely inside
  // `reference` (getViewReference()), in two independent ways:
  //   1. Float32 promotion noise on world-space coordinates:
  //      reference.cameraFocalPoint = [32.2529411315918, 30.370590209960938, 3]
  //      reference.planeRestriction.point = the same pair.
  //      32.2529411315918 is the float64 value nearest to a float32 number
  //      (~7 significant digits) -- consistent with gl-matrix's vec3
  //      defaulting to Float32Array internally (see
  //      Planar/planarViewReference.ts, which builds these via `vec3.cross`/
  //      `vec3.negate` on `vec3.create()` buffers) even though the value is
  //      handed back as a plain number, not a typed array.
  //   2. Floating-point trig round-off ("should be zero" values that are
  //      not exactly zero) on orientation vectors, from the 90-degree
  //      rotation in the navigated state:
  //      reference.viewUp = [-1, -6.123234262925839e-17, 0]
  //      reference.planeRestriction.inPlaneVector1 = the same vector
  //      reference.planeRestriction.inPlaneVector2 = [-6.123234262925839e-17, 1, 0]
  //      -6.123234262925839e-17 is the classic `Math.cos(Math.PI / 2)`
  //      double-precision artifact, not an exact 0.
  // Neither issue is a typed array / NaN / Infinity / undefined -- the
  // values are ordinary JSON-safe numbers -- but they are real precision
  // noise that a naive persist-as-is would bake into a session file. `persist`
  // below already runs every field through `normalizeDeep` (round6), which
  // fixes both cases (round6 folds the near-zero trig noise to exactly 0 via
  // its `|| 0` step and rounds the float32 world coordinates to 6 decimals),
  // so the rest of this suite restores from a genuinely stable JSON string.
  test.fails('1. public state payload is JSON-safe', async () => {
    const ctx = await createNavigatedViewport({ renderMode: 'vtkImage' });

    try {
      const raw = buildRawPayload(ctx.viewport, ctx.displaySetId);
      const normalized = normalizeDeep(raw);
      const roundTripped = JSON.parse(JSON.stringify(raw));

      expect(roundTripped).toEqual(normalized);
    } finally {
      teardown(ctx);
    }
  });

  test('2. full destroy/recreate round trip restores core state', async () => {
    const { stack, displaySetId } = sharedStackAndId('roundtrip');

    const a = await createNavigatedViewport({
      renderMode: 'vtkImage',
      stack,
      displaySetId,
    });
    const snapA = captureViewportState(a.viewport, displaySetId);
    const json = persist(a.viewport, displaySetId);
    teardown(a);

    const b = await makeViewport({
      renderMode: 'vtkImage',
      stack,
      displaySetId,
    });
    restore(b.viewport, displaySetId, json);
    await renderAndWait(b.element, b.viewport);
    const snapB = captureViewportState(b.viewport, displaySetId);

    // Sanity: the restore actually navigated to the persisted slice, not
    // just coincidentally matching a default.
    expect(snapB.core.currentImageIdIndex).toBe(3);

    expect(omitVolatileFields(snapB.core)).toEqual(
      omitVolatileFields(snapA.core)
    );
  });

  test('3. cross-render-mode restore (vtkImage -> cpuImage) preserves core state', async () => {
    const { stack, displaySetId } = sharedStackAndId('crossmode');

    const a = await createNavigatedViewport({
      renderMode: 'vtkImage',
      stack,
      displaySetId,
    });
    const snapA = captureViewportState(a.viewport, displaySetId);
    const json = persist(a.viewport, displaySetId);
    teardown(a);

    const b = await makeViewport({
      renderMode: 'cpuImage',
      stack,
      displaySetId,
    });
    restore(b.viewport, displaySetId, json);
    await renderAndWait(b.element, b.viewport);
    const snapB = captureViewportState(b.viewport, displaySetId);

    expect(snapB.core.currentImageIdIndex).toBe(3);

    expect(omitVolatileFields(snapB.core)).toEqual(
      omitVolatileFields(snapA.core)
    );
  });

  describe('4. partial restore is non-destructive', () => {
    test('viewState-only restore leaves presentation at defaults', async () => {
      const { stack, displaySetId } = sharedStackAndId('partial-viewstate');

      const source = await createNavigatedViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });
      const snapSource = captureViewportState(source.viewport, displaySetId);
      const json = persist(source.viewport, displaySetId);
      teardown(source);

      const fresh = await makeViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });
      const defaultSnap = captureViewportState(fresh.viewport, displaySetId);

      const payload = JSON.parse(json) as PersistedViewportState;
      fresh.viewport.setViewState(payload.viewState);
      await renderAndWait(fresh.element, fresh.viewport);
      const afterSnap = captureViewportState(fresh.viewport, displaySetId);

      // Presentation must remain untouched at its pre-restore default.
      expect(afterSnap.core.presentation).toEqual(
        defaultSnap.core.presentation
      );

      // Navigation must match the persisted state.
      expect(afterSnap.core.currentImageIdIndex).toBe(
        snapSource.core.currentImageIdIndex
      );
      expect(afterSnap.core.zoom).toEqual(snapSource.core.zoom);
      expect(afterSnap.core.pan).toEqual(snapSource.core.pan);
      expect(afterSnap.core.rotation).toEqual(snapSource.core.rotation);
      expect(afterSnap.core.viewState).toEqual(snapSource.core.viewState);
    });

    test('presentation-only restore leaves navigation at defaults', async () => {
      const { stack, displaySetId } = sharedStackAndId(
        'partial-presentation'
      );

      const source = await createNavigatedViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });
      const snapSource = captureViewportState(source.viewport, displaySetId);
      const json = persist(source.viewport, displaySetId);
      teardown(source);

      const fresh = await makeViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });
      const defaultSnap = captureViewportState(fresh.viewport, displaySetId);

      const payload = JSON.parse(json) as PersistedViewportState;

      if (payload.presentation) {
        fresh.viewport.setDisplaySetPresentation(
          displaySetId,
          payload.presentation
        );
      }
      await renderAndWait(fresh.element, fresh.viewport);
      const afterSnap = captureViewportState(fresh.viewport, displaySetId);

      // Navigation (slice 0, fit zoom, rotation 0) must be untouched.
      expect(afterSnap.core.viewState).toEqual(defaultSnap.core.viewState);
      expect(afterSnap.core.currentImageIdIndex).toBe(0);
      expect(afterSnap.core.zoom).toEqual(defaultSnap.core.zoom);
      expect(afterSnap.core.rotation).toBe(0);

      // Presentation must match the persisted state.
      expect(afterSnap.core.presentation).toEqual(
        snapSource.core.presentation
      );
    });
  });

  test('5. restoring the same json twice is idempotent', async () => {
    const { stack, displaySetId } = sharedStackAndId('idempotent');

    const source = await createNavigatedViewport({
      renderMode: 'vtkImage',
      stack,
      displaySetId,
    });
    const json = persist(source.viewport, displaySetId);
    teardown(source);

    const target = await makeViewport({
      renderMode: 'vtkImage',
      stack,
      displaySetId,
    });

    restore(target.viewport, displaySetId, json);
    await renderAndWait(target.element, target.viewport);
    const snapAfterFirst = captureViewportState(target.viewport, displaySetId);

    restore(target.viewport, displaySetId, json);
    await renderAndWait(target.element, target.viewport);
    const snapAfterSecond = captureViewportState(
      target.viewport,
      displaySetId
    );

    expect(snapAfterSecond.core).toEqual(snapAfterFirst.core);
  });

  // Real finding (no-op detection gap), kept as test.fails per shared-context
  // rule 5 rather than weakened or deleted. Observed: GenericViewport
  // .setViewState / PlanarViewport.setViewState unconditionally call
  // modified() -> triggerCameraModifiedEvent() whenever a previous-camera
  // snapshot was captured, with no equality check against the incoming
  // patch (see packages/core/src/RenderingEngine/GenericViewport/
  // GenericViewport.ts setViewState and Planar/PlanarViewport.ts
  // setViewState). So a second restore with byte-identical viewState still
  // emits one CAMERA_MODIFIED event; a true no-op restore would emit zero.
  test.fails(
    '5b. a second identical restore does not emit CAMERA_MODIFIED (no-op detection)',
    async () => {
      const { stack, displaySetId } = sharedStackAndId('idempotent-events');

      const source = await createNavigatedViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });
      const json = persist(source.viewport, displaySetId);
      teardown(source);

      const target = await makeViewport({
        renderMode: 'vtkImage',
        stack,
        displaySetId,
      });

      restore(target.viewport, displaySetId, json);
      await renderAndWait(target.element, target.viewport);

      const events = recordEvents(target.element, [Events.CAMERA_MODIFIED]);
      restore(target.viewport, displaySetId, json);
      await renderAndWait(target.element, target.viewport);
      events.stop();

      expect(events.count(Events.CAMERA_MODIFIED)).toBe(0);
    }
  );
});
