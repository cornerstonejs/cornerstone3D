import { describe, it, expect } from '@jest/globals';
import {
  buildViewportFidelityState,
  viewportFidelityStateKey,
} from '../src/RenderingEngine/helpers/fidelityIndicator/buildViewportFidelityState';
import { notifyFidelityStateChanged } from '../src/RenderingEngine/helpers/fidelityIndicator/notifyFidelityStateChanged';
import Events from '../src/enums/Events';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import VoxelReductions from '../src/enums/VoxelReductions';
import VoxelDataSources from '../src/enums/VoxelDataSources';

function grid(dimensions, spacing) {
  return {
    dimensions,
    spacing,
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

function record(overrides = {}) {
  const g = overrides.grid ?? grid([64, 64, 64], [1, 1, 1]);
  const voxels =
    overrides.voxels ?? g.dimensions[0] * g.dimensions[1] * g.dimensions[2];
  return {
    grid: g,
    status: ImageQualityStatus.FULL_RESOLUTION,
    lowest: ImageQualityStatus.FULL_RESOLUTION,
    highest: ImageQualityStatus.FULL_RESOLUTION,
    missing: 0,
    voxels,
    exact: true,
    source: VoxelDataSources.DirectLoad,
    reduction: VoxelReductions.None,
    deliveries: 1,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    label: 'Image',
    record: record(),
    reductionFactors: [1, 1, 1],
    fullResolution: true,
    sampleDistanceLod: 1,
    ...overrides,
  };
}

describe('buildViewportFidelityState (FIDELITY-EVENT-5)', () => {
  it('represents every field of the state', () => {
    const state = buildViewportFidelityState(
      [
        line({
          reductionFactors: [1, 1, 2],
          fullResolution: false,
          record: record({
            grid: grid([512, 512, 1232], [1, 1, 2]),
            reduction: VoxelReductions.BoxAverage,
            source: VoxelDataSources.ClientDerived,
          }),
        }),
      ],
      [0.5, 0.5, 0.5]
    );

    expect(state).toEqual(
      expect.objectContaining({
        dataResolution: {
          spacing: [1, 1, 2],
          dimensions: [512, 512, 1232],
        },
        displayResolution: { spacing: [0.5, 0.5, 0.5] },
        reductionKind: VoxelReductions.BoxAverage,
        reductionSource: VoxelDataSources.ClientDerived,
        magnitude: [1, 1, 2],
        cause: 'deviceTextureLimit',
        transient: false,
        progressive: expect.objectContaining({
          status: ImageQualityStatus.FULL_RESOLUTION,
          missing: 0,
          voxels: 512 * 512 * 1232,
        }),
      })
    );
  });

  it('reports an ordinary load as not lossy, with no load cause', () => {
    // Every delivery is full resolution; only the facts show the load.
    const state = buildViewportFidelityState([
      line({
        record: record({
          missing: 100,
          voxels: 1000,
          status: ImageQualityStatus.ADJACENT_REPLICATE,
        }),
      }),
    ]);

    expect(state.lossy).toBe(false);
    expect(state.shownState).toBe('done');
    expect(state.cause).toBeUndefined();
    expect(state.transient).toBe(false);
    expect(state.progressive.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(state.progressive.loadedFraction).toBeCloseTo(0.9);
  });

  it('reports a load that shows replicated or lossy data as a lossy incompleteLoad', () => {
    const state = buildViewportFidelityState([
      line({
        record: record({
          missing: 100,
          voxels: 1000,
          lowest: ImageQualityStatus.ADJACENT_REPLICATE,
        }),
      }),
    ]);

    expect(state.lossy).toBe(true);
    expect(state.shownState).toBe('loading');
    expect(state.cause).toBe('incompleteLoad');
    expect(state.transient).toBe(true);
    expect(state.progressive.lowest).toBe(
      ImageQualityStatus.ADJACENT_REPLICATE
    );
  });

  it('marks interactive LOD as performanceTarget and transient', () => {
    const state = buildViewportFidelityState([line({ sampleDistanceLod: 2 })]);

    expect(state.cause).toBe('performanceTarget');
    expect(state.transient).toBe(true);
  });

  it('maps stack LOSSY ImageQualityStatus without replacing the enum', () => {
    expect(ImageQualityStatus.LOSSY).toBe(7);
    expect(ImageQualityStatus.FULL_RESOLUTION).toBe(8);

    const state = buildViewportFidelityState([
      line({
        record: undefined,
        imageQualityStatus: ImageQualityStatus.LOSSY,
        fullResolution: false,
      }),
    ]);

    expect(state.cause).toBe('lossyDecode');
    expect(state.progressive.status).toBe(ImageQualityStatus.LOSSY);
    expect(state.magnitude).toEqual([1, 1, 1]);
  });

  it('changes viewportFidelityStateKey when progressive load advances', () => {
    const loading = buildViewportFidelityState([
      line({
        record: record({
          missing: 50,
          voxels: 100,
          lowest: ImageQualityStatus.LOSSY,
        }),
      }),
    ]);
    const done = buildViewportFidelityState([
      line({ record: record({ missing: 0, voxels: 100 }) }),
    ]);

    expect(viewportFidelityStateKey(loading)).not.toBe(
      viewportFidelityStateKey(done)
    );
    expect(loading.transient).toBe(true);
    expect(done.cause).toBeUndefined();
    expect(done.transient).toBe(false);
  });

  it('takes cause and progress from the worst volume when volumes differ', () => {
    // A PET that loads with replicated data over a complete CT.
    const ct = line();
    const pet = line({
      record: record({
        missing: 10,
        voxels: 100,
        lowest: ImageQualityStatus.ADJACENT_REPLICATE,
      }),
    });

    for (const lines of [
      [ct, pet],
      [pet, ct],
    ]) {
      const state = buildViewportFidelityState(lines);

      expect(state.lossy).toBe(true);
      expect(state.shownState).toBe('loading');
      expect(state.cause).toBe('incompleteLoad');
      expect(state.transient).toBe(true);
      expect(state.progressive.missing).toBe(10);
    }
  });

  it('gives a decimation the cause of a spatial reduction, not lossyDecode', () => {
    const state = buildViewportFidelityState([
      line({
        reductionFactors: [2, 2, 2],
        fullResolution: false,
        record: record({ reduction: VoxelReductions.Decimation }),
      }),
    ]);

    expect(state.cause).toBe('deviceTextureLimit');
  });
});

describe('notifyFidelityStateChanged (FIDELITY-EVENT-4)', () => {
  function source() {
    const element = document.createElement('div');
    const events = [];
    element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, (evt) =>
      events.push(evt.detail)
    );
    return { id: 'vp-1', renderingEngineId: 're-1', element, events };
  }

  function boxAverageAt(displaySpacing) {
    const data = grid([32, 32, 64], [2, 2, 1]);
    return line({
      reductionFactors: [2, 2, 1],
      fullResolution: false,
      record: record({ grid: data, reduction: VoxelReductions.BoxAverage }),
      displaySpacing,
      verdict: {
        lossless: displaySpacing[0] >= 2,
        causes: displaySpacing[0] >= 2 ? [] : ['resolution'],
        magnitude: 2 / displaySpacing[0],
      },
    });
  }

  it('does not fire on a zoom of a standing box average', () => {
    // FIDELITY-STATE-6: standing box average stays lossy at every magnification,
    // so display-spacing-only zooms do not change the derived state.
    const viewport = source();

    for (const spacing of [4, 3, 2.5, 2, 1]) {
      notifyFidelityStateChanged(viewport, [
        boxAverageAt([spacing, spacing, 1]),
      ]);
    }

    expect(viewport.events).toHaveLength(1);
  });

  it('fires when a standing box average upgrades to full resolution', () => {
    const viewport = source();

    notifyFidelityStateChanged(viewport, [boxAverageAt([2, 2, 1])]);
    notifyFidelityStateChanged(viewport, [
      line({
        reductionFactors: [1, 1, 1],
        fullResolution: true,
        record: record({
          grid: grid([64, 64, 64], [1, 1, 1]),
          reduction: VoxelReductions.None,
        }),
        displaySpacing: [1, 1, 1],
      }),
    ]);

    expect(viewport.events).toHaveLength(2);
    expect(viewport.events[0].state.lossy).toBe(true);
    expect(viewport.events[1].state.lossy).toBe(false);
  });

  it('fires nothing for a viewport with suppressEvents', () => {
    const viewport = { ...source(), suppressEvents: true };

    notifyFidelityStateChanged(viewport, [line()]);

    expect(viewport.events).toHaveLength(0);
  });
});
