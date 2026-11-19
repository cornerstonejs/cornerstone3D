import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type {
  IImage,
  Point3,
  ViewportFidelityCause,
  VoxelGrid,
  VoxelQualityRecord,
} from '../../../types';
import { compareVoxelQuality } from '../../../utilities/voxelGrid';
import {
  type FidelityDisplay,
  displaySpacingForGrid,
} from './displaySpacingOfViewport';
import {
  type FidelityLine,
  isReduced,
  reductionFactorsOf,
} from './fidelityIndicatorState';

/** The typed fidelity fields of one binding (GENVIEW-FIDELITY-2). */
export type BindingFidelitySource = {
  record?: VoxelQualityRecord;
  fullGrid?: VoxelGrid;
  sampleDistanceLod?: number;
  sampleDistanceIdle?: number;
  interactiveReduction?: boolean;
  imageQualityStatus?: ImageQualityStatus;
  qualityPending?: boolean;
  reductionCause?: ViewportFidelityCause;
  label?: string;
  skip?: boolean;
};

/**
 * Builds fidelity lines from the fidelity fields that render paths set on
 * their renderings (GENVIEW-FIDELITY-2): a volume line for a record, a stack
 * line for an image quality. Does not read actors or mappers.
 */
export function fidelityLinesFromBindings(
  display: FidelityDisplay | undefined,
  sources: BindingFidelitySource[]
): FidelityLine[] {
  const lines: FidelityLine[] = [];

  for (const source of sources) {
    if (source.skip) {
      continue;
    }

    if (!source.record) {
      if (source.imageQualityStatus !== undefined) {
        lines.push({
          ...fidelityLineFromImageQuality(
            source.imageQualityStatus,
            source.qualityPending
          ),
          label: source.label ?? 'Image',
          interactiveReduction: source.interactiveReduction,
        });
      }
      continue;
    }

    const { record } = source;
    const fullGrid = source.fullGrid ?? record.grid;
    const reductionFactors = reductionFactorsOf(record.grid, fullGrid);
    const fullResolution = !isReduced(reductionFactors);
    const displaySpacing = display
      ? displaySpacingForGrid(display, record.grid, fullGrid)
      : undefined;
    // Only apply magnification when display spacing is known; otherwise keep
    // the reduction-factor path (FIDELITY-STATE-6).
    const verdict = displaySpacing
      ? compareVoxelQuality(record, { displaySpacing })
      : undefined;

    lines.push({
      label: source.label ?? 'Image',
      record,
      verdict,
      displaySpacing,
      reductionFactors,
      fullResolution,
      sampleDistanceLod: source.sampleDistanceLod ?? 1,
      sampleDistanceIdle: source.sampleDistanceIdle,
      interactiveReduction: source.interactiveReduction,
      qualityPending: source.qualityPending,
      reductionCause: source.reductionCause,
    });
  }

  return lines;
}

/** One fidelity line for a stack image of the given quality. */
function fidelityLineFromImageQuality(
  imageQualityStatus: ImageQualityStatus,
  qualityPending?: boolean
): FidelityLine {
  return {
    label: 'Image',
    imageQualityStatus,
    qualityPending,
    reductionFactors: [1, 1, 1] as Point3,
    fullResolution: imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION,
    sampleDistanceLod: 1,
  };
}

/**
 * One fidelity line for the image a stack viewport shows now
 * (FIDELITY-STATE-8).
 */
export function fidelityLineFromStackImage(
  image: IImage | undefined
): FidelityLine[] {
  if (!image) {
    return [];
  }

  return [
    fidelityLineFromImageQuality(
      imageQualityStatusOf(image),
      image.imageQualityPending
    ),
  ];
}

/** The quality of a stack image; an image with no status is full resolution. */
export function imageQualityStatusOf(image: IImage): ImageQualityStatus;
export function imageQualityStatusOf(
  image: IImage | undefined
): ImageQualityStatus | undefined;
export function imageQualityStatusOf(
  image: IImage | undefined
): ImageQualityStatus | undefined {
  return image
    ? (image.imageQualityStatus ?? ImageQualityStatus.FULL_RESOLUTION)
    : undefined;
}
