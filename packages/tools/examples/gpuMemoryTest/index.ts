import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
  eventTarget,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  getGpuMemoryStatus,
  getGpuMemoryLimit,
  setGpuMemoryLimit,
  resetGpuMemoryLimit,
  getGpuMemoryByKind,
  getGpuMemoryHistory,
  getLastGpuMemoryFailure,
  canRunGpuMemoryCalibration,
  runGpuMemoryCalibration,
  isWebGLBlocked,
  volumeTextureStore,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import { applyGpuMemoryUrlParameters } from '../../../../utils/demo/helpers/exampleParameters';
import {
  addGpuMemoryLog,
  allocateUntilFailure,
  attachGpuMemoryFailurePopup,
  gpuMemoryReport,
} from '../volumeProgressive/gpuMemoryControls';

/**
 * A test page of the automatic GPU memory limit and of the handling of a GPU
 * failure. Each step is a button that runs one check and states its result,
 * so a device with no developer console (a phone or a tablet) can run the
 * whole test. "Copy report" gives every result and number as text.
 *
 * The results live in the session storage of the tab, because the context
 * loss, a real failure and a calibration reload the page or stop the tab.
 */

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

const MEGABYTE = 1024 ** 2;
const GIGABYTE = 1024 ** 3;

const volumeId = 'cornerstoneStreamingImageVolume:CT_VOLUME_ID';
const renderingEngineId = 'gpuMemoryTestEngine';
const viewport3DId = 'CT_VOLUME_3D';
const viewports = [
  { id: 'CT_AXIAL', orientation: Enums.OrientationAxis.AXIAL },
  { id: 'CT_SAGITTAL', orientation: Enums.OrientationAxis.SAGITTAL },
  { id: 'CT_CORONAL', orientation: Enums.OrientationAxis.CORONAL },
  { id: viewport3DId, orientation: Enums.OrientationAxis.CORONAL },
];
const viewportIds = viewports.map(({ id }) => id);

const ctSeries = {
  StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
  SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
  wadoRsRoot: getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
};

/** The results of the steps, kept across the reloads of the test. */
const RESULTS_KEY = 'gpuMemoryTest.results';
/** A step that a reload or a stopped tab interrupts, to finish at the start. */
const PENDING_KEY = 'gpuMemoryTest.pending';
/** The messages between the two tabs of the wait for WebGL. */
const TAB_KEY = 'gpuMemoryTest.tab';
/** The stored wait for WebGL, as a tab that had a failure writes it. */
const WEBGL_BLOCK_KEY = 'cornerstone3D.webglBlockedUntil';
/** The second tab of step 5 opens with this parameter. */
const SECOND_TAB_PARAMETER = 'gpuTestRole';

type Status = 'pass' | 'fail' | 'info' | 'running';
type StepResult = { status: Status; details: string; at: number };
type Results = Record<string, StepResult>;

/**
 * Each step, with a one-line hint. The hint shows on the next step to run, on
 * a running step and on a failed one; `risky` marks the steps that make the
 * GPU fail on purpose.
 */
const STEPS = [
  { id: 'device', title: 'Device and start limit', hint: 'Shows at once.' },
  {
    id: 'load',
    title: 'Load the CT',
    hint: 'Up to a minute; the four images appear.',
  },
  {
    id: 'limit',
    title: 'Lower, then reset the limit',
    hint: 'The images turn soft, then sharp again, by themselves (up to 15 s).',
  },
  {
    id: 'contextLoss',
    title: 'Lose the context during a load',
    hint: 'The page reloads, turns black, and a popup opens: press the outlined button.',
  },
  {
    id: 'tabs',
    title: 'Share the WebGL wait with a 2nd tab',
    hint: 'A tab opens and closes by itself. If it is blocked, open the link shown.',
  },
  {
    id: 'allocate',
    title: 'Allocate until the GPU fails',
    hint: 'Record the screen first. The tab can freeze or stop: reload it if so.',
    risky: true,
  },
  {
    id: 'calibrate',
    title: 'Run a calibration',
    hint: 'The GPU fails again. The images can stay black after it.',
    risky: true,
  },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/** A size for a person: `341 MB`, `1.5 GB`. */
function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return 'none';
  }

  return bytes >= GIGABYTE
    ? `${Number((bytes / GIGABYTE).toFixed(2))} GB`
    : `${Math.round(bytes / MEGABYTE)} MB`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `predicate` is true, or the time runs out. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 250
): Promise<boolean> {
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    if (predicate()) {
      return true;
    }

    await sleep(intervalMs);
  }

  return predicate();
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readResults(): Results {
  return readJson<Results>(sessionStorage, RESULTS_KEY, {});
}

/** The second tab of step 5 only reports the wait it sees. */
const isSecondTab =
  new URLSearchParams(window.location.search).get(SECOND_TAB_PARAMETER) ===
  'second';

/**
 * The page: a toolbar above three columns, the steps, the four viewports, and
 * the live numbers with the log. Narrower windows move the numbers under the
 * viewports, then stack everything. The tiles stay at 300 px or less, as on
 * the earlier runs, so the cost of each draw during the load and the GPU
 * memory of the page that the steps measure stay comparable.
 */
setTitleAndDescription(
  'GPU Memory Test',
  'Run the steps in order with this window in front, then copy the report. Steps 6 and 7 make the GPU fail on purpose.'
);

const style = document.createElement('style');

style.textContent = `
:root { color-scheme: light; }
body { margin: 12px 16px; background: #fff; color: #1f2328; }
#demo-title { margin: 0; font: 600 20px system-ui, sans-serif; }
#demo-description { margin: 2px 0 10px; font: 13px system-ui, sans-serif; color: #57606a; }
.gmt { font: 13px/1.4 system-ui, sans-serif; color: #1f2328; }
.gmt button { font: inherit; cursor: pointer; }
.gmt button:disabled { cursor: not-allowed; opacity: 0.55; }
.gmt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.gmt-bar button { padding: 4px 12px; border: 1px solid #c8ccd1; border-radius: 6px; background: #fff; }
.gmt-bar .gmt-primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.gmt-progress { margin-left: auto; color: #57606a; }
.gmt-main { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 604px) minmax(230px, 340px); grid-template-areas: 'steps viewports side'; gap: 14px; align-items: start; }
@media (max-width: 1100px) { .gmt-main { grid-template-columns: minmax(280px, 360px) minmax(0, 604px); grid-template-areas: 'steps viewports' 'steps side'; } }
@media (max-width: 760px) { .gmt-main { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'steps' 'viewports' 'side'; } }
.gmt-left { grid-area: steps; }
.gmt-viewports { grid-area: viewports; }
.gmt-right { grid-area: side; }
.gmt-left, .gmt-right { display: grid; gap: 10px; min-width: 0; }
.gmt-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.gmt-step { border: 1px solid #d0d7de; border-radius: 8px; background: #fff; }
.gmt-step[data-next] { border-color: #1f6feb; box-shadow: 0 0 0 1px #1f6feb; }
.gmt-run { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: 0; background: none; text-align: left; color: inherit; }
.gmt-num { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #eaeef2; font-size: 12px; font-weight: 600; }
.gmt-title { flex: 1; font-weight: 600; }
.gmt-tag { margin-left: 6px; font-size: 11px; font-weight: 500; color: #9a6700; }
.gmt-badge { flex: none; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.gmt-badge:empty { display: none; }
[data-state=pass] .gmt-badge { background: #dafbe1; color: #1a7f37; }
[data-state=fail] .gmt-badge { background: #ffebe9; color: #cf222e; }
[data-state=info] .gmt-badge { background: #fff8c5; color: #9a6700; }
[data-state=running] .gmt-badge { background: #ddf4ff; color: #0969da; }
[data-state=pass] .gmt-num { background: #1a7f37; color: #fff; }
[data-state=fail] .gmt-num { background: #cf222e; color: #fff; }
[data-state=info] .gmt-num { background: #bf8700; color: #fff; }
[data-state=running] .gmt-num { background: #0969da; color: #fff; }
.gmt-hint, .gmt-result { padding: 0 10px 7px 40px; font-size: 12px; }
.gmt-hint { display: none; color: #57606a; }
.gmt-step[data-next] .gmt-hint, [data-state=running] .gmt-hint, [data-state=fail] .gmt-hint, .gmt-step[data-locked] .gmt-hint { display: block; }
.gmt-step[data-locked] { background: #f6f8fa; }
.gmt-result { color: #424a53; overflow-wrap: anywhere; }
.gmt-result:empty { display: none; }
.gmt-report { width: 100%; height: 10em; box-sizing: border-box; font: 11px ui-monospace, monospace; }
.gmt-viewports { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; width: min(100%, calc(100vh - 130px), 604px); min-width: 260px; }
.gmt-tile { position: relative; aspect-ratio: 1 / 1; border-radius: 4px; overflow: hidden; background: #000; }
.gmt-tile > div:first-child { width: 100%; height: 100%; }
.gmt-label { position: absolute; left: 6px; bottom: 4px; font: 11px ui-monospace, monospace; color: #fff; text-shadow: 0 0 3px #000; pointer-events: none; }
.gmt-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.gmt-card { padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 8px; }
.gmt-card h3 { margin: 0 0 4px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #57606a; }
.gmt-card dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; }
.gmt-card dt { color: #57606a; }
.gmt-card dd { margin: 0; font: 12px ui-monospace, monospace; overflow-wrap: anywhere; }
.gmt-card dd.gmt-bad { color: #cf222e; font-weight: 600; }
.gmt-log summary { cursor: pointer; color: #57606a; }
.gmt-log pre { max-width: none !important; max-height: 16em !important; }
`;
document.head.appendChild(style);

/** Creates an element with a class and, optionally, its text. */
function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

const content = document.getElementById('content');
const root = make('div', 'gmt');
const toolbar = make('div', 'gmt-bar');
const main = make('div', 'gmt-main');
const left = make('div', 'gmt-left');
const right = make('div', 'gmt-right');
const stepsList = make('ol', 'gmt-steps');
const grid = make('div', 'gmt-viewports');

left.appendChild(stepsList);
main.append(left, grid, right);
root.append(toolbar, main);
content.appendChild(root);

const VIEWPORT_NAMES = ['Axial', 'Sagittal', 'Coronal', '3D'];
const labels: HTMLElement[] = [];

const elements = viewports.map((_, index) => {
  const tile = make('div', 'gmt-tile');
  const element = make('div');
  const label = make('div', 'gmt-label', VIEWPORT_NAMES[index]);

  element.oncontextmenu = (event) => event.preventDefault();
  tile.append(element, label);
  grid.appendChild(tile);
  labels.push(label);

  return element;
});

/** A card of label and value rows, refreshed by `fillFacts`. */
function factsCard(title: string): HTMLElement {
  const card = make('div', 'gmt-card');
  const list = make('dl');

  card.append(make('h3', undefined, title), list);
  facts.appendChild(card);

  return list;
}

const facts = make('div', 'gmt-facts');

right.appendChild(facts);

const deviceList = factsCard('Device');
const memoryList = factsCard('GPU memory');

function fillFacts(
  list: HTMLElement,
  rows: Array<[string, string, boolean?]>
): void {
  list.replaceChildren(
    ...rows.flatMap(([label, value, bad]) => {
      const term = make('dt', undefined, label);
      const description = make('dd', bad ? 'gmt-bad' : undefined, value);

      return [term, description];
    })
  );
}

const logBox = make('details', 'gmt-log');

logBox.appendChild(make('summary', undefined, 'Log'));
right.appendChild(logBox);

let renderingEngine: RenderingEngine | undefined;
let imageIds: string[] = [];
let log: (text: string) => void = () => undefined;

/** The texture sets of the CT, and the bytes that the store counts for them. */
function ctSets() {
  const sets = volumeTextureStore.setsOfVolume(volumeId);

  return {
    sets: sets.map(({ name, references, bytes }) => ({
      name,
      references,
      bytes,
    })),
    heldBytes: sets
      .filter(({ references }) => references > 0)
      .reduce((total, { bytes }) => total + bytes, 0),
  };
}

/** What each CT viewport draws, and why it is reduced. */
function viewportStates() {
  return viewportIds.map((id) => {
    const state = renderingEngine?.getViewport(id)?.getFidelityState?.() as
      | Types.ViewportFidelityState
      | undefined;

    return {
      id,
      dimensions: state?.dataResolution?.dimensions?.slice(0, 3),
      cause: state?.cause ?? 'full',
    };
  });
}

/** A hash of what each CT viewport shows, to tell that it drew again. */
function canvasHashes(): string[] {
  return viewportIds.map((id) => {
    const canvas = renderingEngine?.getViewport(id)?.canvas;

    if (!canvas) {
      return 'none';
    }

    const copy = document.createElement('canvas');

    copy.width = 64;
    copy.height = 64;

    const context = copy.getContext('2d');

    context.drawImage(canvas, 0, 0, 64, 64);

    const { data } = context.getImageData(0, 0, 64, 64);
    let hash = 2166136261;

    for (let index = 0; index < data.length; index++) {
      hash = Math.imul(hash ^ data[index], 16777619);
    }

    return (hash >>> 0).toString(16);
  });
}

function pendingRecords(): number {
  return Object.keys(localStorage).filter((key) => key.includes('.pending.'))
    .length;
}

/** The device facts that step 1 checks and the report holds. */
function deviceFacts() {
  const capabilities = getRenderingCapabilities();
  const record = getStoredRenderingCapabilities();
  const status = getGpuMemoryStatus();

  return {
    userAgent: navigator.userAgent,
    renderer: capabilities.renderer,
    rendererClass: status.rendererClass,
    webgl: capabilities.webgl,
    /**
     * From the probe of the library, which tested the format: a context made
     * here each second would reach the context limit of the browser, which
     * then drops the oldest context, a viewport's.
     */
    norm16: Boolean(capabilities.norm16),
    applies: status.applies,
    limit: status.applies
      ? `${formatBytes(status.limitBytes)} ${status.source}${status.hard ? ' hard' : ''}`
      : 'none',
    start: formatBytes(status.startBytes),
    probeVersion: record?.probeVersion,
    edge: record?.edge?.reliable,
    max3DTextureSize: record?.max3DTextureSize,
    webglBlocked: status.webglBlocked,
  };
}

function updateLivePanels(): void {
  const device = deviceFacts();
  const status = getGpuMemoryStatus();
  const { sets, heldBytes } = ctSets();
  const ledgerBytes = getGpuMemoryByKind().texture;
  const matches =
    sets.length === 0 || Math.abs(heldBytes - ledgerBytes) <= 0.01 * heldBytes;
  const webgl = !device.webgl
    ? 'none'
    : status.webglBlocked
      ? `waits (${status.webglBlockReason}) until ${status.webglBlockedUntil ? new Date(status.webglBlockedUntil).toLocaleTimeString() : '?'}`
      : 'available';

  fillFacts(deviceList, [
    ['Renderer', device.renderer || 'none'],
    ['Class', device.rendererClass],
    ['16-bit', device.norm16 ? 'yes' : 'no'],
    [
      'Edge',
      device.edge
        ? `${device.edge.value}${device.edge.assumed ? ' (assumed)' : ''}`
        : 'none',
      !device.edge,
    ],
    ['Probe', `version ${device.probeVersion ?? 'none'}`],
    ['WebGL', webgl, status.webglBlocked],
  ]);
  fillFacts(memoryList, [
    [
      'Limit',
      status.applies
        ? `${formatBytes(status.limitBytes)} (${status.source}${status.hard ? ', hard' : ''})`
        : 'none',
    ],
    ['Start', device.start],
    ['Store', formatBytes(heldBytes)],
    [
      'Counted',
      `${formatBytes(ledgerBytes)}${matches ? '' : ' (mismatch)'}`,
      !matches,
    ],
    ['Page', formatBytes(status.pageBytes)],
    [
      'Sets',
      sets
        .map(({ name, references }) => `${name} (${references})`)
        .join(', ') || 'none',
    ],
  ]);

  viewportStates().forEach(({ dimensions, cause }, index) => {
    labels[index].textContent = [
      VIEWPORT_NAMES[index],
      dimensions?.join('×'),
      dimensions && cause !== 'full' ? cause : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  });
}

/** The steps. */

type StepView = {
  row: HTMLElement;
  badge: HTMLElement;
  hint: HTMLElement;
  result: HTMLElement;
};

const stepViews = new Map<StepId, StepView>();
/** True while a step runs: the other steps cannot start. */
let busy = false;
const buttons = new Map<StepId, HTMLButtonElement>();
const progress = make('span', 'gmt-progress');

const BADGE: Record<Status, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  info: 'NOTE',
  running: 'RUNNING',
};

const BEFORE_ALLOCATE: StepId[] = [
  'device',
  'load',
  'limit',
  'contextLoss',
  'tabs',
];

/**
 * Why a step cannot run yet, or `undefined` when it can. Step 6 comes after
 * the others, since its failure can block WebGL for the steps after it, and
 * a calibration needs the real failure of step 6.
 */
function lockReason(id: StepId, results: Results): string | undefined {
  if (
    id === 'allocate' &&
    BEFORE_ALLOCATE.some(
      (before) => !results[before] || results[before].status === 'running'
    )
  ) {
    return 'Run steps 1 to 5 first.';
  }

  if (id === 'calibrate' && results.allocate?.status !== 'pass') {
    return 'Needs a real GPU failure from step 6.';
  }

  return undefined;
}

/**
 * Shows each result, marks the next step to run, enables the steps that can
 * run, and counts the done ones.
 */
function showResults(): void {
  const results = readResults();
  const running = Object.values(results).some(
    ({ status }) => status === 'running'
  );
  const next = running
    ? undefined
    : STEPS.find(
        ({ id }) =>
          !lockReason(id, results) &&
          (!results[id] || results[id].status === 'fail')
      )?.id;

  STEPS.forEach(({ id, hint }) => {
    const view = stepViews.get(id);
    const result = results[id];
    const locked = lockReason(id, results);

    if (!view) {
      return;
    }

    buttons.get(id).disabled = busy || Boolean(locked);
    view.row.toggleAttribute('data-locked', Boolean(locked));
    view.hint.textContent = locked ?? hint;
    view.row.dataset.state = result?.status ?? 'none';
    view.badge.textContent = result ? BADGE[result.status] : '';
    view.result.textContent =
      result && result.details !== 'running' ? result.details : '';
    view.row.toggleAttribute('data-next', id === next);
  });

  const done = STEPS.filter(
    ({ id }) => results[id]?.status === 'pass' || results[id]?.status === 'info'
  ).length;

  progress.textContent = `${done} of ${STEPS.length} done`;
}

function setResult(id: StepId, status: Status, details: string): void {
  const results = readResults();

  results[id] = { status, details, at: Date.now() };
  sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  showResults();
  log(`Step ${id}: ${BADGE[status]} ${details}`);
}

/**
 * True when the page draws: it is visible, and an animation frame comes. A
 * browser draws nothing in a hidden tab, and Chrome on macOS draws nothing in
 * a window that another window covers, so a step there would test nothing.
 */
async function pageDraws(): Promise<boolean> {
  if (document.visibilityState !== 'visible') {
    return false;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);

    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

const NOT_DRAWING =
  'the page did not draw: keep the window in front and uncovered, then run the step again';

/** One step at a time: a step that runs keeps the others from starting. */
function setBusy(value: boolean): void {
  busy = value;
  showResults();
}

async function runStep(id: StepId, run: () => Promise<void>): Promise<void> {
  if (busy) {
    log('Wait for the running step to end');

    return;
  }

  setBusy(true);
  setResult(id, 'running', 'running');

  try {
    if (!(await pageDraws())) {
      setResult(id, 'fail', NOT_DRAWING);

      return;
    }

    await run();

    /** A step whose page stopped drawing meanwhile tested nothing. */
    if (readResults()[id]?.status === 'fail' && !(await pageDraws())) {
      setResult(id, 'fail', `${readResults()[id].details}; ${NOT_DRAWING}`);
    }
  } catch (error) {
    setResult(id, 'fail', `error: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
}

/** Loads the CT into the four viewports, once. */
async function loadCt(): Promise<void> {
  if (!cache.getVolume(volumeId)) {
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    volume.load();
    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
    (
      renderingEngine.getViewport(viewport3DId) as Types.IVolumeViewport
    ).setProperties({ preset: 'CT-Bone' });
    renderingEngine.render();
  }

  const loaded = await waitFor(
    () => Boolean(cache.getVolume(volumeId)?.loadStatus?.loaded),
    300_000,
    500
  );

  if (!loaded) {
    throw new Error('the CT did not load in 5 minutes');
  }

  /**
   * A CT from the cache of the browser loads before anything draws. The
   * texture uploads at the first draw, and a large upload settles 5 s after
   * it, so the step waits for the upload, then for its record.
   */
  await waitFor(() => getGpuMemoryByKind().texture > 0, 30_000);
  await waitFor(
    () =>
      pendingRecords() === 0 &&
      (!getGpuMemoryStatus().applies ||
        Boolean(getGpuMemoryHistory().largestLoad)),
    20_000
  );
}

async function stepDevice(): Promise<void> {
  const device = deviceFacts();

  if (!device.webgl) {
    setResult('device', 'fail', 'no WebGL2 on this device');

    return;
  }

  if (!device.applies) {
    setResult(
      'device',
      'info',
      `renderer class ${device.rendererClass}: the GPU limits apply to a real GPU only`
    );

    return;
  }

  const problems = [];

  if (typeof device.probeVersion !== 'number') {
    problems.push('no probe record');
  }

  if (!device.edge) {
    problems.push('no reliable edge');
  }

  const expectedStart = device.rendererClass === 'mobile' ? '1 GB' : '2 GB';
  const details = `${device.rendererClass}, limit ${device.limit}, edge ${device.edge?.value ?? 'none'}, norm16 ${device.norm16 ? 'yes' : 'no'}`;

  if (device.start !== expectedStart) {
    problems.push(
      `start ${device.start}, ${expectedStart} expected unless the edge is below 2048`
    );
  }

  setResult(
    'device',
    problems.length ? 'fail' : 'pass',
    problems.length ? `${details}; ${problems.join('; ')}` : details
  );
}

async function stepLoad(): Promise<void> {
  await loadCt();

  const { sets, heldBytes } = ctSets();
  const ledgerBytes = getGpuMemoryByKind().texture;
  const largest = getGpuMemoryHistory().largestLoad;
  const problems = [];

  if (sets.length !== 1 || sets[0].references !== viewportIds.length) {
    problems.push(
      `sets ${sets.map(({ name, references }) => `${name} (${references})`).join(', ')}; one set held by 4 viewports expected`
    );
  }

  if (Math.abs(heldBytes - ledgerBytes) > 0.01 * heldBytes) {
    problems.push(
      `the store counts ${formatBytes(heldBytes)} and the GPU memory count ${formatBytes(ledgerBytes)}`
    );
  }

  if (pendingRecords()) {
    problems.push('a pending record stayed after the load');
  }

  if (getGpuMemoryStatus().applies && !largest) {
    problems.push('the history holds no load that worked');
  }

  setResult(
    'load',
    problems.length ? 'fail' : 'pass',
    problems.length
      ? problems.join('; ')
      : `textures ${formatBytes(ledgerBytes)}, largest load ${formatBytes(largest?.bytes)}`
  );
}

async function stepLimit(): Promise<void> {
  await loadCt();

  if (!getGpuMemoryStatus().applies) {
    setResult('limit', 'info', 'no GPU limit applies on this device');

    return;
  }

  const before = {
    hashes: canvasHashes(),
    bytes: getGpuMemoryByKind().texture,
    dimensions: viewportStates().map(({ dimensions }) => dimensions?.join()),
  };
  const lowered = () => {
    const { sets } = ctSets();
    const states = viewportStates();
    const hashes = canvasHashes();

    return {
      oneSet: sets.length === 1 && sets[0].references === viewportIds.length,
      smaller: states.every(
        ({ dimensions }, index) =>
          dimensions && dimensions.join() !== before.dimensions[index]
      ),
      fewerBytes: getGpuMemoryByKind().texture < before.bytes,
      redrawn: hashes.every((hash, index) => hash !== before.hashes[index]),
    };
  };

  /** Nothing here renders: the viewports must draw the new size by themselves. */
  setGpuMemoryLimit({ bytes: 256 * MEGABYTE });

  const reduced = await waitFor(
    () => Object.values(lowered()).every(Boolean),
    15_000
  );
  const afterLower = lowered();
  const reducedBytes = getGpuMemoryByKind().texture;

  resetGpuMemoryLimit();

  const restored = await waitFor(() => {
    const { sets } = ctSets();

    return (
      sets.length === 1 &&
      getGpuMemoryByKind().texture === before.bytes &&
      viewportStates().every(
        ({ dimensions }, index) =>
          dimensions?.join() === before.dimensions[index]
      )
    );
  }, 15_000);

  const problems = Object.entries(afterLower)
    .filter(([, ok]) => !ok)
    .map(([name]) => `at 256 MB: not ${name}`);

  if (!restored) {
    problems.push('the reset did not bring back the full size with one set');
  }

  setResult(
    'limit',
    reduced && restored ? 'pass' : 'fail',
    problems.length
      ? problems.join('; ')
      : `${formatBytes(reducedBytes)} at 256 MB, ${formatBytes(before.bytes)} after the reset, redrawn by itself`
  );
}

/**
 * Step 4 reloads with a fresh record, then loses the context of the first
 * large 3D texture as it uploads (see `armContextLoss`).
 */
async function stepContextLoss(): Promise<void> {
  if (busy) {
    log('Wait for the running step to end');

    return;
  }

  if (!(await pageDraws())) {
    setResult('contextLoss', 'fail', NOT_DRAWING);

    return;
  }

  sessionStorage.setItem(PENDING_KEY, 'contextLoss');

  const url = new URL(window.location.href);

  url.searchParams.set('gpuReset', '1');
  window.location.href = url.toString();
}

/** Loses the context of the first large 3D texture right after its upload. */
function armContextLoss(): void {
  const prototype = WebGL2RenderingContext.prototype;
  const { texStorage3D, texImage3D } = prototype;
  let lost = false;

  const lose = (
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    depth: number
  ) => {
    /** The probe uploads N x 4 x 4 shapes; a volume is large on each axis. */
    if (!lost && width >= 64 && height >= 64 && depth >= 64) {
      lost = true;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };

  prototype.texStorage3D = function (
    this: WebGL2RenderingContext,
    ...args: Parameters<WebGL2RenderingContext['texStorage3D']>
  ) {
    texStorage3D.apply(this, args);
    lose(this, args[3], args[4], args[5]);
  };
  prototype.texImage3D = function (
    this: WebGL2RenderingContext,
    ...args: unknown[]
  ) {
    Reflect.apply(texImage3D, this, args);
    lose(this, args[3] as number, args[4] as number, args[5] as number);
  };
}

async function finishContextLoss(): Promise<void> {
  setResult(
    'contextLoss',
    'running',
    'losing the context: wait for the result before you use the popup'
  );

  const failures: Types.EventTypes.GpuMemoryFailureEventDetail[] = [];

  eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, (event) =>
    failures.push(
      (event as CustomEvent<Types.EventTypes.GpuMemoryFailureEventDetail>)
        .detail
    )
  );
  armContextLoss();
  loadCt().catch(() => undefined);

  await waitFor(() => failures.length > 0, 60_000);

  const [failure] = failures;

  if (!failure) {
    setResult(
      'contextLoss',
      'fail',
      document.visibilityState === 'hidden'
        ? 'no failure: the page was hidden, and a hidden page counts no loss'
        : (await pageDraws())
          ? 'no failure within 60 s'
          : `no failure; ${NOT_DRAWING}`
    );

    return;
  }

  const ok =
    failure.kind === 'contextLost' &&
    failure.mustReload &&
    failure.suggestedBytes >= 128 * MEGABYTE &&
    failures.length === 1;

  setResult(
    'contextLoss',
    ok ? 'pass' : 'fail',
    `${failures.length} failure(s): ${failure.kind} at ${formatBytes(failure.failedBytes)}, ${formatBytes(failure.suggestedBytes)} suggested, reload ${failure.mustReload ? 'required' : 'not required'}`
  );
  guidePopup('Step 4 done. Press "Reload", not "Reload with …".', 'Reload');
}

/**
 * The guide of the test in the failure popup: a note on top, and the button
 * to press marked. The popup redraws its buttons when the wait for WebGL
 * changes, so an observer applies the guide again after each redraw.
 */
let popupGuide: { text: string; press?: string } | undefined;
let popupObserver: MutationObserver | undefined;

function failurePopup(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('div')].find(
    (element) =>
      element.style.position === 'fixed' && element.style.zIndex === '1000'
  );
}

function applyPopupGuide(): void {
  const popup = failurePopup();
  const panel = popup?.firstElementChild as HTMLElement | null;

  if (!panel || !popupGuide) {
    return;
  }

  popupObserver?.disconnect();

  let note = panel.querySelector<HTMLElement>('[data-test-guide]');

  if (!note) {
    note = document.createElement('div');
    note.dataset.testGuide = 'true';
    Object.assign(note.style, {
      margin: '0 0 8px',
      padding: '6px 8px',
      background: '#e8f5e9',
      border: '1px solid #1b7f3b',
      borderRadius: '4px',
      fontWeight: 'bold',
    });
    panel.prepend(note);
  }

  note.textContent = popupGuide.text;
  panel.querySelectorAll('button').forEach((button) => {
    button.style.outline =
      button.textContent === popupGuide.press ? '3px solid #1b7f3b' : '';
  });

  popupObserver = new MutationObserver(applyPopupGuide);
  popupObserver.observe(panel, { childList: true, subtree: true });
}

/** Shows the guide of a test step in the failure popup. */
function guidePopup(text: string, press?: string): void {
  popupGuide = { text, press };
  applyPopupGuide();
}

/** The guide for a failure that step 6 caused, by what the popup offers. */
function guideAfterRealFailure(
  failure: Types.EventTypes.GpuMemoryFailureEventDetail
): void {
  if (failure.mustReload && isWebGLBlocked()) {
    guidePopup(
      'Step 6 done. Press nothing: the page reloads after the countdown. Then run step 7.'
    );
  } else if (failure.mustReload) {
    guidePopup('Step 6 done. Press "Reload", then run step 7.', 'Reload');
  } else {
    guidePopup('Step 6 done. Press "Dismiss", then run step 7.', 'Dismiss');
  }
}

/** The messages of the second tab since `since`. */
function tabEvent(name: string, since: number): boolean {
  const message = readJson<{ event?: string; at?: number }>(
    localStorage,
    TAB_KEY,
    {}
  );

  return message.event === name && (message.at ?? 0) >= since;
}

async function stepTabs(): Promise<void> {
  const start = Date.now();
  const url = new URL(window.location.pathname, window.location.origin);

  url.searchParams.set(SECOND_TAB_PARAMETER, 'second');

  const second = window.open(url.toString(), '_blank');

  /** A browser that blocks the pop-up leaves the second tab to the person. */
  setResult(
    'tabs',
    'running',
    second
      ? 'waiting for the second tab'
      : `pop-ups are blocked: open ${url.toString()} in a new tab`
  );

  const problems = [];

  if (!(await waitFor(() => tabEvent('ready', start), 120_000))) {
    problems.push('the second tab did not start');
  } else {
    /** As a tab that had a failure stores it: a wait of 20 s. */
    localStorage.setItem(
      WEBGL_BLOCK_KEY,
      JSON.stringify({
        until: Date.now() + 20_000,
        reason: 'cooldown',
        at: Date.now(),
      })
    );

    if (!(await waitFor(() => tabEvent('started', start), 10_000))) {
      problems.push('the second tab did not see the wait start');
    }

    localStorage.removeItem(WEBGL_BLOCK_KEY);

    if (!(await waitFor(() => tabEvent('ended', start), 10_000))) {
      problems.push('the second tab did not see the wait end');
    }
  }

  second?.close();
  setResult(
    'tabs',
    problems.length ? 'fail' : 'pass',
    problems.length
      ? problems.join('; ')
      : 'the second tab saw the wait start and end; wait 20 s before step 6'
  );
}

/** The second tab of step 5: it reports the wait that it sees, and nothing else. */
function runAsSecondTab(): void {
  const report = (event: string) =>
    localStorage.setItem(TAB_KEY, JSON.stringify({ event, at: Date.now() }));

  eventTarget.addEventListener(Events.WEBGL_AVAILABILITY_CHANGED, (event) => {
    const { blocked, sourceTab } = (
      event as CustomEvent<Types.EventTypes.WebGLAvailabilityChangedEventDetail>
    ).detail;

    if (blocked && sourceTab === 'other') {
      report('started');
    } else if (!blocked) {
      report('ended');
    }
  });
  /** The status of the page reads the stored wait each second. */
  setInterval(() => isWebGLBlocked(), 250);
  report('ready');
}

async function stepAllocate(): Promise<void> {
  await loadCt();

  if (isWebGLBlocked()) {
    setResult(
      'allocate',
      'info',
      'WebGL waits after a failure: run it again when the wait ends'
    );

    return;
  }

  const start = Date.now();

  sessionStorage.setItem(PENDING_KEY, 'allocate');

  const onFailure = (event: Event) =>
    guideAfterRealFailure(
      (event as CustomEvent<Types.EventTypes.GpuMemoryFailureEventDetail>)
        .detail
    );

  eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, onFailure);
  await allocateUntilFailure({
    renderingEngine,
    viewportId: viewport3DId,
    sourceVolumeId: volumeId,
    log,
  });
  eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, onFailure);
  sessionStorage.removeItem(PENDING_KEY);

  const failure = getLastGpuMemoryFailure();

  if (failure && failure.at >= start) {
    setResult(
      'allocate',
      'pass',
      `${failure.kind} at ${formatBytes(failure.failedBytes)}, ${formatBytes(failure.suggestedBytes)} suggested; WebGL ${isWebGLBlocked() ? `waits (${getGpuMemoryStatus().webglBlockReason})` : 'available'}`
    );
  } else {
    setResult(
      'allocate',
      'info',
      'no failure: cancelled, or none up to 32 GB (see the log). Step 7 will skip; reload to drop the 64 GB limit of the run.'
    );
  }
}

async function stepCalibrate(): Promise<void> {
  /**
   * A calibration starts at 90 % of the failed size, and adds 10 % of that at
   * each step. After the forced failure of step 4 (some 300 MB) on a GPU that
   * does not fail, it would climb in steps of some 30 MB for a very long time,
   * so it needs a real failure from step 6.
   */
  if (readResults().allocate?.status !== 'pass') {
    setResult(
      'calibrate',
      'info',
      'skipped: step 6 found no real failure, as expected where the GPU pages to system memory'
    );

    return;
  }

  if (!canRunGpuMemoryCalibration()) {
    setResult(
      'calibrate',
      'info',
      'needs a failure and no WebGL wait: run step 6 first, or wait'
    );

    return;
  }

  if (
    !window.confirm(
      'The calibration allocates GPU memory until the GPU fails. The browser can then block WebGL for this site for about two minutes. Run it?'
    )
  ) {
    setResult('calibrate', 'info', 'cancelled');

    return;
  }

  const limitBefore = JSON.stringify(getGpuMemoryLimit());

  sessionStorage.setItem(PENDING_KEY, 'calibrate');

  const result = await runGpuMemoryCalibration();

  sessionStorage.removeItem(PENDING_KEY);
  checkCalibration(limitBefore, result);
}

function checkCalibration(
  limitBefore: string | undefined,
  result = getGpuMemoryHistory().calibration
): void {
  if (!result) {
    setResult('calibrate', 'fail', 'no calibration in the history');

    return;
  }

  const unchanged =
    limitBefore === undefined ||
    JSON.stringify(getGpuMemoryLimit()) === limitBefore;

  setResult(
    'calibrate',
    unchanged ? 'pass' : 'fail',
    `worked up to ${formatBytes(result.largestSuccessBytes)}, failed at ${formatBytes(result.failedBytes)}; limit ${unchanged ? 'unchanged' : 'changed, which it must not'}`
  );
}

/**
 * A step left running by a reload it did not ask for, such as a reload of the
 * dev server, cannot end: it fails, so that it can run again. A step that
 * reloads on purpose is pending, and ends in `finishPendingStep`.
 */
function failInterruptedSteps(): void {
  const pending = sessionStorage.getItem(PENDING_KEY);

  Object.entries(readResults())
    .filter(([id, { status }]) => status === 'running' && id !== pending)
    .forEach(([id]) =>
      setResult(
        id as StepId,
        'fail',
        'interrupted by a reload of the page: run it again'
      )
    );
}

/** A step that the reload or a stopped tab interrupted ends here. */
async function finishPendingStep(): Promise<void> {
  const pending = sessionStorage.getItem(PENDING_KEY);

  sessionStorage.removeItem(PENDING_KEY);

  if (!pending) {
    return;
  }

  setBusy(true);

  try {
    await finishInterruptedStep(pending);
  } finally {
    setBusy(false);
  }
}

/** Ends the step that the reload or a stopped tab interrupted. */
async function finishInterruptedStep(pending: string): Promise<void> {
  if (pending === 'contextLoss') {
    await finishContextLoss();
  } else if (pending === 'allocate') {
    await waitFor(() => Boolean(getLastGpuMemoryFailure()), 5000);

    const failure = getLastGpuMemoryFailure();

    setResult(
      'allocate',
      failure ? 'pass' : 'fail',
      failure
        ? `the tab stopped; ${failure.kind} at ${formatBytes(failure.failedBytes)} found on reload`
        : 'the tab stopped, and the reload found no failure'
    );

    if (failure) {
      guidePopup(
        'Step 6 done: the tab stopped, and the reload found it. Press "Dismiss", then run step 7.',
        'Dismiss'
      );
    }
  } else if (pending === 'calibrate') {
    await waitFor(() => Boolean(getGpuMemoryHistory().calibration), 5000);
    checkCalibration(undefined);
  }
}

const STEP_RUNNERS: Record<StepId, () => void> = {
  device: () => runStep('device', stepDevice),
  load: () => runStep('load', stepLoad),
  limit: () => runStep('limit', stepLimit),
  contextLoss: stepContextLoss,
  tabs: () => runStep('tabs', stepTabs),
  allocate: () => runStep('allocate', stepAllocate),
  calibrate: () => runStep('calibrate', stepCalibrate),
};

function buildSteps(): void {
  const fresh = make('button', undefined, 'Fresh start');
  const report = make('button', 'gmt-primary', 'Copy report');
  const output = make('textarea', 'gmt-report');

  fresh.title = 'Clears the device record and the results, then reloads';
  fresh.onclick = () => {
    Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith('cornerstone3D') || key.startsWith('gpuMemoryTest')
      )
      .forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    window.location.href = window.location.pathname;
  };
  toolbar.append(fresh, report, progress);

  STEPS.forEach((step, index) => {
    const row = make('li', 'gmt-step');
    const button = make('button', 'gmt-run');
    const title = make('span', 'gmt-title', step.title);
    const badge = make('span', 'gmt-badge');
    const result = make('div', 'gmt-result');

    if ('risky' in step) {
      title.appendChild(make('span', 'gmt-tag', 'fails the GPU'));
    }

    button.append(make('span', 'gmt-num', String(index + 1)), title, badge);
    button.onclick = STEP_RUNNERS[step.id];
    const hint = make('div', 'gmt-hint', step.hint);

    row.append(button, hint, result);
    stepsList.appendChild(row);
    buttons.set(step.id, button);
    stepViews.set(step.id, { row, badge, hint, result });
  });
  showResults();

  output.hidden = true;
  output.readOnly = true;
  left.appendChild(output);
  report.onclick = async () => {
    const text = JSON.stringify(
      {
        page: window.location.href,
        at: new Date().toISOString(),
        device: deviceFacts(),
        results: readResults(),
        gpuMemory: gpuMemoryReport(),
      },
      null,
      2
    );

    output.value = text;
    output.hidden = false;
    output.select();

    try {
      await navigator.clipboard.writeText(text);
      report.textContent = 'Copied';
    } catch {
      report.textContent = 'Copy the text below';
    }

    setTimeout(() => {
      report.textContent = 'Copy report';
    }, 3000);
  };
}

/**
 * Runs the demo
 */
async function run() {
  await initDemo({
    core: { rendering: { lossyDownsampling: { final: true } } },
  });

  const applied = applyGpuMemoryUrlParameters();

  /** A reset applies once: a later reload must not clear the record again. */
  const url = new URL(window.location.href);

  if (url.searchParams.has('gpuReset')) {
    url.searchParams.delete('gpuReset');
    window.history.replaceState(null, '', url.toString());
  }

  if (isSecondTab) {
    root.textContent =
      'Second tab of step 5: it reports the WebGL wait to the first tab, and closes by itself.';
    runAsSecondTab();

    return;
  }

  log = addGpuMemoryLog(logBox);
  applied.forEach((text) => log(text));
  attachGpuMemoryFailurePopup(log);
  failInterruptedSteps();
  buildSteps();

  renderingEngine = new RenderingEngine(renderingEngineId);
  renderingEngine.setViewports(
    viewports.map(({ id, orientation }, index) => ({
      viewportId: id,
      type:
        id === viewport3DId
          ? ViewportType.VOLUME_3D
          : ViewportType.ORTHOGRAPHIC,
      element: elements[index],
      defaultOptions: {
        orientation,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    }))
  );

  window.addEventListener('resize', () => renderingEngine?.resize(true, true));
  imageIds = await createImageIdsAndCacheMetaData(ctSeries);

  updateLivePanels();
  setInterval(updateLivePanels, 1000);

  await finishPendingStep();
}

run();
