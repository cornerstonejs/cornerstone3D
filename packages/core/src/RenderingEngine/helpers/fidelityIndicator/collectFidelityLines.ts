import cache from '../../../cache/cache';
import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import ViewportType from '../../../enums/ViewportType';
import type {
  ActorEntry,
  IImage,
  Point3,
  VoxelGrid,
  VoxelQualityRecord,
  VoxelStatistic,
} from '../../../types';
import {
  compareVoxelQuality,
  voxelGridsEqual,
} from '../../../utilities/voxelGrid';
import { sampleDistanceOf } from '../createVolumeMapper';
import {
  type FidelityDisplay,
  displaySpacingForGrid,
  fidelityDisplayOfCamera,
} from './displaySpacingOfViewport';
import { isLabelmapActorEntry } from './isLabelmapActorEntry';
import {
  type FidelityLine,
  isReduced,
  reductionFactorsOf,
} from './fidelityIndicatorState';

type VolumeScalarTextureLike = {
  getGrid?: () => VoxelGrid;
  /** Statistic the texture was provisioned with (FIDELITY-RECORD-3). */
  getStatistic?: () => VoxelStatistic | null | undefined;
};

type VolumeMapperLike = {
  getScalarTexture?: () => VolumeScalarTextureLike;
  getSampleDistance?: () => number;
  getInputData?: () => {
    getSpacing: () => number[];
    getBounds: () => number[];
  };
};

type VolumeViewportLike = {
  getActors: () => ActorEntry[];
  type?: string;
  canvas?: { clientHeight?: number; height?: number };
  sHeight?: number;
  getCamera?: () =>
    | { parallelScale?: number; viewPlaneNormal?: Point3 }
    | undefined;
};

/** The quality record of one volume, for the grid that it was read for. */
export type CachedRecord = {
  grid: VoxelGrid;
  record: VoxelQualityRecord | undefined;
};

/** The typed fidelity fields of one binding (GENVIEW-FIDELITY-2). */
export type BindingFidelitySource = {
  record?: VoxelQualityRecord;
  fullGrid?: VoxelGrid;
  sampleDistanceLod?: number;
  interactiveReduction?: boolean;
  imageQualityStatus?: ImageQualityStatus;
  qualityPending?: boolean;
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
      interactiveReduction: source.interactiveReduction,
    });
  }

  return lines;
}

/**
 * Builds fidelity lines from volume actors on a legacy volume viewport.
 * The viewport owns this path; the indicator UI must not call it.
 */
export function fidelityLinesFromVolumeActors(
  viewport: VolumeViewportLike,
  records: Map<string, CachedRecord> = new Map()
): FidelityLine[] {
  const actors = viewport.getActors();

  if (!actors.length) {
    return [];
  }

  const display = fidelityDisplayOfCamera(viewport, isVolume3D(viewport));
  const lines: FidelityLine[] = [];
  const seen = new Set<string>();

  for (const entry of actors) {
    const id = entry.referencedId ?? entry.uid;
    const volume = id ? cache.getVolume(id) : undefined;

    if (!volume || seen.has(id) || isLabelmapActorEntry(entry)) {
      continue;
    }

    seen.add(id);

    const mapper = (
      entry.actor as { getMapper?: () => VolumeMapperLike }
    ).getMapper?.() as VolumeMapperLike | undefined;
    const texture = mapper?.getScalarTexture?.();
    const grid = texture?.getGrid?.() ?? volume.voxelGrid;
    const fullGrid = volume.voxelGrid;
    let cached = records.get(id);

    if (!cached || !voxelGridsEqual(cached.grid, grid)) {
      // FIDELITY-RECORD-3: the bound texture states the statistic it holds.
      // Fall back to volume.reductionStatistic when the texture has none
      // (non-streaming or unset).
      const statistic = texture?.getStatistic?.() ?? volume.reductionStatistic;
      cached = {
        grid,
        record: volume.getGridQuality(grid, statistic) as
          | VoxelQualityRecord
          | undefined,
      };
      records.set(id, cached);
    }

    const reductionFactors = reductionFactorsOf(grid, fullGrid);
    const record = cached.record;
    const displaySpacing = display
      ? displaySpacingForGrid(display, grid, fullGrid)
      : undefined;
    const verdict =
      record && displaySpacing
        ? compareVoxelQuality(record, { displaySpacing })
        : undefined;

    lines.push({
      label: 'Image',
      record: record ?? undefined,
      verdict,
      displaySpacing,
      reductionFactors,
      // Spacing only — dims/origin differences must not sticky-flag lossy.
      fullResolution: !isReduced(reductionFactors),
      sampleDistanceLod: sampleDistanceLodOf(mapper),
    });
  }

  return lines;
}

function isVolume3D(viewport: VolumeViewportLike): boolean {
  return (
    viewport.type === ViewportType.VOLUME_3D ||
    viewport.type === ViewportType.PERSPECTIVE
  );
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

/**
 * How much coarser the ray sample distance is than idle. 1 when idle or when
 * the mapper has no sample distance (MPR).
 */
export function sampleDistanceLodOf(
  mapper: VolumeMapperLike | undefined
): number {
  if (!mapper?.getSampleDistance) {
    return 1;
  }

  const current = mapper.getSampleDistance();
  const imageData = mapper.getInputData?.();

  if (!imageData || !(current > 0)) {
    return 1;
  }

  const texture = mapper.getScalarTexture?.();
  const baseline = sampleDistanceOf(
    imageData as Parameters<typeof sampleDistanceOf>[0],
    texture,
    1
  );

  if (!(baseline > 0)) {
    return 1;
  }

  return current / baseline;
}
