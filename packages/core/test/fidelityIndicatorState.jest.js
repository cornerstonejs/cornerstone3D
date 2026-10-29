import { describe, it, expect } from '@jest/globals';
import {
  svgStateOf,
  lineKind,
  isInteractiveLod,
  isReduced,
  reductionFactorsOf,
} from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import { fidelityLinesFromBindings } from '../src/RenderingEngine/helpers/fidelityIndicator/collectFidelityLines';
import {
  displaySpacingForGrid,
  pixelSpacingOfCanvasToWorld,
} from '../src/RenderingEngine/helpers/fidelityIndicator/displaySpacingOfViewport';
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
          line({
            record: record({
              missing: 10,
              lowest: ImageQualityStatus.ADJACENT_REPLICATE,
            }),
          }),
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

    it('ignores a volume with no record yet', () => {
      expect(svgStateOf([line(), line({ record: undefined })])).toBe('done');
    });

    it('reports done when every recorded line is full resolution', () => {
      expect(svgStateOf([line(), line()])).toBe('done');
    });
  });

  describe('lineKind', () => {
    it('is done for an ordinary load: voxels missing, all deliveries full resolution', () => {
      expect(lineKind(line({ record: record({ missing: 1 }) }))).toBe('done');
    });

    it('is loading while replicated, sub-resolution or lossy data stands in for missing voxels', () => {
      for (const lowest of [
        ImageQualityStatus.FAR_REPLICATE,
        ImageQualityStatus.ADJACENT_REPLICATE,
        ImageQualityStatus.SUBRESOLUTION,
        ImageQualityStatus.LOSSY,
      ]) {
        expect(lineKind(line({ record: record({ missing: 1, lowest }) }))).toBe(
          'loading'
        );
      }
    });

    it('is lossy when the complete data was delivered lossy', () => {
      expect(
        lineKind(line({ record: record({ lowest: ImageQualityStatus.LOSSY }) }))
      ).toBe('lossy');
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

    it('is lossy for a standing box average even when the verdict is lossless', () => {
      // FIDELITY-STATE-6: standing box average of a coarser grid is lossy at
      // every magnification (shared 1×1×2 texture).
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
      ).toBe('lossy');
    });

    it('is lossy for a standing box average when the verdict flags resolution', () => {
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

  describe('magnification (FIDELITY-STATE-6)', () => {
    const full = grid([64, 64, 64], [1, 1, 1]);
    // A display where one device pixel is 2 mm.
    const display2mm = (viewPlaneNormal = [0, 0, 1], volume3D = false) => ({
      pixelSpacing: 2,
      viewPlaneNormal,
      volume3D,
    });
    const stateOf = (display, reduction, spacing, fullGrid = full) =>
      svgStateOf(
        fidelityLinesFromBindings(display, [
          {
            record: record({ grid: grid([32, 32, 64], spacing), reduction }),
            fullGrid,
          },
        ])
      );

    it('shows lossy for a standing box average displayed at its own spacing', () => {
      expect(stateOf(display2mm(), VoxelReductions.BoxAverage, [2, 2, 1])).toBe(
        'lossy'
      );
    });

    it('shows lossy for a decimation displayed at a coarser spacing', () => {
      expect(stateOf(display2mm(), VoxelReductions.Decimation, [2, 2, 1])).toBe(
        'lossy'
      );
    });

    it('shows lossy for a box average on the axis normal to a slice view', () => {
      // Through-plane 1×1×2 and standing box-average rule.
      expect(stateOf(display2mm(), VoxelReductions.BoxAverage, [1, 1, 2])).toBe(
        'lossy'
      );
      // Volume3D also stays lossy: standing box average, not magnification.
      expect(
        stateOf(
          display2mm([0, 0, 1], true),
          VoxelReductions.BoxAverage,
          [1, 1, 2]
        )
      ).toBe('lossy');
    });

    it('shows lossy for an in-plane box average in a double-oblique view', () => {
      // 0.5 × 0.5 × 5 mm CT, box average 2×2×1, one pixel is 0.5 mm. The
      // view plane normal makes c = 0.5 with the i and j axes.
      const ct = grid([512, 512, 40], [0.5, 0.5, 5]);
      const display = {
        pixelSpacing: 0.5,
        viewPlaneNormal: [0.5, 0.5, Math.SQRT1_2],
      };

      expect(stateOf(display, VoxelReductions.BoxAverage, [1, 1, 5], ct)).toBe(
        'lossy'
      );
    });
  });

  describe('display spacing edge cases', () => {
    const full = grid([64, 64, 64], [1, 1, 1]);
    const boxAverage = record({
      grid: grid([32, 32, 64], [2, 2, 1]),
      reduction: VoxelReductions.BoxAverage,
    });
    // One CSS pixel is 2 mm.
    const canvasToWorld = ([x, y]) => [2 * x, 2 * y, 0];
    const stateAtRatio = (ratio) => {
      const previous = window.devicePixelRatio;
      window.devicePixelRatio = ratio;
      try {
        const pixelSpacing = pixelSpacingOfCanvasToWorld(canvasToWorld);
        return svgStateOf(
          fidelityLinesFromBindings(
            { pixelSpacing, viewPlaneNormal: [0, 0, 1] },
            [{ record: boxAverage, fullGrid: full }]
          )
        );
      } finally {
        window.devicePixelRatio = previous;
      }
    };

    it('shows lossy for a standing box average at CSS and device pixel spacing', () => {
      // FIDELITY-STATE-6: standing box average is lossy at every magnification.
      expect(stateAtRatio(1)).toBe('lossy');
      expect(stateAtRatio(2)).toBe('lossy');
    });

    it('gives a bad grid direction the pixel size, not an infinite spacing', () => {
      // A valid source grid, so only the guard on the record grid can help.
      const bad = { ...full, direction: new Array(9).fill(NaN) };
      expect(
        displaySpacingForGrid(
          { pixelSpacing: 2, viewPlaneNormal: [0, 0, 1] },
          bad,
          full
        )
      ).toEqual([2, 2, 2]);
    });
  });

  describe('lines without a record', () => {
    it('shows lossy for a reduced texture that has no record', () => {
      expect(
        svgStateOf([
          line({
            record: undefined,
            fullResolution: false,
            reductionFactors: [2, 2, 1],
          }),
        ])
      ).toBe('lossy');
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
