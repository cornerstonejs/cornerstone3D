import cache from '../../../cache/cache';
import { Events, ImageQualityStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getConfiguration } from '../../../init';
import type {
  ActorEntry,
  IViewport,
  Point3,
  VoxelGrid,
  VoxelQualityRecord,
} from '../../../types';
import { voxelGridsEqual } from '../../../utilities/voxelGrid';
import { sampleDistanceOf } from '../createVolumeMapper';
import { ensureFidelityIndicatorStyles } from './fidelityIndicatorStyles';
import {
  type FidelityDataKind,
  type FidelityLine,
  type SvgFidelityState,
  dataKindOf,
  formatFactor,
  formatFactors,
  isInteractiveLod,
  isReduced,
  reductionFactorsOf,
  svgStateOf,
} from './fidelityIndicatorState';

const COLORS = {
  full: '#2e9d4a',
  loading: '#c98a00',
  reduced: '#2f6fc0',
  decimated: '#c0392b',
  none: '#666',
};

/** How long Done stays visible before it fades (SVG mode). */
const DONE_HOLD_MS = 1000;

const SVG_GLYPH =
  '<g class="fi-glyph">' +
  '<circle class="fi-disc" cx="7.5" cy="7.5" r="7.5"/>' +
  '<g class="fi-dot-wrap"><circle class="fi-dot" cx="7.5" cy="7.5" r="4.5"/></g>' +
  '<path class="fi-check" d="M4.7 7.8 L6.7 9.7 L10.3 5.7"/>' +
  '<path class="fi-dash" d="M5 7.5 H10"/>' +
  '</g>';

const ARIA_LABELS: Record<SvgFidelityState, string> = {
  loading: 'Image fidelity: loading',
  done: 'Image fidelity: full resolution',
  lossy: 'Image fidelity: reduced or decimated',
  lod: 'Image fidelity: interactive LOD',
};

type VolumeViewportLike = IViewport & {
  getActors: () => ActorEntry[];
};

type VolumeMapperLike = {
  getScalarTexture?: () => { getGrid?: () => VoxelGrid };
  getSampleDistance?: () => number;
  getInputData?: () => {
    getSpacing: () => number[];
    getBounds: () => number[];
  };
};

/** One view of the fidelity lines: the product icon, or the debug badge. */
type FidelityView = {
  update: (lines: FidelityLine[]) => void;
  remove: () => void;
};

/** The quality record of one volume, for the grid that it was read for. */
type CachedRecord = {
  grid: VoxelGrid;
  record: VoxelQualityRecord | undefined;
};

const cleanups = new WeakMap<object, () => void>();

/**
 * Attaches the fidelity indicator to a volume viewport.
 *
 * Default UI is the fidelity indicator in the top-right (`loading` / `done` /
 * `lossy` / `lod`). When `init({ debug: { fidelityIndicatorDebug: true } })`
 * is set, the verbose debug badge is also shown in the top-left.
 *
 * Replaces any existing attachment for this viewport (including the engine
 * default). When `init({ dangerouslyDisableFidelityIndicator: true })` is set,
 * this detaches any existing indicator and is otherwise a no-op.
 *
 * @returns a function that removes the indicator and its listeners
 */
export function attachFidelityIndicator(viewport: IViewport): () => void {
  detachFidelityIndicator(viewport);

  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return () => {};
  }

  if (!hasGetActors(viewport)) {
    return () => {};
  }

  const verbose = getConfiguration().debug?.fidelityIndicatorDebug === true;

  ensureFidelityIndicatorStyles();

  const { host, restore: restoreHost } = overlayHostOf(viewport.element);
  const views = [createSvgIndicator(host)];

  if (verbose) {
    views.push(createTextBadge(host));
  }

  const cleanup = subscribeToFidelity(viewport, views, restoreHost);
  const registered = () => {
    if (cleanups.get(viewport) === registered) {
      cleanups.delete(viewport);
    }
    cleanup();
  };

  cleanups.set(viewport, registered);
  return registered;
}

/**
 * Attaches the fidelity indicator when the viewport is a volume type and the
 * product indicator is not disabled. Uses {@link attachFidelityIndicator}, which
 * stores cleanup for {@link detachFidelityIndicator}.
 */
export function maybeAttachFidelityIndicator(viewport: IViewport): void {
  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return;
  }

  if (!isVolumeFidelityViewport(viewport) || !hasGetActors(viewport)) {
    return;
  }

  attachFidelityIndicator(viewport);
}

/** Removes a previously attached fidelity indicator, if any. */
export function detachFidelityIndicator(viewport: IViewport): void {
  const cleanup = cleanups.get(viewport);

  if (!cleanup) {
    return;
  }

  cleanups.delete(viewport);
  cleanup();
}

/**
 * Whether this viewport should get the product fidelity indicator.
 * Stack (and stack remapped to PLANAR_NEXT) is excluded; orthographic and
 * volume-3D (legacy and Next) are included.
 */
export function isVolumeFidelityViewport(viewport: IViewport): boolean {
  const requested = viewport.requestedType ?? viewport.type;

  return (
    requested === ViewportType.ORTHOGRAPHIC ||
    requested === ViewportType.VOLUME_3D ||
    requested === ViewportType.VOLUME_3D_NEXT ||
    viewport.type === ViewportType.VOLUME_3D ||
    viewport.type === ViewportType.VOLUME_3D_NEXT
  );
}

/**
 * Whether an actor is a labelmap overlay (FIDELITY-SCOPE-3). Tools set
 * `representationUID` to `${segmentationId}-Labelmap-...`.
 */
export function isLabelmapActorEntry(entry: ActorEntry): boolean {
  const id = entry.representationUID ?? entry.uid;
  return typeof id === 'string' && /(?:^|-)Labelmap(?:-|$)/.test(id);
}

function hasGetActors(viewport: IViewport): viewport is VolumeViewportLike {
  return typeof (viewport as VolumeViewportLike).getActors === 'function';
}

/**
 * Reads the fidelity lines at most once per animation frame, and passes them to
 * every view.
 *
 * The quality record of a volume is cached, because `getGridQuality` walks the
 * deliveries of the volume. A render that only moves the camera or changes the
 * sample distance reuses the record. The cache entry of a volume goes when the
 * data of that volume changes, or when the viewport binds a different grid.
 */
function subscribeToFidelity(
  viewport: VolumeViewportLike,
  views: FidelityView[],
  restoreHost: () => void
): () => void {
  const { element } = viewport;
  const records = new Map<string, CachedRecord>();
  let rafId = 0;
  let disposed = false;

  const update = () => {
    rafId = 0;
    if (disposed) {
      return;
    }
    const lines = readLines(viewport, records);
    for (const view of views) {
      view.update(lines);
    }
  };

  const schedule = () => {
    if (!rafId && !disposed) {
      rafId = requestAnimationFrame(update);
    }
  };

  const onVolumeModified = (evt: Event) => {
    const { volumeId } = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (volumeId && records.delete(volumeId)) {
      schedule();
    }
  };

  const cleanUp = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    element.removeEventListener(Events.IMAGE_RENDERED, schedule);
    for (const type of VOLUME_DATA_EVENTS) {
      eventTarget.removeEventListener(type, onVolumeModified);
    }
    for (const view of views) {
      view.remove();
    }
    restoreHost();
  };

  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  for (const type of VOLUME_DATA_EVENTS) {
    eventTarget.addEventListener(type, onVolumeModified);
  }
  schedule();

  return cleanUp;
}

/** The events that change the quality record of a volume. */
const VOLUME_DATA_EVENTS = [
  Events.IMAGE_VOLUME_MODIFIED,
  Events.IMAGE_VOLUME_LOADING_COMPLETED,
];

/**
 * Host for the indicator/tooltip. Prefer the outer viewport element, not
 * `.viewport-element` (that div uses `overflow: hidden` and clips hover panels).
 * When this sets an inline `position`, `restore` clears it on detach.
 */
function overlayHostOf(element: HTMLDivElement): {
  host: HTMLElement;
  restore: () => void;
} {
  let previousInline: string | undefined;

  if (typeof getComputedStyle !== 'undefined') {
    const computed = getComputedStyle(element).position;
    // Browsers report `static`; jsdom may report `''` for the default.
    if (computed === 'static' || computed === '') {
      previousInline = element.style.position;
      element.style.position = 'relative';
    }
  }

  return {
    host: element,
    restore: () => {
      if (previousInline === undefined) {
        return;
      }
      element.style.position = previousInline;
    },
  };
}

function createSvgIndicator(host: HTMLElement): FidelityView {
  const root = document.createElement('div');
  root.className = 'fi-root';
  Object.assign(root.style, {
    position: 'absolute',
    top: '14px',
    right: '14px',
    zIndex: '1000',
    transform: 'translateZ(0)',
  });
  root.dataset.shown = 'false';

  const htmlLayer = document.createElement('div');
  htmlLayer.className = 'fi-html';
  htmlLayer.innerHTML =
    '<div class="fi-html-ring"></div><div class="fi-html-dot"></div>';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'fidelity-indicator');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 15 15');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Image fidelity');

  const details = document.createElement('pre');
  details.className = 'fi-details';

  root.append(htmlLayer, svg, details);
  host.appendChild(root);

  let currentState: SvgFidelityState | 'hidden' = 'hidden';
  let doneFadeTimer = 0;
  let hovered = false;
  let lastLines: FidelityLine[] = [];

  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  // The hover text is built only while it shows.
  root.addEventListener('mouseenter', () => {
    hovered = true;
    root.dataset.hover = 'true';
    details.textContent = fidelityHoverTextOf(lastLines);
  });
  root.addEventListener('mouseleave', () => {
    hovered = false;
    delete root.dataset.hover;
  });

  const scheduleDoneFade = () => {
    clearTimeout(doneFadeTimer);
    doneFadeTimer = window.setTimeout(() => {
      doneFadeTimer = 0;
      if (currentState === 'done') {
        root.dataset.shown = 'false';
      }
    }, DONE_HOLD_MS);
  };

  const ensureSvgGlyph = () => {
    if (!svg.querySelector('.fi-glyph')) {
      svg.innerHTML = SVG_GLYPH;
    }
  };

  const setSvgState = (next: SvgFidelityState | 'hidden') => {
    if (next === 'hidden') {
      if (currentState === 'hidden') {
        return;
      }

      clearTimeout(doneFadeTimer);
      doneFadeTimer = 0;
      currentState = 'hidden';
      delete root.dataset.state;
      delete root.dataset.from;
      root.dataset.shown = 'false';
      svg.innerHTML = '';
      svg.setAttribute('aria-label', 'Image fidelity');
      return;
    }

    // A render in the same state keeps the running fade, so Done still fades
    // while the viewport renders every frame.
    if (next === currentState) {
      return;
    }

    const from = currentState;

    root.dataset.from = from === 'hidden' ? 'hidden' : from;
    root.dataset.state = next;
    root.dataset.shown = 'true';
    svg.setAttribute('aria-label', ARIA_LABELS[next]);

    if (next === 'done' || next === 'lossy') {
      ensureSvgGlyph();
    }

    clearTimeout(doneFadeTimer);
    doneFadeTimer = 0;
    currentState = next;

    if (next === 'done') {
      scheduleDoneFade();
    }
  };

  return {
    update: (lines) => {
      lastLines = lines;
      setSvgState(svgStateOf(lines));
      if (hovered) {
        details.textContent = fidelityHoverTextOf(lines);
      }
    },
    remove: () => {
      clearTimeout(doneFadeTimer);
      root.remove();
    },
  };
}

function readLines(
  viewport: VolumeViewportLike,
  records: Map<string, CachedRecord>
): FidelityLine[] {
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

    lines.push({
      label: 'Image',
      record: cached.record ?? undefined,
      reductionFactors,
      // Spacing only — dims/origin differences must not sticky-flag lossy.
      fullResolution: !isReduced(reductionFactors),
      sampleDistanceLod: sampleDistanceLodOf(mapper),
    });
  }

  return lines;
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

function summaryOf(line: FidelityLine): {
  text: string;
  color: string;
} {
  const { record, reductionFactors, sampleDistanceLod } = line;

  if (!record) {
    return { text: 'NO DATA', color: COLORS.none };
  }

  const dataKind = dataKindOf(line);

  if (dataKind === 'loading') {
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

  if (dataKind === 'decimated') {
    return { text: 'DECIMATED', color: COLORS.decimated };
  }

  const parts: string[] = [];

  if (dataKind === 'reduced') {
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

function fidelityHoverTextOf(lines: FidelityLine[]): string {
  if (!lines.length) {
    return 'No volume in this viewport yet';
  }

  return lines.map(detailsOf).join('\n\n');
}

const DETAIL_STATUS: Record<FidelityDataKind, (line: FidelityLine) => string> =
  {
    loading: () => 'loading',
    decimated: () => 'decimated',
    reduced: (line) => `reduced ${formatFactors(line.reductionFactors)}`,
    full: () => 'full resolution',
  };

function detailsOf(line: FidelityLine): string {
  const { label, record, sampleDistanceLod } = line;

  if (!record) {
    return `${label}: no quality record`;
  }

  const { grid } = record;
  const delivery = ImageQualityStatus[record.status] ?? String(record.status);
  const range =
    record.lowest === record.highest
      ? ''
      : ` [${ImageQualityStatus[record.lowest]}..${ImageQualityStatus[record.highest]}]`;
  const missingPercent =
    record.voxels > 0 ? Math.round((100 * record.missing) / record.voxels) : 0;
  const status = DETAIL_STATUS[dataKindOf(line)](line);
  const lodState = isInteractiveLod(sampleDistanceLod)
    ? `sample distance ×${formatFactor(sampleDistanceLod)} (interactive)`
    : 'sample distance idle';

  return [
    `${label}`,
    `  status    ${status}`,
    `  delivery  ${delivery}${range}`,
    `  grid      ${grid.dimensions.join('×')} @ ${grid.spacing
      .map((value) => formatFactor(value))
      .join('×')} mm`,
    `  missing   ${record.exact ? '' : '~'}${missingPercent}% of ${record.voxels} voxels`,
    `  source    ${record.source} · ${record.reduction} · ${record.deliveries} deliveries`,
    `  lod       ${lodState}`,
  ].join('\n');
}

function createTextBadge(host: HTMLElement): FidelityView {
  const root = document.createElement('div');

  Object.assign(root.style, {
    position: 'absolute',
    top: '4px',
    left: '4px',
    zIndex: '1000',
    font: '11px/1.3 monospace',
    color: '#fff',
    textAlign: 'left',
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

  let hovered = false;
  let lastLines: FidelityLine[] = [];
  let lastPillsKey = '';

  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  root.addEventListener('mouseenter', () => {
    hovered = true;
    details.textContent = fidelityHoverTextOf(lastLines);
    details.style.display = 'block';
  });
  root.addEventListener('mouseleave', () => {
    hovered = false;
    details.style.display = 'none';
  });

  host.appendChild(root);

  return {
    update: (lines) => {
      lastLines = lines;
      renderPills(lines);
      if (hovered) {
        details.textContent = fidelityHoverTextOf(lines);
      }
    },
    remove: () => root.remove(),
  };

  function renderPills(lines: FidelityLine[]): void {
    const shown = lines.length
      ? lines
      : [
          {
            label: 'Image',
            reductionFactors: [1, 1, 1] as Point3,
            fullResolution: true,
            sampleDistanceLod: 1,
          },
        ];
    const summaries = shown.map((line) => ({ line, ...summaryOf(line) }));
    const key = summaries.map(({ text, color }) => text + color).join('|');

    // The pills change only when a summary changes, not on each render.
    if (key === lastPillsKey) {
      return;
    }
    lastPillsKey = key;

    pills.replaceChildren(
      ...summaries.map(({ line, text, color }) => {
        const pill = document.createElement('div');

        Object.assign(pill.style, {
          display: 'inline-block',
          marginRight: '4px',
          padding: '1px 6px',
          borderRadius: '8px',
          background: color,
        });
        pill.textContent = shown.length > 1 ? `${line.label} ${text}` : text;

        return pill;
      })
    );
  }
}
