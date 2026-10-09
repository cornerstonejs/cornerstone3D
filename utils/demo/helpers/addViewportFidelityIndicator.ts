import {
  Enums,
  cache,
  eventTarget,
  getConfiguration,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { ensureFidelityIndicatorStyles } from './fidelityIndicator/fidelityIndicatorStyles';

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

type SvgFidelityState = 'loading' | 'done' | 'lossy' | 'lod';

const COLORS = {
  full: '#2e9d4a',
  loading: '#c98a00',
  reduced: '#2f6fc0',
  decimated: '#c0392b',
  none: '#666',
};

/** Matches `MAXIMUM_SAMPLES_PER_RAY` in createVolumeMapper (baseline distance). */
const MAXIMUM_SAMPLES_PER_RAY = 4000;

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

/**
 * Adds a fidelity indicator to one viewport: what data the viewport draws,
 * relative to the full volume — plus interactive ray LOD when sample distance
 * is raised.
 *
 * Default UI is the fidelity indicator in the top-right (`loading` / `done` /
 * `lossy` / `lod`). Loading and LOD use an HTML disc (compositor-friendly);
 * done and lossy use the SVG glyph. Hovering the icon shows the product
 * fidelity tooltip (`fidelityHoverTextOf`). When `init({ debug: {
 * fidelityIndicatorDebug: true } })` is set, the verbose debug badge is also shown
 * in the top-left (separate dump via `detailsOf`).
 *
 * When `init({ dangerouslyDisableLossyIndicator: true })` is set, this
 * function is a no-op (no badge, no listeners).
 *
 * @returns a function that removes the indicator and its listeners
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
  const verbose = getConfiguration().debug?.fidelityIndicatorDebug === true;

  ensureFidelityIndicatorStyles();

  const removeSvg = attachSvgIndicator(element, viewport, viewportId);

  if (!verbose) {
    return removeSvg;
  }

  const removeText = attachTextBadge(element, viewport, viewportId);

  return () => {
    removeSvg();
    removeText();
  };
}

function attachTextBadge(
  element: HTMLDivElement,
  viewport: Types.IVolumeViewport,
  viewportId: string
): () => void {
  const badge = createTextBadge(element);
  let scheduled = false;

  const update = () => {
    scheduled = false;
    renderTextBadge(badge, readLines(viewport));
  };

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

  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
  eventTarget.addEventListener(Events.ELEMENT_DISABLED, onDisabled);
  schedule();

  return cleanUp;
}

function attachSvgIndicator(
  element: HTMLDivElement,
  viewport: Types.IVolumeViewport,
  viewportId: string
): () => void {
  ensureRelative(element);

  // DOM overlay on the viewport element. Loading / LOD use an HTML disc so the
  // pulse stays on the compositor; done / lossy keep the SVG glyph. Hover shows
  // the product fidelity tooltip (separate from the debug badge dump).
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

  const details = document.createElement('pre');
  details.className = 'fi-details';

  root.append(htmlLayer, svg, details);
  element.appendChild(root);

  for (const type of ['mousedown', 'pointerdown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  root.addEventListener('mouseenter', () => {
    root.dataset.hover = 'true';
  });
  root.addEventListener('mouseleave', () => {
    delete root.dataset.hover;
  });

  let scheduled = false;
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
      return;
    }

    // Same state: leave the DOM alone so loading CSS animations continue.
    // Once Done has faded, do not revive it on every IMAGE_RENDERED.
    if (next === currentState) {
      if (next === 'done' && !doneHoldElapsed) {
        scheduleDoneFade();
      }
      return;
    }

    const from = currentState;

    // Interactive LOD is temporary — leaving it must not re-celebrate Done.
    if (next === 'done' && from === 'lod') {
      root.dataset.from = 'lod';
      root.dataset.state = 'done';
      root.dataset.shown = 'false';
      ensureSvgGlyph();
      clearTimeout(doneFadeTimer);
      doneFadeTimer = 0;
      doneHoldElapsed = true;
      currentState = 'done';
      return;
    }

    root.dataset.from = from === 'hidden' ? 'hidden' : from;
    root.dataset.state = next;
    root.dataset.shown = 'true';

    // done / lossy need the SVG glyph; loading / lod use the HTML disc only.
    if (next === 'done' || next === 'lossy') {
      ensureSvgGlyph();
    }

    clearTimeout(doneFadeTimer);
    doneFadeTimer = 0;
    // Preserve whether Done already faded across a temporary lod excursion.
    if (!(next === 'lod' && from === 'done')) {
      doneHoldElapsed = false;
    }
    currentState = next;

    if (next === 'done') {
      scheduleDoneFade();
    }
  };

  const update = () => {
    scheduled = false;
    const lines = readLines(viewport);
    setSvgState(svgStateOf(lines));
    details.textContent = fidelityHoverTextOf(lines);
  };

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
    clearTimeout(doneFadeTimer);
    element.removeEventListener(Events.IMAGE_RENDERED, schedule);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerleave', onPointerLeave);
    eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, onVolumeModified);
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

/**
 * Worst-case SVG state across lines: loading > lod > lossy > done.
 * No volume / no quality record yet stays hidden (blank), so the page does not
 * flash the loading glyph before the user starts a load.
 */
function svgStateOf(lines: FidelityLine[]): SvgFidelityState | 'hidden' {
  if (!lines.length) {
    return 'hidden';
  }

  let anyLoading = false;
  let anyLod = false;
  let anyLossy = false;
  let anyWithRecord = false;

  for (const line of lines) {
    if (!line.record) {
      continue;
    }

    anyWithRecord = true;
    const kind = lineKind(line);

    if (kind === 'loading') {
      anyLoading = true;
    } else if (kind === 'lod') {
      anyLod = true;
    } else if (kind === 'lossy') {
      anyLossy = true;
    }
  }

  if (!anyWithRecord) {
    return 'hidden';
  }

  if (anyLoading) {
    return 'loading';
  }

  if (anyLod) {
    return 'lod';
  }

  if (anyLossy) {
    return 'lossy';
  }

  return 'done';
}

function lineKind(line: FidelityLine): SvgFidelityState {
  const { record, reductionFactors, fullResolution, sampleDistanceLod } = line;

  if (!record || record.missing > 0) {
    return 'loading';
  }

  if (isInteractiveLod(sampleDistanceLod)) {
    return 'lod';
  }

  if (
    isAliasingReduction(record.reduction) ||
    !fullResolution ||
    isReduced(reductionFactors)
  ) {
    return 'lossy';
  }

  return 'done';
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

/** The short state of one line, for the text badge. */
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

/**
 * Product copy for the icon tooltip. Temporary: same shape as the debug dump;
 * change this function later without touching `detailsOf`.
 */
function fidelityHoverTextOf(lines: FidelityLine[]): string {
  if (!lines.length) {
    return 'No volume in this viewport yet';
  }

  return lines.map(detailsOf).join('\n\n');
}

/** Debug-only dump for the left badge hover panel. */
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

type TextBadge = {
  root: HTMLDivElement;
  pills: HTMLDivElement;
  details: HTMLPreElement;
};

function ensureRelative(element: HTMLDivElement): void {
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }
}

/** The verbose text badge in the top-left corner of the viewport. */
function createTextBadge(element: HTMLDivElement): TextBadge {
  ensureRelative(element);

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

  element.appendChild(root);

  return { root, pills, details };
}

function renderTextBadge({ pills, details }: TextBadge, lines: FidelityLine[]): void {
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
