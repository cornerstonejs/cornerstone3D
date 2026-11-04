import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type {
  Point3,
  ViewportFidelityCause,
  ViewportFidelityState,
} from '../../../types';
import { isAliasingReduction } from '../../../utilities/voxelGrid';
import {
  type FidelityLine,
  fidelityStateRank,
  isInteractiveLod,
  isReduced,
  lineHasData,
  lineKind,
  standingSampleRatioOf,
  svgStateOf,
} from './fidelityIndicatorState';

/**
 * Builds the absolute {@link ViewportFidelityState} (FIDELITY-EVENT-5) from
 * fidelity lines. `shownState` and `lossy` come from every line, with the
 * same decision as the built-in indicator (`svgStateOf`). Every other field
 * describes the worst line, the line that decides `shownState`, so that
 * `cause` agrees with `lossy` for several volumes. The display spacing comes
 * from that line, else from `displaySpacing`.
 */
export function buildViewportFidelityState(
  lines: FidelityLine[],
  displaySpacing?: Point3
): ViewportFidelityState {
  const line = worstLineOf(lines);

  if (!line) {
    return emptyState(displaySpacing);
  }

  const shownState = svgStateOf(lines);

  const { record, reductionFactors, imageQualityStatus } = line;
  const shownSpacing = line.displaySpacing ?? displaySpacing;
  const spatiallyReduced = isReduced(reductionFactors);
  const kind = lineKind(line);
  // A load counts only while reduced data shows in place of data that a later
  // delivery replaces (FIDELITY-STATE-2).
  const loading = kind === 'loading';
  const lod = kind === 'lod';
  // A lossless view has no reduction to explain (FIDELITY-EVENT-8).
  const lossy = isLossyShownState(shownState);

  const state: ViewportFidelityState = {
    dataResolution: record
      ? {
          spacing: [...record.grid.spacing] as Point3,
          dimensions: [...record.grid.dimensions] as Point3,
        }
      : undefined,
    displayResolution: shownSpacing
      ? { spacing: [...shownSpacing] as Point3 }
      : undefined,
    reductionKind: record?.reduction,
    reductionSource: record?.source,
    magnitude: lossy ? ([...reductionFactors] as Point3) : undefined,
    cause: lossy
      ? causeOf({
          record,
          imageQualityStatus,
          reductionCause: line.reductionCause,
          spatiallyReduced,
          standingSample: isInteractiveLod(standingSampleRatioOf(line)),
          loading,
          lod,
        })
      : undefined,
    // The worst line decides: a standing reduction anywhere is not transient.
    transient: lossy ? loading || lod : undefined,
    progressive: progressiveOf(line),
    shownState,
    lossy,
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
    shownState: 'hidden',
    lossy: false,
  };
}

function isLossyShownState(
  shownState: ViewportFidelityState['shownState']
): boolean {
  return (
    shownState === 'loading' || shownState === 'lod' || shownState === 'lossy'
  );
}

/**
 * The line that decides the shown state: the most urgent state among the
 * lines with data (`fidelityStateRank`). A tie keeps a line with a volume
 * record, else the first line.
 */
function worstLineOf(lines: FidelityLine[]): FidelityLine | undefined {
  let worst: FidelityLine | undefined;
  let worstRank = 0;

  for (const line of lines) {
    if (!lineHasData(line)) {
      continue;
    }

    const rank = fidelityStateRank(lineKind(line));

    if (
      rank > worstRank ||
      (rank === worstRank && !worst.record && line.record)
    ) {
      worst = line;
      worstRank = rank;
    }
  }

  return worst;
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
      lowest: record.lowest,
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
  reductionCause?: ViewportFidelityCause;
  spatiallyReduced: boolean;
  standingSample: boolean;
  loading: boolean;
  lod: boolean;
}): ViewportFidelityCause | undefined {
  const {
    record,
    imageQualityStatus,
    reductionCause,
    spatiallyReduced,
    standingSample,
    loading,
    lod,
  } = args;

  if (loading) {
    return 'incompleteLoad';
  }

  if (lod) {
    return 'performanceTarget';
  }

  // A spatial reduction takes the cause that its strategy states, and a
  // decimation is not a lossy decode.
  const spatial =
    spatiallyReduced || (record && isAliasingReduction(record.reduction));

  if (spatial && reductionCause) {
    return reductionCause;
  }

  const delivered = record ? record.lowest : imageQualityStatus;

  if (
    delivered !== undefined &&
    delivered < ImageQualityStatus.FULL_RESOLUTION &&
    delivered >= ImageQualityStatus.SUBRESOLUTION
  ) {
    return 'lossyDecode';
  }

  // A standing sample distance multiplier is a performance choice.
  return standingSample && !spatial ? 'performanceTarget' : undefined;
}

/**
 * Stable key for change detection (FIDELITY-EVENT-4).
 *
 * The key leaves out `displayResolution`, because it changes on each zoom,
 * pan and resize. It holds `shownState` and `lossy`, so a zoom that changes a
 * box-average verdict still changes the key. It holds the load progress only
 * while the view is lossy, so an ordinary load fires no event per frame.
 */
export function viewportFidelityStateKey(state: ViewportFidelityState): string {
  return JSON.stringify({
    shownState: state.shownState,
    lossy: state.lossy,
    dataResolution: state.dataResolution,
    reductionKind: state.reductionKind,
    reductionSource: state.reductionSource,
    magnitude: state.magnitude,
    cause: state.cause,
    transient: state.transient,
    progressive: state.lossy ? state.progressive : undefined,
  });
}
