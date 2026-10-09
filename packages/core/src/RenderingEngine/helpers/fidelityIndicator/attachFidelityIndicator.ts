import cache from '../../../cache/cache';
import {
  Events,
  ImageQualityStatus,
  ViewportType,
  VoxelStatistics,
} from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getConfiguration } from '../../../init';
import type {
  ActorEntry,
  IViewport,
  Point3,
  VoxelGrid,
  VoxelQualityRecord,
} from '../../../types';
import {
  isAliasingReduction,
  voxelGridsEqual,
} from '../../../utilities/voxelGrid';
import { sampleDistanceOf } from '../createVolumeMapper';
import { ensureFidelityIndicatorStyles } from './fidelityIndicatorStyles';
import {
  type FidelityLine,
  type SvgFidelityState,
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

/** Viewport edge band that re-reveals a faded Done indicator. */
const REVEAL_BAND_PX = 50;

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

type TextBadge = {
  root: HTMLDivElement;
  pills: HTMLDivElement;
  details: HTMLPreElement;
};

const cleanups = new WeakMap<object, () => void>();

/**
 * Attaches the fidelity indicator to a volume viewport.
 *
 * Default UI is the fidelity indicator in the top-right (`loading` / `done` /
 * `lossy` / `lod`). When `init({ debug: { fidelityIndicatorDebug: true } })`
 * is set, the verbose debug badge is also shown in the top-left.
 *
 * When `init({ dangerouslyDisableFidelityIndicator: true })` is set, this
 * is a no-op.
 *
 * @returns a function that removes the indicator and its listeners
 */
export function attachFidelityIndicator(viewport: IViewport): () => void {
  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return () => {};
  }

  if (!hasGetActors(viewport)) {
    return () => {};
  }

  const volumeViewport = viewport;
  const { element, id: viewportId } = volumeViewport;
  const verbose = getConfiguration().debug?.fidelityIndicatorDebug === true;

  ensureFidelityIndicatorStyles();

  const removeSvg = attachSvgIndicator(element, volumeViewport, viewportId);

  if (!verbose) {
    return removeSvg;
  }

  const removeText = attachTextBadge(element, volumeViewport, viewportId);

  return () => {
    removeSvg();
    removeText();
  };
}

/**
 * Attaches the fidelity indicator when the viewport is a volume type and the
 * product indicator is not disabled. Stores cleanup in a WeakMap for
 * {@link detachFidelityIndicator}.
 */
export function maybeAttachFidelityIndicator(viewport: IViewport): void {
  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return;
  }

  if (!isVolumeFidelityViewport(viewport) || !hasGetActors(viewport)) {
    return;
  }

  detachFidelityIndicator(viewport);
  cleanups.set(viewport, attachFidelityIndicator(viewport));
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

function hasGetActors(viewport: IViewport): viewport is VolumeViewportLike {
  return typeof (viewport as VolumeViewportLike).getActors === 'function';
}

/**
 * Host for the indicator/tooltip. Prefer the outer viewport element, not
 * `.viewport-element` (that div uses `overflow: hidden` and clips hover panels).
 */
function overlayHostOf(element: HTMLDivElement): HTMLElement {
  if (typeof getComputedStyle !== 'undefined') {
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }
  }

  return element;
}

function attachTextBadge(
  element: HTMLDivElement,
  viewport: VolumeViewportLike,
  viewportId: string
): () => void {
  const badge = createTextBadge(element);
  let rafId = 0;
  let disposed = false;

  const update = () => {
    rafId = 0;
    if (disposed) {
      return;
    }
    renderTextBadge(badge, readLines(viewport));
  };

  const schedule = () => {
    if (!rafId && !disposed) {
      rafId = requestAnimationFrame(update);
    }
  };

  const onVolumeModified = (evt: Event) => {
    const { volumeId } = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (volumeId && volumeIdsOf(viewport).has(volumeId)) {
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
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      onVolumeModified
    );
    eventTarget.removeEventListener(Events.ELEMENT_DISABLED, onDisabled);
    badge.root.remove();
  };

  const onDisabled = (evt: Event) => {
    const detail = (evt as CustomEvent<{ viewportId?: string }>).detail;

    if (detail?.viewportId === viewportId) {
      cleanUp();
    }
  };

  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
  eventTarget.addEventListener(Events.ELEMENT_DISABLED, onDisabled);
  schedule();

  return cleanUp;
}

function attachSvgIndicator(
  element: HTMLDivElement,
  viewport: VolumeViewportLike,
  viewportId: string
): () => void {
  const host = overlayHostOf(element);

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
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 15 15');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Image fidelity');

  const details = document.createElement('pre');
  details.className = 'fi-details';

  root.append(htmlLayer, svg, details);
  host.appendChild(root);

  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  root.addEventListener('mouseenter', () => {
    root.dataset.hover = 'true';
  });
  root.addEventListener('mouseleave', () => {
    delete root.dataset.hover;
  });

  let rafId = 0;
  let disposed = false;
  let currentState: SvgFidelityState | 'hidden' = 'hidden';
  let doneFadeTimer = 0;
  let doneHoldElapsed = false;
  let pointerInRevealBand = false;

  const scheduleDoneFade = () => {
    clearTimeout(doneFadeTimer);
    doneHoldElapsed = false;
    doneFadeTimer = window.setTimeout(() => {
      doneFadeTimer = 0;
      doneHoldElapsed = true;
      if (!pointerInRevealBand && currentState === 'done') {
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
      doneHoldElapsed = false;
      currentState = 'hidden';
      delete root.dataset.state;
      delete root.dataset.from;
      root.dataset.shown = 'false';
      svg.innerHTML = '';
      svg.setAttribute('aria-label', 'Image fidelity');
      return;
    }

    if (next === currentState) {
      if (next === 'done' && !doneHoldElapsed) {
        scheduleDoneFade();
      }
      return;
    }

    const from = currentState;

    if (next === 'done' && from === 'lod') {
      root.dataset.from = 'lod';
      root.dataset.state = 'done';
      root.dataset.shown = 'false';
      ensureSvgGlyph();
      clearTimeout(doneFadeTimer);
      doneFadeTimer = 0;
      doneHoldElapsed = true;
      currentState = 'done';
      svg.setAttribute('aria-label', ARIA_LABELS.done);
      return;
    }

    root.dataset.from = from === 'hidden' ? 'hidden' : from;
    root.dataset.state = next;
    root.dataset.shown = 'true';
    svg.setAttribute('aria-label', ARIA_LABELS[next]);

    if (next === 'done' || next === 'lossy') {
      ensureSvgGlyph();
    }

    clearTimeout(doneFadeTimer);
    doneFadeTimer = 0;
    if (!(next === 'lod' && from === 'done')) {
      doneHoldElapsed = false;
    }
    currentState = next;

    if (next === 'done') {
      scheduleDoneFade();
    }
  };

  const update = () => {
    rafId = 0;
    if (disposed) {
      return;
    }
    const lines = readLines(viewport);
    setSvgState(svgStateOf(lines));
    details.textContent = fidelityHoverTextOf(lines);
  };

  const schedule = () => {
    if (!rafId && !disposed) {
      rafId = requestAnimationFrame(update);
    }
  };

  const onVolumeModified = (evt: Event) => {
    const { volumeId } = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (volumeId && volumeIdsOf(viewport).has(volumeId)) {
      schedule();
    }
  };

  const onPointerMove = (evt: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    const y = evt.clientY - rect.top;
    const inBand = y <= REVEAL_BAND_PX || y >= rect.height - REVEAL_BAND_PX;

    pointerInRevealBand = inBand;

    if (currentState !== 'done') {
      return;
    }

    if (inBand) {
      root.dataset.shown = 'true';
    } else if (doneHoldElapsed) {
      root.dataset.shown = 'false';
    }
  };

  const onPointerLeave = () => {
    pointerInRevealBand = false;
  };

  const cleanUp = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimeout(doneFadeTimer);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    element.removeEventListener(Events.IMAGE_RENDERED, schedule);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerleave', onPointerLeave);
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      onVolumeModified
    );
    eventTarget.removeEventListener(Events.ELEMENT_DISABLED, onDisabled);
    root.remove();
  };

  const onDisabled = (evt: Event) => {
    const detail = (evt as CustomEvent<{ viewportId?: string }>).detail;

    if (detail?.viewportId === viewportId) {
      cleanUp();
    }
  };

  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerleave', onPointerLeave);
  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
  eventTarget.addEventListener(Events.ELEMENT_DISABLED, onDisabled);
  schedule();

  return cleanUp;
}

function volumeIdsOf(viewport: VolumeViewportLike): Set<string> {
  const ids = new Set<string>();

  for (const entry of viewport.getActors()) {
    const id = entry.referencedId ?? entry.uid;

    if (id && cache.getVolume(id)) {
      ids.add(id);
    }
  }

  return ids;
}

function readLines(viewport: VolumeViewportLike): FidelityLine[] {
  const lines: FidelityLine[] = [];
  const seen = new Set<string>();

  for (const entry of viewport.getActors()) {
    const id = entry.referencedId ?? entry.uid;
    const volume = id ? cache.getVolume(id) : undefined;

    if (
      !volume ||
      seen.has(id) ||
      volume.reductionStatistic === VoxelStatistics.ForegroundMajority
    ) {
      continue;
    }

    seen.add(id);

    const mapper = (
      entry.actor as { getMapper?: () => VolumeMapperLike }
    ).getMapper?.() as VolumeMapperLike | undefined;
    const texture = mapper?.getScalarTexture?.();
    const grid = texture?.getGrid?.() ?? volume.voxelGrid;
    const fullGrid = volume.voxelGrid;
    const record = volume.getGridQuality(grid, volume.reductionStatistic) as
      | VoxelQualityRecord
      | undefined;
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

function fidelityHoverTextOf(lines: FidelityLine[]): string {
  if (!lines.length) {
    return 'No volume in this viewport yet';
  }

  return lines.map(detailsOf).join('\n\n');
}

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

function createTextBadge(element: HTMLDivElement): TextBadge {
  const host = overlayHostOf(element);

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

  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  root.addEventListener('mouseenter', () => {
    details.style.display = 'block';
  });
  root.addEventListener('mouseleave', () => {
    details.style.display = 'none';
  });

  host.appendChild(root);

  return { root, pills, details };
}

function renderTextBadge(
  { pills, details }: TextBadge,
  lines: FidelityLine[]
): void {
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

  pills.replaceChildren(
    ...shown.map((line) => {
      const { text, color } = summaryOf(line);
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
  details.textContent = lines.length
    ? lines.map(detailsOf).join('\n\n')
    : 'No volume in this viewport yet';
}
