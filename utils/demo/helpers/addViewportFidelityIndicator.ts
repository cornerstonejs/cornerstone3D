import {
  Enums,
  cache,
  eventTarget,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { Events, ImageQualityStatus, ViewportType, VoxelStatistics } = Enums;
const { compareVoxelQuality } = utilities.voxelGrid;

interface configViewportFidelityIndicator {
  renderingEngineId: string;
  viewportId: string;
}

/** One volume that the viewport draws, and what that viewport gets from it. */
type FidelityLine = {
  label: string;
  verdict?: Types.VoxelQualityVerdict;
};

const COLORS = {
  lossless: '#2e9d4a',
  loading: '#c98a00',
  reduced: '#2f6fc0',
  lossy: '#c0392b',
  none: '#666',
};

/**
 * Adds a fidelity badge to one viewport: what the viewport really shows of its
 * data, compared with what the full resolution would show.
 *
 * The badge reads the grid of the texture that the viewport draws, so a
 * reduced texture reports on itself and not on the full volume. The record of
 * that grid (`getGridQuality`) is a fact about the data, and the verdict
 * (`compareVoxelQuality`) belongs to this viewport, because it takes the size
 * of one display pixel: zooming in can turn a lossless view into a reduced
 * one, and two viewports over one volume can disagree at the same moment.
 *
 * - green LOSSLESS: everything the full resolution would show
 * - amber "n% loaded": data has not arrived yet
 * - blue "REDUCED n×": one voxel covers n display pixels
 * - red LOSSY: the reduction aliases, which no zoom undoes
 *
 * Hovering the badge shows the record and the causes of the verdict.
 *
 * @returns a function that removes the badge and its listeners
 */
export default function addViewportFidelityIndicator({
  renderingEngineId,
  viewportId,
}: configViewportFidelityIndicator): () => void {
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
    element.removeEventListener(Events.CAMERA_MODIFIED, schedule);
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

  // A render follows a new actor, a camera change and a progressive stage.
  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  element.addEventListener(Events.CAMERA_MODIFIED, schedule);
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
      entry.actor as { getMapper?: () => unknown }
    ).getMapper?.() as
      | { getScalarTexture?: () => { getGrid?: () => Types.VoxelGrid } }
      | undefined;
    const grid =
      mapper?.getScalarTexture?.()?.getGrid?.() ?? volume.voxelGrid;
    const record = volume.getGridQuality(grid, volume.reductionStatistic);

    lines.push({
      label: 'Image',
      verdict: record
        ? compareVoxelQuality(record, {
            displaySpacing: displaySpacingOf(viewport, grid),
          })
        : undefined,
    });
  }

  return lines;
}

/**
 * The world size of one display pixel on each axis of the grid, or nothing
 * when the view does not state one.
 *
 * A planar view shows the two grid axes in its plane. The axis along the view
 * normal is not displayed, so it gets 0, which the comparison skips. A 3D view
 * is a perspective projection with no single pixel size, so the comparison
 * then judges missing data and aliasing only.
 */
function displaySpacingOf(
  viewport: Types.IVolumeViewport,
  grid: Types.VoxelGrid
): Types.Point3 | undefined {
  if (viewport.type === ViewportType.VOLUME_3D) {
    return undefined;
  }

  const { parallelScale, viewPlaneNormal } = viewport.getCamera();
  const height = viewport.canvas?.clientHeight;

  if (!(parallelScale > 0) || !(height > 0) || !viewPlaneNormal) {
    return undefined;
  }

  const worldPerPixel = (2 * parallelScale) / height;
  const spacing = [0, 0, 0] as Types.Point3;

  for (let axis = 0; axis < 3; axis++) {
    const along = Math.abs(
      grid.direction[axis * 3] * viewPlaneNormal[0] +
        grid.direction[axis * 3 + 1] * viewPlaneNormal[1] +
        grid.direction[axis * 3 + 2] * viewPlaneNormal[2]
    );

    spacing[axis] = along > 0.5 ? 0 : worldPerPixel;
  }

  return spacing;
}

/** The short state of one verdict, for the badge. */
function summaryOf(verdict: Types.VoxelQualityVerdict | undefined): {
  text: string;
  color: string;
} {
  if (!verdict) {
    return { text: 'NO DATA', color: COLORS.none };
  }

  const { causes, magnitude, record } = verdict;

  if (causes.includes('aliasing')) {
    return { text: 'LOSSY', color: COLORS.lossy };
  }

  if (causes.includes('missingData')) {
    const loaded =
      record.voxels > 0
        ? Math.min(99, Math.floor((100 * (record.voxels - record.missing)) / record.voxels))
        : 0;

    return {
      text: `${record.exact ? '' : '~'}${loaded}% loaded`,
      color: COLORS.loading,
    };
  }

  if (causes.includes('resolution')) {
    return { text: `REDUCED ${formatFactor(magnitude)}×`, color: COLORS.reduced };
  }

  if (causes.includes('quality')) {
    return {
      text: ImageQualityStatus[record.status] ?? 'LOW QUALITY',
      color: COLORS.loading,
    };
  }

  return { text: 'LOSSLESS', color: COLORS.lossless };
}

/** The record and the verdict of one line, for the hover panel. */
function detailsOf({ label, verdict }: FidelityLine): string {
  if (!verdict) {
    return `${label}: no quality record`;
  }

  const { record, causes, magnitude } = verdict;
  const { grid } = record;
  const status = ImageQualityStatus[record.status] ?? String(record.status);
  const range =
    record.lowest === record.highest
      ? ''
      : ` [${ImageQualityStatus[record.lowest]}..${ImageQualityStatus[record.highest]}]`;
  const missingPercent =
    record.voxels > 0 ? Math.round((100 * record.missing) / record.voxels) : 0;

  return [
    `${label}`,
    `  status    ${status}${range}`,
    `  grid      ${grid.dimensions.join('×')} @ ${grid.spacing
      .map((value) => formatFactor(value))
      .join('×')} mm`,
    `  missing   ${record.exact ? '' : '~'}${missingPercent}% of ${record.voxels} voxels`,
    `  source    ${record.source} · ${record.reduction} · ${record.deliveries} deliveries`,
    `  verdict   ${causes.length ? causes.join(', ') : 'lossless'}${
      magnitude > 0 ? ` · voxel/pixel ${formatFactor(magnitude)}` : ''
    }`,
  ].join('\n');
}

function formatFactor(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  const shown = lines.length ? lines : [{ label: 'Image' }];

  pills.replaceChildren(
    ...shown.map((line) => {
      const { text, color } = summaryOf(line.verdict);
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
