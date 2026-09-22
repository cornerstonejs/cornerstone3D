import ImageQualityStatus from '../../enums/ImageQualityStatus';
import VoxelReductions, {
  registerVoxelReductionsConstant,
} from '../../enums/VoxelReductions';
import type {
  VoxelQualityRecord,
  VoxelQualityRequirement,
  VoxelQualityVerdict,
  VoxelQualityCause,
  VoxelReduction,
  VoxelReductionConstants,
  VoxelReductionDefinition,
} from '../../types';

type RegisterVoxelReductionNamedOptions<
  Name extends keyof VoxelReductionConstants,
> = VoxelReductionDefinition & {
  /** Constant name added on `Enums.VoxelReductions`, e.g. 'WAVELET'. */
  name: Name;
  reduction: VoxelReductionConstants[Name];
};

type RegisterVoxelReductionUnnamedOptions = VoxelReductionDefinition & {
  reduction: VoxelReduction | string;
  name?: never;
};

export type RegisterVoxelReductionOptions =
  | RegisterVoxelReductionNamedOptions<keyof VoxelReductionConstants>
  | RegisterVoxelReductionUnnamedOptions;

const reductionDefinitions = new Map<string, VoxelReductionDefinition>();
const registeredConstantNames: Array<keyof VoxelReductionConstants> = [];
let hasRegisteredCoreVoxelReductions = false;

function registerCoreVoxelReductions(): void {
  if (hasRegisteredCoreVoxelReductions) {
    return;
  }
  hasRegisteredCoreVoxelReductions = true;

  registerVoxelReduction({
    reduction: VoxelReductions.None,
    aliases: false,
    description: 'The data holds every voxel of its own grid.',
  });
  registerVoxelReduction({
    reduction: VoxelReductions.BoxAverage,
    aliases: false,
    description: 'The mean of the source voxels of one box.',
  });
  registerVoxelReduction({
    reduction: VoxelReductions.Decimation,
    aliases: true,
    description:
      'Every n-th source voxel. It folds the high spatial frequencies into the signal.',
  });
}

/**
 * Adds a kind of a reduction, and — when `name` is given — a constant on
 * `Enums.VoxelReductions`.
 *
 * `aliases` states whether this kind folds the high spatial frequencies into
 * the signal. A verdict reads that field, and nothing else of the definition:
 * a reduction that aliases makes a view lossy at EVERY display resolution,
 * because no display removes an alias, and a reduction that does not alias is
 * lossless at a display resolution that its spacing can carry.
 *
 * For compile-time typing, augment the `VoxelReductionRegistry` (wire strings)
 * and `VoxelReductionConstants` (constant names) interfaces in your extension's
 * `.d.ts`.
 */
function registerVoxelReduction<Name extends keyof VoxelReductionConstants>(
  options: RegisterVoxelReductionNamedOptions<Name>
): void;
function registerVoxelReduction(
  options: RegisterVoxelReductionUnnamedOptions
): void;
function registerVoxelReduction({
  reduction,
  name,
  aliases,
  description,
}: RegisterVoxelReductionOptions): void {
  if (!reduction) {
    throw new Error('registerVoxelReduction: the definition needs a reduction');
  }

  if (reductionDefinitions.has(reduction)) {
    throw new Error(`Voxel reduction "${reduction}" is already registered`);
  }

  if (typeof aliases !== 'boolean') {
    throw new Error(
      `Voxel reduction "${reduction}" must state whether it aliases`
    );
  }

  if (name && Object.prototype.hasOwnProperty.call(VoxelReductions, name)) {
    throw new Error(
      `Voxel reduction constant "${String(name)}" already exists`
    );
  }

  reductionDefinitions.set(reduction, { reduction, aliases, description });

  if (name) {
    registerVoxelReductionsConstant(
      name,
      reduction as VoxelReductionConstants[typeof name]
    );
    registeredConstantNames.push(name);
  }
}

/** Gives the definition of one kind of a reduction. */
function getVoxelReduction(
  reduction: VoxelReduction | string
): VoxelReductionDefinition {
  registerCoreVoxelReductions();

  return reductionDefinitions.get(reduction);
}

/**
 * States whether this kind of a reduction aliases. A kind that nothing
 * registered counts as a kind that ALIASES, because an unknown production of
 * the data must never produce a verdict of "lossless".
 */
function isAliasingReduction(reduction: VoxelReduction | string): boolean {
  return getVoxelReduction(reduction)?.aliases !== false;
}

/**
 * Test-only: wipes the registrations and the constants that
 * `registerVoxelReduction()` added.
 * @internal
 */
function __resetVoxelReductionRegistry(): void {
  reductionDefinitions.clear();
  hasRegisteredCoreVoxelReductions = false;

  for (const name of registeredConstantNames) {
    delete (VoxelReductions as Record<keyof VoxelReductionConstants, string>)[
      name
    ];
  }
  registeredConstantNames.length = 0;
}

/**
 * Gives the comparable summary of one record.
 *
 * `ImageQualityStatus` stays as the comparable summary, and the code DERIVES
 * that summary from the record, so every existing `minQuality` floor and every
 * existing guard against a regression of the quality keeps working.
 *
 * The summary takes the LOWEST quality of the deliveries of the region, because
 * the summary of a region is no better than its worst part, and a region that
 * holds data that has not arrived falls to `FAR_REPLICATE`, which is the lowest
 * value that the vocabulary holds.
 *
 * @param record - the absolute record of a region
 * @returns the comparable summary
 */
function imageQualityStatusOfRecord(
  record: Pick<
    VoxelQualityRecord,
    'lowest' | 'missing' | 'voxels' | 'reduction'
  >
): ImageQualityStatus {
  if (record.missing >= record.voxels) {
    return ImageQualityStatus.FAR_REPLICATE;
  }

  if (record.missing > 0) {
    return Math.min(
      record.lowest ?? ImageQualityStatus.FAR_REPLICATE,
      ImageQualityStatus.ADJACENT_REPLICATE
    );
  }

  const lowest = record.lowest ?? ImageQualityStatus.FAR_REPLICATE;

  if (isAliasingReduction(record.reduction)) {
    // A decimation holds an error that no display removes, so its summary never
    // states the full resolution.
    return Math.min(lowest, ImageQualityStatus.SUBRESOLUTION);
  }

  return lowest;
}

/**
 * COMPARES ONE RECORD AGAINST THE REQUIREMENT OF ONE READER, and gives the
 * verdict.
 *
 * THE FUNCTION IS PURE, and the verdict belongs to the pair of the data and the
 * reader. Two viewports over one volume hold one record and a different verdict
 * at one moment, and both verdicts are correct. A caller can cache a record,
 * and a caller must not cache a verdict.
 *
 * A view is lossless when each of these holds:
 *
 * - the spacing of the data carries one display pixel of the reader, or the
 *   reader states no display spacing;
 * - the reduction that produced the data does not alias;
 * - no more of the region is missing than the reader accepts;
 * - the comparable summary reaches the floor that the reader states.
 *
 * MR-U-5: a viewport that shows reduced data at a magnification where the
 * reduction is not visible reports the view as LOSSLESS. The user does not get
 * a warning that is not necessary.
 *
 * @param record - the absolute record of a region
 * @param requirement - what this reader needs of the data
 * @returns the verdict of this reader
 */
function compareVoxelQuality(
  record: VoxelQualityRecord,
  requirement: VoxelQualityRequirement = {}
): VoxelQualityVerdict {
  const { displaySpacing, missingAllowed = 0, minStatus } = requirement;
  const causes: VoxelQualityCause[] = [];
  let magnitude = 0;

  if (displaySpacing) {
    for (let axis = 0; axis < 3; axis++) {
      const display = displaySpacing[axis];

      if (!(display > 0)) {
        continue;
      }

      magnitude = Math.max(magnitude, record.grid.spacing[axis] / display);
    }

    if (magnitude > 1 + 1e-6) {
      causes.push('resolution');
    }
  }

  if (isAliasingReduction(record.reduction)) {
    causes.push('aliasing');
  }

  if (record.missing > missingAllowed) {
    causes.push('missingData');
  }

  if (minStatus !== undefined && record.status < minStatus) {
    causes.push('quality');
  }

  return { lossless: causes.length === 0, causes, magnitude, record };
}

export {
  registerVoxelReduction,
  getVoxelReduction,
  isAliasingReduction,
  imageQualityStatusOfRecord,
  compareVoxelQuality,
  __resetVoxelReductionRegistry,
};
