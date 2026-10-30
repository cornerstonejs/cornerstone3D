import { Events, ImageQualityStatus } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getConfiguration } from '../../../init';
import type { IViewport, Point3 } from '../../../types';
import { buildViewportFidelityState } from './buildViewportFidelityState';
import { fidelityDetailsTextOf } from './fidelityDetailsText';
import { fidelityLabelOf } from './fidelityLabel';
import { ensureFidelityIndicatorStyles } from './fidelityIndicatorStyles';
import { isLabelmapActorEntry } from './isLabelmapActorEntry';
import {
  type FidelityDataKind,
  type FidelityLine,
  type SvgFidelityState,
  dataKindOf,
  formatFactor,
  formatFactors,
  interactiveSampleRatioOf,
  isInteractiveLod,
  isReduced,
  lineHasData,
  standingSampleRatioOf,
  svgStateOf,
} from './fidelityIndicatorState';

export { isLabelmapActorEntry };

const COLORS = {
  full: '#2e9d4a',
  loading: '#c98a00',
  reduced: '#2f6fc0',
  decimated: '#c0392b',
  none: '#666',
};

/** How long Done stays visible before it fades (SVG mode). */
export const DONE_HOLD_MS = 3000;

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

/** One view of the fidelity lines: the product icon, or the debug badge. */
type FidelityView = {
  update: (lines: FidelityLine[]) => void;
  /** Forgets the lossiness history, for a viewport that shows new data. */
  reset?: () => void;
  remove: () => void;
};

type FidelityViewport = IViewport & {
  getFidelityLines?: () => FidelityLine[];
};

const cleanups = new WeakMap<object, () => void>();

/**
 * Attaches the fidelity indicator to a viewport that can report fidelity.
 *
 * Default UI is the fidelity indicator in the top-right (`loading` / `done` /
 * `lossy` / `lod`). When `init({ debug: { fidelityIndicatorDebug: true } })`
 * is set, the verbose debug badge is also shown in the top-left.
 *
 * The indicator is a consumer of `viewport.getFidelityLines()` and
 * `VIEWPORT_FIDELITY_CHANGED` (GENVIEW-FIDELITY-7). It never fires that event.
 * Apps that need the absolute record use `getFidelityState()`. It does not
 * read actors or mappers.
 *
 * Replaces any existing attachment for this viewport (including the engine
 * default). When `init({ dangerouslyDisableFidelityIndicator: true })` is set,
 * this detaches any existing indicator and is otherwise a no-op.
 *
 * While degraded, a permanent label reads "Low Fidelity" or
 * "Transient Low Fidelity" (FIDELITY-UI-2). Hover details use clinician
 * copy from the absolute fidelity record (FIDELITY-UI-5).
 *
 * @returns a function that removes the indicator and its listeners
 */
export function attachFidelityIndicator(viewport: IViewport): () => void {
  detachFidelityIndicator(viewport);

  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return () => {};
  }

  if (!hasFidelityApi(viewport)) {
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
 * Attaches the fidelity indicator when the viewport can report fidelity and
 * the product indicator is not disabled. Uses {@link attachFidelityIndicator},
 * which stores cleanup for {@link detachFidelityIndicator}.
 *
 * A generic family that can show degradable data reports fidelity before it
 * mounts data; the indicator stays `hidden` until it draws such data.
 */
export function maybeAttachFidelityIndicator(viewport: IViewport): void {
  if (getConfiguration().dangerouslyDisableFidelityIndicator) {
    return;
  }

  if (!canReportFidelity(viewport)) {
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
 * Whether a viewport can report fidelity (GENVIEW-FIDELITY-8). Declared on
 * `IViewportFidelity`; `Viewport` and `GenericViewport` both implement it.
 */
export function canReportFidelity(viewport: IViewport): boolean {
  return viewport.canReportFidelity() === true;
}

function hasFidelityApi(viewport: IViewport): viewport is FidelityViewport {
  return typeof (viewport as FidelityViewport).getFidelityLines === 'function';
}

function linesOf(viewport: FidelityViewport): FidelityLine[] {
  return viewport.getFidelityLines?.() ?? [];
}

/**
 * A key of the data that a viewport shows: its volume ids, and the first and
 * last image id and the count of its image ids. Scroll, zoom and pan keep it.
 */
function dataKeyOf(viewport: FidelityViewport): string {
  try {
    const ids = viewport as {
      getAllVolumeIds?: () => string[];
      getImageIds?: () => string[];
    };
    const volumeIds = ids.getAllVolumeIds?.() ?? [];
    const imageIds = ids.getImageIds?.() ?? [];

    return `${volumeIds.join('|')}#${imageIds.length}:${imageIds[0]}:${imageIds[imageIds.length - 1]}`;
  } catch {
    // A volume viewport with no volume throws from getImageIds.
    return '';
  }
}

/**
 * Reads fidelity lines from the viewport API and passes them to every view:
 * on attach, after a render, on `VIEWPORT_FIDELITY_CHANGED`, and when volume
 * data changes without a render. The indicator never fires the event
 * (FIDELITY-UI-8).
 */
function subscribeToFidelity(
  viewport: FidelityViewport,
  views: FidelityView[],
  restoreHost: () => void
): () => void {
  const { element } = viewport;
  let rafId = 0;
  let disposed = false;
  let dataKey: string | undefined;

  const updateViews = () => {
    const lines = linesOf(viewport);
    const key = dataKeyOf(viewport);

    // New data starts a new lossiness history (no recovery mark from the
    // data that the viewport showed before).
    if (key !== dataKey) {
      dataKey = key;
      for (const view of views) {
        view.reset?.();
      }
    }

    for (const view of views) {
      view.update(lines);
    }
  };

  const update = () => {
    rafId = 0;
    if (disposed) {
      return;
    }

    updateViews();
  };

  const schedule = () => {
    if (!rafId && !disposed) {
      rafId = requestAnimationFrame(update);
    }
  };

  const onVolumeModified = () => {
    schedule();
  };

  const onFidelityChanged = () => {
    if (disposed) {
      return;
    }
    updateViews();
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
    element.removeEventListener(
      Events.VIEWPORT_FIDELITY_CHANGED,
      onFidelityChanged
    );
    for (const type of VOLUME_DATA_EVENTS) {
      eventTarget.removeEventListener(type, onVolumeModified);
    }
    for (const view of views) {
      view.remove();
    }
    restoreHost();
  };

  element.addEventListener(Events.IMAGE_RENDERED, schedule);
  element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, onFidelityChanged);
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

  const label = document.createElement('div');
  label.className = 'fi-label';

  const details = document.createElement('pre');
  details.className = 'fi-details';

  root.append(label, htmlLayer, svg, details);
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
    details.textContent = clinicianHoverTextOf(lastLines);
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
        clearPermanentLabel();
      }
    }, DONE_HOLD_MS);
  };

  const ensureSvgGlyph = () => {
    if (!svg.querySelector('.fi-glyph')) {
      svg.innerHTML = SVG_GLYPH;
    }
  };

  const clearPermanentLabel = () => {
    delete root.dataset.label;
    label.textContent = '';
  };

  const setPermanentLabel = (svgState: SvgFidelityState | 'hidden') => {
    const text = fidelityLabelOf(svgState);

    if (!text) {
      clearPermanentLabel();
      return;
    }

    label.textContent = text;
    root.dataset.label =
      text === 'Transient Low Fidelity' ? 'transient' : 'low';
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
      clearPermanentLabel();
      svg.innerHTML = '';
      svg.setAttribute('aria-label', 'Image fidelity');
      return;
    }

    // A render in the same state keeps the running fade, so Done still fades
    // while the viewport renders every frame.
    if (next === currentState) {
      return;
    }

    // Done is a recovery from a lossy state (FIDELITY-UI-4). A lossless view
    // that was never lossy shows nothing.
    if (next === 'done' && currentState === 'hidden') {
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
      clearPermanentLabel();
      scheduleDoneFade();
    }
  };

  return {
    update: (lines) => {
      lastLines = lines;
      const next = svgStateOf(lines);
      setSvgState(next);
      // The done recovery flash has no label.
      if (next !== 'done' && next !== 'hidden') {
        setPermanentLabel(next);
      }
      if (hovered) {
        details.textContent = clinicianHoverTextOf(lines);
      }
    },
    reset: () => setSvgState('hidden'),
    remove: () => {
      clearTimeout(doneFadeTimer);
      root.remove();
    },
  };
}

function clinicianHoverTextOf(lines: FidelityLine[]): string {
  return fidelityDetailsTextOf(buildViewportFidelityState(lines), lines);
}

function summaryOf(line: FidelityLine): {
  text: string;
  color: string;
} {
  const { record, reductionFactors, imageQualityStatus } = line;

  if (!lineHasData(line)) {
    return { text: 'NO DATA', color: COLORS.none };
  }

  const dataKind = dataKindOf(line);

  if (dataKind === 'loading') {
    if (record) {
      const loaded =
        record.voxels > 0
          ? Math.min(
              99,
              Math.floor(
                (100 * (record.voxels - record.missing)) / record.voxels
              )
            )
          : 0;

      return {
        text: `${record.exact ? '' : '~'}${loaded}% loaded`,
        color: COLORS.loading,
      };
    }

    return { text: 'LOADING', color: COLORS.loading };
  }

  if (dataKind === 'decimated') {
    return { text: 'DECIMATED', color: COLORS.decimated };
  }

  const parts: string[] = [];

  if (dataKind === 'reduced') {
    // Every reduced line names its reduction, so the badge never reads FULL.
    const status = imageQualityStatus ?? record?.lowest;

    if (isReduced(reductionFactors)) {
      parts.push(`REDUCED ${formatFactors(reductionFactors)}`);
    } else if (status < ImageQualityStatus.FULL_RESOLUTION) {
      parts.push(ImageQualityStatus[status] ?? 'REDUCED');
    } else {
      parts.push(`SAMPLE ${formatFactor(standingSampleRatioOf(line))}×`);
    }
  }

  const interactive = interactiveSampleRatioOf(line);

  if (isInteractiveLod(interactive)) {
    parts.push(`LOD ${formatFactor(interactive)}×`);
  } else if (line.interactiveReduction) {
    parts.push('LOD');
  }

  if (parts.length) {
    return { text: parts.join(' · '), color: COLORS.reduced };
  }

  return { text: 'FULL', color: COLORS.full };
}

/**
 * Developer-facing hover for the debug badge only. The product icon uses
 * {@link clinicianHoverTextOf}.
 */
function fidelityHoverTextOf(lines: FidelityLine[]): string {
  if (!lines.length) {
    return 'No image data in this viewport yet';
  }

  return lines.map(detailsOf).join('\n\n');
}

const DETAIL_STATUS: Record<FidelityDataKind, (line: FidelityLine) => string> =
  {
    loading: () => 'loading',
    decimated: () => 'decimated',
    reduced: (line) =>
      line.record
        ? `reduced ${formatFactors(line.reductionFactors)}`
        : 'reduced',
    full: () => 'full resolution',
  };

function detailsOf(line: FidelityLine): string {
  const { label, record, imageQualityStatus } = line;

  if (!record) {
    if (imageQualityStatus !== undefined) {
      const status =
        ImageQualityStatus[imageQualityStatus] ?? String(imageQualityStatus);

      return [
        `${label}`,
        `  status    ${DETAIL_STATUS[dataKindOf(line)](line)}`,
        `  delivery  ${status}`,
        `  note      developer view — app indicators supply clinician text`,
      ].join('\n');
    }

    return line.fullResolution
      ? `${label}: no quality record`
      : `${label}: no quality record, reduced ${formatFactors(line.reductionFactors)}`;
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
  const interactive = interactiveSampleRatioOf(line);
  const standing = standingSampleRatioOf(line);
  const lodState = isInteractiveLod(interactive)
    ? `sample distance ×${formatFactor(interactive)} (interactive)`
    : line.interactiveReduction
      ? 'deferred resample (interactive)'
      : `sample distance idle ×${formatFactor(standing)}`;

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
    `  note      developer view — app indicators supply clinician text`,
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
