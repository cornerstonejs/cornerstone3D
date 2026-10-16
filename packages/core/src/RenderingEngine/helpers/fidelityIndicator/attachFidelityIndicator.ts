import { Events, ImageQualityStatus } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getConfiguration } from '../../../init';
import type { IViewport, Point3 } from '../../../types';
import { ensureFidelityIndicatorStyles } from './fidelityIndicatorStyles';
import { isLabelmapActorEntry } from './isLabelmapActorEntry';
import {
  type FidelityDataKind,
  type FidelityLine,
  type SvgFidelityState,
  dataKindOf,
  formatFactor,
  formatFactors,
  isInteractiveLod,
  isReduced,
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

/** One view of the fidelity lines: the product icon, or the debug badge. */
type FidelityView = {
  update: (lines: FidelityLine[]) => void;
  remove: () => void;
};

type FidelityViewport = IViewport & {
  canReportFidelity?: () => boolean;
  getFidelityState?: () => {
    state: SvgFidelityState | 'hidden';
    lines: FidelityLine[];
  };
  notifyFidelityStateChanged?: () => void;
};

const cleanups = new WeakMap<object, () => void>();

/**
 * Attaches the fidelity indicator to a viewport that can report fidelity.
 *
 * Default UI is the fidelity indicator in the top-right (`loading` / `done` /
 * `lossy` / `lod`). When `init({ debug: { fidelityIndicatorDebug: true } })`
 * is set, the verbose debug badge is also shown in the top-left.
 *
 * The indicator is a consumer of `viewport.getFidelityState()` and
 * `VIEWPORT_FIDELITY_CHANGED` (GENVIEW-FIDELITY-7). It does not read actors or
 * mappers.
 *
 * Replaces any existing attachment for this viewport (including the engine
 * default). When `init({ dangerouslyDisableFidelityIndicator: true })` is set,
 * this detaches any existing indicator and is otherwise a no-op.
 *
 * The built-in hover text is a developer view of the record (grid, delivery,
 * source, sample distance). Clinician-facing copy belongs on an application
 * indicator that reads the same state (FIDELITY-DISCOVER-4).
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
 * Whether this viewport should get the product fidelity indicator
 * (GENVIEW-FIDELITY-8). Decided from `viewport.canReportFidelity()` when
 * present, otherwise from content that can degrade (stack / volume).
 *
 * @deprecated Prefer {@link canReportFidelity}; kept as an alias for callers
 * that still import the volume-era name.
 */
export function isVolumeFidelityViewport(viewport: IViewport): boolean {
  return canReportFidelity(viewport);
}

/**
 * Whether a viewport can report fidelity (GENVIEW-FIDELITY-8). Uses the
 * viewport capability when available; does not use a hard list of types.
 */
export function canReportFidelity(viewport: IViewport): boolean {
  const vp = viewport as FidelityViewport;

  if (typeof vp.canReportFidelity === 'function') {
    return vp.canReportFidelity();
  }

  return false;
}

function hasFidelityApi(viewport: IViewport): viewport is FidelityViewport {
  return typeof (viewport as FidelityViewport).getFidelityState === 'function';
}

/**
 * Reads fidelity lines from the viewport API and passes them to every view.
 * Also keeps the viewport fidelity event in sync when volume data changes
 * without a render.
 */
function subscribeToFidelity(
  viewport: FidelityViewport,
  views: FidelityView[],
  restoreHost: () => void
): () => void {
  const { element } = viewport;
  let rafId = 0;
  let disposed = false;

  const update = () => {
    rafId = 0;
    if (disposed) {
      return;
    }

    viewport.notifyFidelityStateChanged?.();
    const { lines } = viewport.getFidelityState?.() ?? {
      lines: [] as FidelityLine[],
    };

    for (const view of views) {
      view.update(lines);
    }
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
    const { lines } = viewport.getFidelityState?.() ?? {
      lines: [] as FidelityLine[],
    };
    for (const view of views) {
      view.update(lines);
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

function summaryOf(line: FidelityLine): {
  text: string;
  color: string;
} {
  const { record, reductionFactors, sampleDistanceLod, imageQualityStatus } =
    line;

  if (!record && imageQualityStatus === undefined) {
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
    if (record && isReduced(reductionFactors)) {
      parts.push(`REDUCED ${formatFactors(reductionFactors)}`);
    } else if (imageQualityStatus !== undefined) {
      parts.push(
        ImageQualityStatus[imageQualityStatus] ?? String(imageQualityStatus)
      );
    }
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
 * Developer-facing hover text for the built-in indicator. This is not
 * clinician copy (FIDELITY-DISCOVER-4); applications should render clinician
 * words from `getFidelityState()` / `VIEWPORT_FIDELITY_CHANGED`.
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
  const { label, record, sampleDistanceLod, imageQualityStatus } = line;

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
