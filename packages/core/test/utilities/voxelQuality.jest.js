import { describe, it, expect, afterEach } from '@jest/globals';
import { voxelGrid } from '../../src/utilities';
import {
  ImageQualityStatus,
  VoxelDataSources,
  VoxelReductions,
} from '../../src/enums';
import { __resetVoxelReductionRegistry } from '../../src/utilities/voxelGrid/voxelQuality';

const {
  compareVoxelQuality,
  getVoxelReduction,
  imageQualityStatusOfRecord,
  isAliasingReduction,
  registerVoxelReduction,
} = voxelGrid;

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Builds a record of a region that holds everything at one spacing. */
function makeRecord({
  spacing = [1, 1, 1],
  reduction = VoxelReductions.None,
  source = VoxelDataSources.DirectLoad,
  lowest = ImageQualityStatus.FULL_RESOLUTION,
  voxels = 1000,
  missing = 0,
} = {}) {
  const record = {
    grid: {
      origin: [0, 0, 0],
      direction: identityDirection,
      spacing,
      dimensions: [10, 10, 10],
    },
    reduction,
    source,
    lowest,
    highest: lowest,
    voxels,
    missing,
    deliveries: 1,
    exact: true,
    status: undefined,
  };

  record.status = imageQualityStatusOfRecord(record);

  return record;
}

describe('voxelQuality.compareVoxelQuality', () => {
  it('gives two verdicts from one record, for two readers', () => {
    // Acceptance criterion 7 of issue #2921. One volume, one record, and two
    // viewports that report their quality independently.
    const record = makeRecord({
      spacing: [2, 2, 2],
      reduction: VoxelReductions.BoxAverage,
      source: VoxelDataSources.ClientDerived,
    });

    // A viewport at a low magnification covers 4 mm of the patient with one
    // display pixel, so the data of 2 mm carries that view.
    const lowMagnification = compareVoxelQuality(record, {
      displaySpacing: [4, 4, 4],
    });

    // A viewport at a high magnification covers 0.5 mm with one display pixel,
    // and the data of 2 mm does not carry that view.
    const highMagnification = compareVoxelQuality(record, {
      displaySpacing: [0.5, 0.5, 0.5],
    });

    expect(lowMagnification.lossless).toBe(true);
    expect(lowMagnification.causes).toEqual([]);
    expect(lowMagnification.magnitude).toBeCloseTo(0.5, 10);

    expect(highMagnification.lossless).toBe(false);
    expect(highMagnification.causes).toEqual(['resolution']);
    expect(highMagnification.magnitude).toBeCloseTo(4, 10);

    // The record that produced the two verdicts is one object.
    expect(lowMagnification.record).toBe(record);
    expect(highMagnification.record).toBe(record);
  });

  it('reports the reduced data as lossless where the reduction is not visible', () => {
    // MR-U-5: the user does not get a warning that is not necessary.
    const record = makeRecord({
      spacing: [2, 2, 2],
      reduction: VoxelReductions.BoxAverage,
    });

    expect(
      compareVoxelQuality(record, { displaySpacing: [2, 2, 2] }).lossless
    ).toBe(true);
  });

  it('reports a decimation as lossy at every display resolution', () => {
    // A decimation folds the high spatial frequencies into the signal, and no
    // magnification removes that error.
    const record = makeRecord({
      spacing: [2, 2, 2],
      reduction: VoxelReductions.Decimation,
    });

    const verdict = compareVoxelQuality(record, {
      displaySpacing: [100, 100, 100],
    });

    expect(verdict.lossless).toBe(false);
    expect(verdict.causes).toEqual(['aliasing']);
  });

  it('takes the axis where the data is coarsest', () => {
    const record = makeRecord({ spacing: [1, 1, 5] });
    const verdict = compareVoxelQuality(record, {
      displaySpacing: [1, 1, 1],
    });

    expect(verdict.causes).toEqual(['resolution']);
    expect(verdict.magnitude).toBeCloseTo(5, 10);
  });

  it('reports the data that has not arrived', () => {
    const record = makeRecord({ missing: 250 });
    const strict = compareVoxelQuality(record, {});
    const tolerant = compareVoxelQuality(record, { missingAllowed: 250 });

    expect(strict.causes).toEqual(['missingData']);
    expect(tolerant.lossless).toBe(true);
  });

  it('reports a summary that is below the floor of the reader', () => {
    const record = makeRecord({ lowest: ImageQualityStatus.LOSSY });

    expect(
      compareVoxelQuality(record, {
        minStatus: ImageQualityStatus.FULL_RESOLUTION,
      }).causes
    ).toEqual(['quality']);
    expect(
      compareVoxelQuality(record, { minStatus: ImageQualityStatus.LOSSY })
        .lossless
    ).toBe(true);
  });

  it('gives every cause, and not the first one alone', () => {
    const record = makeRecord({
      spacing: [4, 4, 4],
      reduction: VoxelReductions.Decimation,
      missing: 10,
    });
    const verdict = compareVoxelQuality(record, {
      displaySpacing: [1, 1, 1],
      minStatus: ImageQualityStatus.FULL_RESOLUTION,
    });

    expect(verdict.causes).toEqual([
      'resolution',
      'aliasing',
      'missingData',
      'quality',
    ]);
    expect(verdict.lossless).toBe(false);
  });

  it('never states a resolution that a reader did not ask about', () => {
    // A reader that states no display spacing asks for the data at its own
    // spacing, and the resolution then makes no view lossy.
    const record = makeRecord({
      spacing: [8, 8, 8],
      reduction: VoxelReductions.BoxAverage,
    });

    expect(compareVoxelQuality(record).lossless).toBe(true);
  });
});

describe('voxelQuality.imageQualityStatusOfRecord', () => {
  it('gives the lowest quality of the region', () => {
    expect(
      imageQualityStatusOfRecord({
        lowest: ImageQualityStatus.LOSSY,
        missing: 0,
        voxels: 100,
        reduction: VoxelReductions.BoxAverage,
      })
    ).toBe(ImageQualityStatus.LOSSY);
  });

  it('never states the full resolution for a decimation', () => {
    expect(
      imageQualityStatusOfRecord({
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 0,
        voxels: 100,
        reduction: VoxelReductions.Decimation,
      })
    ).toBe(ImageQualityStatus.SUBRESOLUTION);
  });

  it('falls to a replicate while data is missing', () => {
    expect(
      imageQualityStatusOfRecord({
        lowest: ImageQualityStatus.FULL_RESOLUTION,
        missing: 10,
        voxels: 100,
        reduction: VoxelReductions.None,
      })
    ).toBe(ImageQualityStatus.ADJACENT_REPLICATE);

    expect(
      imageQualityStatusOfRecord({
        lowest: undefined,
        missing: 100,
        voxels: 100,
        reduction: VoxelReductions.None,
      })
    ).toBe(ImageQualityStatus.FAR_REPLICATE);
  });
});

describe('voxelQuality reductions registry', () => {
  afterEach(() => {
    __resetVoxelReductionRegistry();
  });

  it('holds the three kinds of the core package', () => {
    expect(getVoxelReduction(VoxelReductions.None).aliases).toBe(false);
    expect(getVoxelReduction(VoxelReductions.BoxAverage).aliases).toBe(false);
    expect(getVoxelReduction(VoxelReductions.Decimation).aliases).toBe(true);
  });

  it('takes a kind that an extension registers', () => {
    registerVoxelReduction({
      name: 'WAVELET',
      reduction: 'myOrg:wavelet',
      aliases: false,
      description: 'A wavelet of an extension.',
    });

    expect(VoxelReductions.WAVELET).toBe('myOrg:wavelet');
    expect(isAliasingReduction('myOrg:wavelet')).toBe(false);

    const record = makeRecord({
      spacing: [2, 2, 2],
      reduction: 'myOrg:wavelet',
    });

    expect(
      compareVoxelQuality(record, { displaySpacing: [4, 4, 4] }).lossless
    ).toBe(true);
  });

  it('takes a kind that nothing registered as a kind that aliases', () => {
    // An unknown production of the data must never give a verdict of lossless.
    expect(isAliasingReduction('myOrg:nobodyRegisteredThis')).toBe(true);

    const record = makeRecord({ reduction: 'myOrg:nobodyRegisteredThis' });

    expect(compareVoxelQuality(record).lossless).toBe(false);
    expect(compareVoxelQuality(record).causes).toEqual(['aliasing']);
  });

  it('refuses a definition that states no aliasing', () => {
    expect(() => registerVoxelReduction({ reduction: 'myOrg:silent' })).toThrow(
      /aliases/
    );
  });
});
