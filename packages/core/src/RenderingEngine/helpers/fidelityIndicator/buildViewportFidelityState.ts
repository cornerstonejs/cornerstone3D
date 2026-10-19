import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import VoxelDataSources from '../../../enums/VoxelDataSources';
import type {
  Point3,
  ViewportFidelityCause,
  ViewportFidelityState,
} from '../../../types';
import { isAliasingReduction } from '../../../utilities/voxelGrid';
import {
  type FidelityLine,
  isInteractiveLod,
  isReduced,
} from './fidelityIndicatorState';

/**
 * Builds the absolute {@link ViewportFidelityState} (VFS-API-3) from fidelity
 * lines and optional display spacing. Does not compute a reader verdict
 * (VFS-API-6 / VFS-API-7).
 */
export function buildViewportFidelityState(
  lines: FidelityLine[],
  displaySpacing?: Point3
): ViewportFidelityState {
  const line = primaryLineOf(lines);

  if (!line) {
    return emptyState(displaySpacing);
  }

  const { record, reductionFactors, sampleDistanceLod, imageQualityStatus } =
    line;
  const spatiallyReduced = isReduced(reductionFactors);
  const loading =
    (record && record.missing > 0) ||
    (imageQualityStatus !== undefined &&
      imageQualityStatus < ImageQualityStatus.SUBRESOLUTION);
  const lod = isInteractiveLod(sampleDistanceLod);

  const state: ViewportFidelityState = {
    dataResolution: record
      ? {
          spacing: [...record.grid.spacing] as Point3,
          dimensions: [...record.grid.dimensions] as Point3,
        }
      : undefined,
    displayResolution: displaySpacing
      ? { spacing: [...displaySpacing] as Point3 }
      : undefined,
    reductionKind: record?.reduction,
    reductionSource: record?.source,
    magnitude: [...reductionFactors] as Point3,
    cause: causeOf({
      record,
      imageQualityStatus,
      spatiallyReduced,
      loading,
      lod,
    }),
    transient: loading || lod,
    progressive: progressiveOf(line),
    substitutedDefaults: undefined,
    renderPathId: undefined,
  };

  return state;
}

function emptyState(displaySpacing?: Point3): ViewportFidelityState {
  return {
    dataResolution: undefined,
    displayResolution: displaySpacing
      ? { spacing: [...displaySpacing] as Point3 }
      : undefined,
    reductionKind: undefined,
    reductionSource: undefined,
    magnitude: undefined,
    cause: undefined,
    transient: undefined,
    progressive: undefined,
    substitutedDefaults: undefined,
    renderPathId: undefined,
  };
}

/** Prefer a line with a volume record; else the first line. */
function primaryLineOf(lines: FidelityLine[]): FidelityLine | undefined {
  if (!lines.length) {
    return undefined;
  }

  return lines.find((line) => line.record) ?? lines[0];
}

function progressiveOf(
  line: FidelityLine
): ViewportFidelityState['progressive'] {
  const { record, imageQualityStatus } = line;

  if (record) {
    const loadedFraction =
      record.voxels > 0
        ? (record.voxels - record.missing) / record.voxels
        : undefined;

    return {
      status: record.status,
      missing: record.missing,
      voxels: record.voxels,
      loadedFraction,
    };
  }

  if (imageQualityStatus !== undefined) {
    return {
      status: imageQualityStatus,
    };
  }

  return undefined;
}

function causeOf(args: {
  record: FidelityLine['record'];
  imageQualityStatus?: ImageQualityStatus;
  spatiallyReduced: boolean;
  loading: boolean;
  lod: boolean;
}): ViewportFidelityCause | undefined {
  const { record, imageQualityStatus, spatiallyReduced, loading, lod } = args;

  if (loading) {
    return 'incompleteLoad';
  }

  if (lod) {
    return 'performanceTarget';
  }

  if (
    record &&
    spatiallyReduced &&
    record.source === VoxelDataSources.ClientDerived
  ) {
    return 'deviceTextureLimit';
  }

  if (
    (record && isAliasingReduction(record.reduction)) ||
    imageQualityStatus === ImageQualityStatus.LOSSY ||
    (imageQualityStatus !== undefined &&
      imageQualityStatus < ImageQualityStatus.FULL_RESOLUTION &&
      imageQualityStatus >= ImageQualityStatus.SUBRESOLUTION)
  ) {
    return 'lossyDecode';
  }

  if (spatiallyReduced) {
    return 'deviceTextureLimit';
  }

  return undefined;
}

/**
 * Stable key for change detection on absolute fidelity fields
 * (FIDELITY-EVENT-4 / VF-INFO-5a).
 */
export function viewportFidelityStateKey(state: ViewportFidelityState): string {
  return JSON.stringify({
    dataResolution: state.dataResolution,
    displayResolution: state.displayResolution,
    reductionKind: state.reductionKind,
    reductionSource: state.reductionSource,
    magnitude: state.magnitude,
    cause: state.cause,
    transient: state.transient,
    progressive: state.progressive,
    substitutedDefaults: state.substitutedDefaults,
    renderPathId: state.renderPathId,
  });
}
