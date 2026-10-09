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

    it('is done at full resolution with idle sample distance', () => {
      expect(lineKind(line())).toBe('done');
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
  });
});
