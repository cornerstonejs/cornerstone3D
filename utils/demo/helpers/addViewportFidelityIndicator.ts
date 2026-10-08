import {
  Enums,
  cache,
  eventTarget,
  getConfiguration,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events, ImageQualityStatus, VoxelStatistics } = Enums;
const { isAliasingReduction, voxelGridsEqual } = utilities.voxelGrid;

interface configViewportFidelityIndicator {
  renderingEngineId: string;
  viewportId: string;
}

/**
 * One volume that the viewport draws: the quality record of the texture grid,
 * how that grid compares with the full volume, and whether ray sample distance
 * is raised (e.g. TrackballRotateTool during drag).
 */
type FidelityLine = {
  label: string;
  record?: Types.VoxelQualityRecord;
  /**
   * Per-axis ratio of drawn spacing / full-volume spacing (e.g. `[2, 2, 10]`).
   * Each value is 1 when that axis matches the full volume.
   */
  reductionFactors: Types.Point3;
  /** True when the drawn grid matches the full volume grid. */
  fullResolution: boolean;
  /**
   * Current mapper sample distance / idle baseline. 1 when idle; ~2 during
   * TrackballRotateTool drag (rotateSampleDistanceFactor).
   */
  sampleDistanceLod: number;
};

const COLORS = {
  full: '#2e9d4a',
  loading: '#c98a00',
  reduced: '#2f6fc0',
  decimated: '#c0392b',
  none: '#666',
};

/** Matches `MAXIMUM_SAMPLES_PER_RAY` in createVolumeMapper (baseline distance). */
const MAXIMUM_SAMPLES_PER_RAY = 4000;

/**
 * Adds a fidelity badge to one viewport: what data the viewport draws, relative
 * to the full volume — not whether a texture reduction is visible at the current
 * zoom — plus interactive ray LOD when sample distance is raised.
 *
 * The badge reads the grid of the texture that the viewport draws, so a
 * reduced texture reports on itself and not on the full volume. The record of
 * that grid (`getGridQuality`) is a fact about the data. Camera zoom never
 * changes the badge. Raising the volume mapper sample distance (Trackball
 * rotate) does, via IMAGE_RENDERED.
 *
 * When `init({ dangerouslyDisableLossyIndicator: true })` is set, this
 * function is a no-op (no badge, no listeners). That hides reduced/decimated/LOD
 * feedback on purpose.
 *
 * - green FULL: drawn grid matches the full volume, data complete, idle sample distance
 * - amber "n% loaded": data has not arrived yet
 * - blue "REDUCED a×b×c": non-aliasing per-axis factors vs full volume
 * - blue "LOD n×": sample distance above idle (interaction)
 * - blue "REDUCED a×b×c · LOD n×": both at once
 * - red DECIMATED: the reduction aliases (e.g. Decimation)
 *
 * Hovering the badge shows the record, grid reduction, and sample-distance LOD.
 *
 * @returns a function that removes the badge and its listeners
 */
export default function addViewportFidelityIndicator({
  renderingEngineId,
  viewportId,
}: configViewportFidelityIndicator): () => void {
  if (getConfiguration().dangerouslyDisableLossyIndicator) {
    return () => {};
  }

  const viewport = getRenderingEngine(renderingEngineId)?.getViewport(
    viewportId
  ) as Types.IVolumeViewport | undefined;

  if (!viewport) {
    throw new Error(`addViewportFidelityIndicator: no viewport ${viewportId}`);
  }

  const { element } = viewport;
  const badge = createBadge(element);
  let scheduled = false;

  const update = () => {
    scheduled = false;
    renderBadge(badge, readLines(viewport));
  };

  // A load fires one event per frame, so the badge updates at most once per
  // animation frame.
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  };

  const onVolumeModified = (evt: Event) => {
    const { volumeId } = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (volumeId && volumeIdsOf(viewport).has(volumeId)) {
      schedule();
    }
  };

  const cleanUp = () => {
    element.removeEventListener(Events.IMAGE_RENDERED, schedule);
    eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
    eventTarget.removeEventListener(Events.ELEMENT_DISABLED, onDisabled);
    badge.root.remove();
  };

  const onDisabled = (evt: Event) => {
    const detail = (evt as CustomEvent<{ viewportId?: string }>).detail;

    if (detail?.viewportId === viewportId) {
      cleanUp();
    }
  };

  // A render follows a new actor and a progressive stage. Zoom does not change
  // the badge, so CAMERA_MODIFIED is not listened to.
  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
  eventTarget.addEventListener(Events.ELEMENT_DISABLED, onDisabled);
  schedule();

  return cleanUp;
}

/** The ids of the cached volumes that the actors of the viewport draw. */
function volumeIdsOf(viewport: Types.IVolumeViewport): Set<string> {
  const ids = new Set<string>();

  for (const entry of viewport.getActors()) {
    const id = entry.referencedId ?? entry.uid;

    if (id && cache.getVolume(id)) {
      ids.add(id);
    }
  }

  return ids;
}

/** One line for each volume that the viewport draws. */
function readLines(viewport: Types.IVolumeViewport): FidelityLine[] {
  const lines: FidelityLine[] = [];
  const seen = new Set<string>();

  for (const entry of viewport.getActors()) {
    const id = entry.referencedId ?? entry.uid;
    const volume = id ? cache.getVolume(id) : undefined;

    // The badge states the fidelity of the image data, so a labelmap volume
    // drawn over it is left out.
    if (
      !volume ||
      seen.has(id) ||
      volume.reductionStatistic === VoxelStatistics.ForegroundMajority
    ) {
      continue;
    }

    seen.add(id);

    // The grid of the texture that this actor draws. A texture with no grid
    // holds the grid of its volume, which is the full resolution.
    const mapper = (
      entry.actor as { getMapper?: () => VolumeMapperLike }
    ).getMapper?.() as VolumeMapperLike | undefined;
    const texture = mapper?.getScalarTexture?.();
    const grid = texture?.getGrid?.() ?? volume.voxelGrid;
    const fullGrid = volume.voxelGrid;
    const record = volume.getGridQuality(grid, volume.reductionStatistic);
    const fullResolution = voxelGridsEqual(grid, fullGrid);

    lines.push({
      label: 'Image',
      record: record ?? undefined,
      reductionFactors: reductionFactorsOf(grid, fullGrid),
      fullResolution,
      sampleDistanceLod: sampleDistanceLodOf(mapper),
    });
  }

  return lines;
}

type VolumeMapperLike = {
  getScalarTexture?: () => { getGrid?: () => Types.VoxelGrid };
  getSampleDistance?: () => number;
  getInputData?: () => {
    getSpacing: () => number[];
    getBounds: () => number[];
  };
};

/**
 * Idle sample distance for a volume mapper, matching `sampleDistanceOf` in
 * createVolumeMapper (multiplier 1). Used to detect Trackball's temporary raise.
 */
function baselineSampleDistanceOf(mapper: VolumeMapperLike): number | undefined {
  const imageData = mapper.getInputData?.();

  if (!imageData) {
    return undefined;
  }

  const texture = mapper.getScalarTexture?.();
  const spacing = texture?.getGrid?.()?.spacing ?? imageData.getSpacing();
  const distance = (spacing[0] + spacing[1] + spacing[2]) / 6;
  const bounds = imageData.getBounds();
  const dx = bounds[1] - bounds[0];
  const dy = bounds[3] - bounds[2];
  const dz = bounds[5] - bounds[4];
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return Math.max(distance, diagonal / (MAXIMUM_SAMPLES_PER_RAY - 1));
}

/**
 * How much coarser the ray sample distance is than idle. 1 when idle or when
 * the mapper has no sample distance (MPR).
 */
function sampleDistanceLodOf(mapper: VolumeMapperLike | undefined): number {
  if (!mapper?.getSampleDistance) {
    return 1;
  }

  const current = mapper.getSampleDistance();
  const baseline = baselineSampleDistanceOf(mapper);

  if (!(current > 0) || !(baseline > 0)) {
    return 1;
  }

  return current / baseline;
}

/**
 * How much coarser the drawn grid is than the full volume, on each axis.
 * A value of 1 means that axis matches the full volume spacing.
 */
function reductionFactorsOf(
  drawn: Types.VoxelGrid,
  full: Types.VoxelGrid
): Types.Point3 {
  const factors = [1, 1, 1] as Types.Point3;

  for (let axis = 0; axis < 3; axis++) {
    const fullSpacing = full.spacing[axis];

    if (!(fullSpacing > 0)) {
      continue;
    }

    factors[axis] = drawn.spacing[axis] / fullSpacing;
  }

  return factors;
}

function isReduced(factors: Types.Point3): boolean {
  return factors.some((factor) => factor > 1 + 1e-6);
}

/** Formats per-axis factors as `2×2×10`. */
function formatFactors(factors: Types.Point3): string {
  return factors.map(formatFactor).join('×');
}

function isInteractiveLod(sampleDistanceLod: number): boolean {
  return sampleDistanceLod > 1 + 1e-2;
}

/** The short state of one line, for the badge. */
function summaryOf(line: FidelityLine): {
  text: string;
  color: string;
} {
  const { record, reductionFactors, fullResolution, sampleDistanceLod } = line;

  if (!record) {
    return { text: 'NO DATA', color: COLORS.none };
  }

  if (record.missing > 0) {
    const loaded =
      record.voxels > 0
        ? Math.min(
            99,
            Math.floor((100 * (record.voxels - record.missing)) / record.voxels)
          )
        : 0;

    return {
      text: `${record.exact ? '' : '~'}${loaded}% loaded`,
      color: COLORS.loading,
    };
  }

  if (isAliasingReduction(record.reduction)) {
    return { text: 'DECIMATED', color: COLORS.decimated };
  }

  const parts: string[] = [];

  if (!fullResolution || isReduced(reductionFactors)) {
    parts.push(`REDUCED ${formatFactors(reductionFactors)}`);
  }

  if (isInteractiveLod(sampleDistanceLod)) {
    parts.push(`LOD ${formatFactor(sampleDistanceLod)}×`);
  }

  if (parts.length) {
    return { text: parts.join(' · '), color: COLORS.reduced };
  }

  return { text: 'FULL', color: COLORS.full };
}

/** The record and the reduction of one line, for the hover panel. */
function detailsOf(line: FidelityLine): string {
  const { label, record, reductionFactors, fullResolution, sampleDistanceLod } =
    line;

  if (!record) {
    return `${label}: no quality record`;
  }

  const { grid } = record;
  const status = ImageQualityStatus[record.status] ?? String(record.status);
  const range =
    record.lowest === record.highest
      ? ''
      : ` [${ImageQualityStatus[record.lowest]}..${ImageQualityStatus[record.highest]}]`;
  const missingPercent =
    record.voxels > 0 ? Math.round((100 * record.missing) / record.voxels) : 0;
  const dataState = isAliasingReduction(record.reduction)
    ? 'decimated'
    : !fullResolution || isReduced(reductionFactors)
      ? `reduced ${formatFactors(reductionFactors)} vs full volume`
      : 'full resolution';
  const lodState = isInteractiveLod(sampleDistanceLod)
    ? `sample distance ×${formatFactor(sampleDistanceLod)} (interactive)`
    : 'sample distance idle';

  return [
    `${label}`,
    `  status    ${status}${range}`,
    `  grid      ${grid.dimensions.join('×')} @ ${grid.spacing
      .map((value) => formatFactor(value))
      .join('×')} mm`,
    `  missing   ${record.exact ? '' : '~'}${missingPercent}% of ${record.voxels} voxels`,
    `  source    ${record.source} · ${record.reduction} · ${record.deliveries} deliveries`,
    `  data      ${dataState}`,
    `  lod       ${lodState}`,
  ].join('\n');
}

function formatFactor(value: number): string {
  const rounded = Math.round(value);

  if (Math.abs(value - rounded) < 1e-6) {
    return String(rounded);
  }

  return value.toFixed(1);
}

type Badge = {
  root: HTMLDivElement;
  pills: HTMLDivElement;
  details: HTMLPreElement;
};

/** The badge in the top right corner of the viewport, with its hover panel. */
function createBadge(element: HTMLDivElement): Badge {
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }

  const root = document.createElement('div');

  Object.assign(root.style, {
    position: 'absolute',
    top: '4px',
    right: '4px',
    zIndex: '10',
    font: '11px/1.3 monospace',
    color: '#fff',
    textAlign: 'right',
    userSelect: 'none',
  });

  const pills = document.createElement('div');
  const details = document.createElement('pre');

  Object.assign(details.style, {
    display: 'none',
    margin: '4px 0 0',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.85)',
    borderRadius: '4px',
    textAlign: 'left',
    whiteSpace: 'pre',
  });

  root.append(pills, details);

  // The badge sits on the viewport, so a press on it must not start a tool.
  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  root.addEventListener('mouseenter', () => {
    details.style.display = 'block';
  });
  root.addEventListener('mouseleave', () => {
    details.style.display = 'none';
  });

  element.appendChild(root);

  return { root, pills, details };
}

function renderBadge({ pills, details }: Badge, lines: FidelityLine[]): void {
  const shown = lines.length
    ? lines
    : [
        {
          label: 'Image',
          reductionFactors: [1, 1, 1] as Types.Point3,
          fullResolution: true,
          sampleDistanceLod: 1,
        },
      ];

  pills.replaceChildren(
    ...shown.map((line) => {
      const { text, color } = summaryOf(line);
      const pill = document.createElement('div');

      Object.assign(pill.style, {
        display: 'inline-block',
        marginLeft: '4px',
        padding: '1px 6px',
        borderRadius: '8px',
        background: color,
      });
      pill.textContent = shown.length > 1 ? `${line.label} ${text}` : text;

      return pill;
    })
  );
  details.textContent = lines.length
    ? lines.map(detailsOf).join('\n\n')
    : 'No volume in this viewport yet';
}
