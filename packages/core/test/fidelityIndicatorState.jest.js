import { describe, it, expect } from '@jest/globals';
import {
  svgStateOf,
  lineKind,
  isInteractiveLod,
  isReduced,
  reductionFactorsOf,
} from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import VoxelReductions from '../src/enums/VoxelReductions';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';

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
  return {
    grid: g,
    status: ImageQualityStatus.FULL_RESOLUTION,
    lowest: ImageQualityStatus.FULL_RESOLUTION,
    highest: ImageQualityStatus.FULL_RESOLUTION,
    missing: 0,
    voxels: 64 * 64 * 64,
    exact: true,
    source: 'volume',
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

describe('fidelityIndicatorState', () => {
  describe('svgStateOf', () => {
    it('stays hidden with no lines or no quality record', () => {
      expect(svgStateOf([])).toBe('hidden');
      expect(svgStateOf([line({ record: undefined })])).toBe('hidden');
    });

    it('prioritises loading over lod, lossy, and done', () => {
      expect(
        svgStateOf([
          line({ record: record({ missing: 10 }) }),
          line({
            sampleDistanceLod: 2,
            fullResolution: false,
            reductionFactors: [2, 2, 2],
          }),
        ])
      ).toBe('loading');
    });

    it('prioritises lod over lossy and done', () => {
      expect(
        svgStateOf([
          line({ sampleDistanceLod: 2 }),
          line({
            fullResolution: false,
            reductionFactors: [2, 2, 2],
          }),
        ])
      ).toBe('lod');
    });

    it('prioritises lossy over done', () => {
      expect(
        svgStateOf([
          line({
            fullResolution: false,
            reductionFactors: [2, 2, 2],
          }),
          line(),
        ])
      ).toBe('lossy');
    });

    it('reports loading when one volume has no record yet', () => {
      expect(svgStateOf([line(), line({ record: undefined })])).toBe('loading');
    });

    it('reports done when every recorded line is full resolution', () => {
      expect(svgStateOf([line(), line()])).toBe('done');
    });
  });

  describe('lineKind', () => {
    it('is loading when voxels are missing', () => {
      expect(lineKind(line({ record: record({ missing: 1 }) }))).toBe(
        'loading'
      );
    });

    it('is lod when sample distance is raised', () => {
      expect(lineKind(line({ sampleDistanceLod: 2 }))).toBe('lod');
    });

    it('is lossy for aliasing reduction', () => {
      expect(
        lineKind(
          line({
            record: record({ reduction: VoxelReductions.Decimation }),
          })
        )
      ).toBe('lossy');
    });

    it('is lossy when the drawn grid is coarser than the full volume', () => {
      expect(
        lineKind(
          line({
            fullResolution: false,
            reductionFactors: [2, 2, 10],
          })
        )
      ).toBe('lossy');
    });

    it('is done when a reduction is not visible at the display spacing', () => {
      // FIDELITY-NOTIFY-7: box average under low magnification is not a warning.
      // Large-study axial: shared 1×1×2 texture, verdict lossless → done.
      expect(
        lineKind(
          line({
            fullResolution: false,
            reductionFactors: [1, 1, 2],
            record: record({
              grid: grid([512, 512, 1232], [1, 1, 2]),
              reduction: VoxelReductions.BoxAverage,
            }),
            verdict: {
              lossless: true,
              causes: [],
              magnitude: 0.5,
              record: record({
                grid: grid([512, 512, 1232], [1, 1, 2]),
                reduction: VoxelReductions.BoxAverage,
              }),
            },
          })
        )
      ).toBe('done');
    });

    it('is lossy when a spatial reduction is visible at the display spacing', () => {
      // Large-study sag/cor: same 1×1×2 texture, resolution cause → lossy.
      expect(
        lineKind(
          line({
            fullResolution: false,
            reductionFactors: [1, 1, 2],
            record: record({
              grid: grid([512, 512, 1232], [1, 1, 2]),
              reduction: VoxelReductions.BoxAverage,
            }),
            verdict: {
              lossless: false,
              causes: ['resolution'],
              magnitude: 2,
              record: record({
                grid: grid([512, 512, 1232], [1, 1, 2]),
                reduction: VoxelReductions.BoxAverage,
              }),
            },
          })
        )
      ).toBe('lossy');
    });

    it('is done for full-res data even when the verdict flags resolution', () => {
      // Small study: factors 1×1×1, voxels larger than display pixels must not
      // invent a reduced warning.
      expect(
        lineKind(
          line({
            fullResolution: true,
            reductionFactors: [1, 1, 1],
            record: record({
              grid: grid([64, 64, 64], [1, 1, 1]),
              reduction: VoxelReductions.None,
            }),
            verdict: {
              lossless: false,
              causes: ['resolution'],
              magnitude: 4,
              record: record({
                grid: grid([64, 64, 64], [1, 1, 1]),
                reduction: VoxelReductions.None,
              }),
            },
          })
        )
      ).toBe('done');
    });

    it('is lossy for decimation even when the verdict magnitude is low', () => {
      expect(
        lineKind(
          line({
            fullResolution: false,
            reductionFactors: [2, 2, 2],
            record: record({
              grid: grid([32, 32, 32], [2, 2, 2]),
              reduction: VoxelReductions.Decimation,
            }),
            verdict: {
              lossless: false,
              causes: ['aliasing'],
              magnitude: 0.1,
              record: record({
                grid: grid([32, 32, 32], [2, 2, 2]),
                reduction: VoxelReductions.Decimation,
              }),
            },
          })
        )
      ).toBe('lossy');
    });

    it('is done at full resolution with idle sample distance', () => {
      expect(lineKind(line())).toBe('done');
    });

    it('reports stack image quality without a volume record', () => {
      expect(
        lineKind(
          line({
            record: undefined,
            imageQualityStatus: ImageQualityStatus.LOSSY,
            fullResolution: false,
          })
        )
      ).toBe('lossy');
      expect(
        lineKind(
          line({
            record: undefined,
            imageQualityStatus: ImageQualityStatus.FULL_RESOLUTION,
          })
        )
      ).toBe('done');
    });
  });

  describe('reductionFactorsOf / isReduced / isInteractiveLod', () => {
    it('computes per-axis spacing ratios', () => {
      expect(
        reductionFactorsOf(
          grid([32, 32, 6], [2, 2, 10]),
          grid([64, 64, 64], [1, 1, 1])
        )
      ).toEqual([2, 2, 10]);
    });

    it('detects reduced factors and interactive lod', () => {
      expect(isReduced([1, 1, 1])).toBe(false);
      expect(isReduced([1, 1, 1.1])).toBe(true);
      expect(isInteractiveLod(1)).toBe(false);
      expect(isInteractiveLod(1.02)).toBe(true);
    });

    it('does not treat equal spacing with different origin or dims as reduced', () => {
      const drawn = {
        ...grid([66, 66, 66], [1, 1, 1]),
        origin: [1, 0, 0],
      };
      const full = grid([64, 64, 64], [1, 1, 1]);
      const factors = reductionFactorsOf(drawn, full);

      expect(factors).toEqual([1, 1, 1]);
      expect(isReduced(factors)).toBe(false);
      // fullResolution in readLines is !isReduced(factors)
      expect(!isReduced(factors)).toBe(true);
    });
  });
});
