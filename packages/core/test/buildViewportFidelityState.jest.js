import { describe, it, expect } from '@jest/globals';
import {
  buildViewportFidelityState,
  viewportFidelityStateKey,
} from '../src/RenderingEngine/helpers/fidelityIndicator/buildViewportFidelityState';
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

describe('buildViewportFidelityState (VFS-API-3)', () => {
  it('represents every VFS-API-3 field on the type (VFS-API-18)', () => {
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
        substitutedDefaults: undefined,
        renderPathId: undefined,
      })
    );
  });

  it('marks incomplete load as transient incompleteLoad (VFS-API-19)', () => {
    const state = buildViewportFidelityState([
      line({
        record: record({ missing: 100, voxels: 1000 }),
      }),
    ]);

    expect(state.cause).toBe('incompleteLoad');
    expect(state.transient).toBe(true);
    expect(state.progressive.loadedFraction).toBeCloseTo(0.9);
  });

  it('marks interactive LOD as performanceTarget and transient', () => {
    const state = buildViewportFidelityState([line({ sampleDistanceLod: 2 })]);

    expect(state.cause).toBe('performanceTarget');
    expect(state.transient).toBe(true);
  });

  it('maps stack LOSSY ImageQualityStatus without replacing the enum (VF-CS3D-8)', () => {
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
      line({ record: record({ missing: 50, voxels: 100 }) }),
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

  it('shapes event detail fields magnitude / cause / transient (VFS-API-12)', () => {
    const state = buildViewportFidelityState([
      line({
        reductionFactors: [2, 2, 4],
        fullResolution: false,
        record: record({
          reduction: VoxelReductions.BoxAverage,
          source: VoxelDataSources.ClientDerived,
        }),
      }),
    ]);

    const detail = {
      viewportId: 'vp-1',
      renderingEngineId: 're-1',
      state,
    };

    expect(detail.state.magnitude).toEqual([2, 2, 4]);
    expect(detail.state.cause).toBe('deviceTextureLimit');
    expect(detail.state.transient).toBe(false);
  });
});
