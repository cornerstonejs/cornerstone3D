import cache from '../../../cache/cache';
import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type {
  ActorEntry,
  IImage,
  Point3,
  VoxelGrid,
  VoxelQualityRecord,
} from '../../../types';
import {
  compareVoxelQuality,
  voxelGridsEqual,
} from '../../../utilities/voxelGrid';
import { sampleDistanceOf } from '../createVolumeMapper';
import { displaySpacingOfViewport } from './displaySpacingOfViewport';
import { isLabelmapActorEntry } from './isLabelmapActorEntry';
import {
  type FidelityLine,
  isReduced,
  reductionFactorsOf,
} from './fidelityIndicatorState';

type VolumeMapperLike = {
  getScalarTexture?: () => { getGrid?: () => VoxelGrid };
  getSampleDistance?: () => number;
  getInputData?: () => {
    getSpacing: () => number[];
    getBounds: () => number[];
  };
};

type VolumeViewportLike = {
  getActors: () => ActorEntry[];
  canvas?: { clientHeight?: number; height?: number };
  sHeight?: number;
  getCamera?: () => { parallelScale?: number } | undefined;
};

/** The quality record of one volume, for the grid that it was read for. */
export type CachedRecord = {
  grid: VoxelGrid;
  record: VoxelQualityRecord | undefined;
};

type BindingFidelitySource = {
  record?: VoxelQualityRecord;
  fullGrid?: VoxelGrid;
  sampleDistanceLod?: number;
  label?: string;
  skip?: boolean;
};

/**
 * Builds fidelity lines from viewport bindings that already hold
 * `rendering.voxelQuality` (GENVIEW-FIDELITY-2). Does not read actors or
 * mappers.
 */
export function fidelityLinesFromBindings(
  viewport: VolumeViewportLike,
  sources: BindingFidelitySource[]
): FidelityLine[] {
  const displaySpacing = displaySpacingOfViewport(viewport);
  const lines: FidelityLine[] = [];

  for (const source of sources) {
    if (source.skip || !source.record) {
      continue;
    }

    const { record } = source;
    const fullGrid = source.fullGrid ?? record.grid;
    const reductionFactors = reductionFactorsOf(record.grid, fullGrid);
    const fullResolution = !isReduced(reductionFactors);
    // Only apply magnification when display spacing is known; otherwise keep
    // the reduction-factor path (FIDELITY-NOTIFY-7).
    const verdict = displaySpacing
      ? compareVoxelQuality(record, { displaySpacing })
      : undefined;

    lines.push({
      label: source.label ?? 'Image',
      record,
      verdict,
      reductionFactors,
      fullResolution,
      sampleDistanceLod: source.sampleDistanceLod ?? 1,
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
  const displaySpacing = displaySpacingOfViewport(viewport);
  const lines: FidelityLine[] = [];
  const seen = new Set<string>();

  for (const entry of viewport.getActors()) {
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
      cached = {
        grid,
        record: volume.getGridQuality(grid, volume.reductionStatistic) as
          | VoxelQualityRecord
          | undefined,
      };
      records.set(id, cached);
    }

    const reductionFactors = reductionFactorsOf(grid, fullGrid);
    const record = cached.record;
    const verdict =
      record && displaySpacing
        ? compareVoxelQuality(record, { displaySpacing })
        : undefined;

    lines.push({
      label: 'Image',
      record: record ?? undefined,
      verdict,
      reductionFactors,
      // Spacing only — dims/origin differences must not sticky-flag lossy.
      fullResolution: !isReduced(reductionFactors),
      sampleDistanceLod: sampleDistanceLodOf(mapper),
    });
  }

  return lines;
}

/**
 * One fidelity line for the image a stack viewport shows now
 * (FIDELITY-SCOPE-2).
 */
export function fidelityLineFromStackImage(
  image: IImage | undefined
): FidelityLine[] {
  if (!image) {
    return [];
  }

  const imageQualityStatus =
    image.imageQualityStatus ?? ImageQualityStatus.FULL_RESOLUTION;

  return [
    {
      label: 'Image',
      imageQualityStatus,
      reductionFactors: [1, 1, 1] as Point3,
      fullResolution: imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION,
      sampleDistanceLod: 1,
    },
  ];
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
