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
  addGpuMemoryStatusLine,
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

const STEPS = [
  { id: 'device', title: '1. Check the device and the start limit' },
  { id: 'load', title: '2. Load the CT' },
  { id: 'limit', title: '3. Lower the limit, then reset it' },
  { id: 'contextLoss', title: '4. Lose the context during a load' },
  { id: 'tabs', title: '5. Share a wait for WebGL with a second tab' },
  { id: 'allocate', title: '6. Allocate until a real GPU failure' },
  { id: 'calibrate', title: '7. Run a calibration' },
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

/** The page: a panel of steps beside the four viewports. */
setTitleAndDescription(
  'GPU Memory Test',
  'Checks the automatic GPU memory limit and the handling of a GPU failure, one step at a time. Run the steps in order, then press "Copy report". Steps 6 and 7 make the GPU fail on purpose.'
);

const content = document.getElementById('content');
const layout = document.createElement('div');

Object.assign(layout.style, {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'flex-start',
});
content.appendChild(layout);

const panel = document.createElement('div');

Object.assign(panel.style, {
  flex: '1 1 380px',
  maxWidth: '560px',
  fontFamily: 'sans-serif',
  fontSize: '14px',
});
layout.appendChild(panel);

const grid = document.createElement('div');

Object.assign(grid.style, {
  flex: '1 1 400px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(160px, 300px))',
  gap: '4px',
});
layout.appendChild(grid);

const elements = viewports.map(() => {
  const element = document.createElement('div');

  Object.assign(element.style, { width: '100%', aspectRatio: '1 / 1' });
  element.oncontextmenu = (event) => event.preventDefault();
  grid.appendChild(element);

  return element;
});

/** A section of the panel, with a title. */
function section(title: string): HTMLElement {
  const box = document.createElement('div');
  const heading = document.createElement('div');

  heading.textContent = title;
  Object.assign(heading.style, { fontWeight: 'bold', margin: '8px 0 4px' });
  box.appendChild(heading);
  panel.appendChild(box);

  return box;
}

const deviceBox = section('Device');
const deviceText = document.createElement('pre');

Object.assign(deviceText.style, {
  margin: '0',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
});
deviceBox.appendChild(deviceText);

const numbersBox = section('GPU memory now');
const numbersText = document.createElement('pre');

Object.assign(numbersText.style, {
  margin: '0',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
});
numbersBox.appendChild(numbersText);

const stepsBox = section('Steps');
const logBox = section('Status and log');

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
  const gl = document.createElement('canvas').getContext('webgl2');

  return {
    userAgent: navigator.userAgent,
    renderer: capabilities.renderer,
    rendererClass: status.rendererClass,
    webgl: capabilities.webgl,
    norm16: Boolean(gl?.getExtension('EXT_texture_norm16')),
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

  deviceText.textContent = [
    `Renderer: ${device.renderer || 'none'} (${device.rendererClass})`,
    `16-bit textures (norm16): ${device.norm16 ? 'yes' : 'no'}`,
    `Limit: ${device.limit}, start of the device ${device.start}`,
    `Probe: version ${device.probeVersion ?? 'none'}, edge ${device.edge ? `${device.edge.value}${device.edge.assumed ? ' (assumed)' : ''}` : 'none'}`,
    `WebGL: ${device.webgl ? (device.webglBlocked ? 'waits after a failure' : 'available') : 'none'}`,
  ].join('\n');

  const { sets, heldBytes } = ctSets();
  const ledgerBytes = getGpuMemoryByKind().texture;
  const matches =
    sets.length === 0 || Math.abs(heldBytes - ledgerBytes) <= 0.01 * heldBytes;

  numbersText.textContent = [
    `Texture store: ${formatBytes(heldBytes)} | GPU memory count: ${formatBytes(ledgerBytes)}${matches ? '' : '   <- MISMATCH'}`,
    `Page total: ${formatBytes(getGpuMemoryStatus().pageBytes)}`,
    `Sets: ${sets.map(({ name, references }) => `${name} (${references})`).join(', ') || 'none'}`,
    ...viewportStates().map(
      ({ id, dimensions, cause }) =>
        `${id}: ${dimensions ? dimensions.join(' x ') : 'nothing'} ${dimensions ? `(${cause})` : ''}`
    ),
  ].join('\n');
  numbersText.style.color = matches ? '' : '#b00020';
}

/** The steps. */

const statusViews = new Map<StepId, HTMLElement>();
const buttons = new Map<StepId, HTMLButtonElement>();

const BADGE: Record<Status, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  info: 'NOTE',
  running: 'RUNNING',
};

const BADGE_COLOR: Record<Status, string> = {
  pass: '#1b7f3b',
  fail: '#b00020',
  info: '#8a6d00',
  running: '#555',
};

function showResult(id: StepId): void {
  const result = readResults()[id];
  const view = statusViews.get(id);

  if (!view) {
    return;
  }

  view.textContent = result
    ? `${BADGE[result.status]}: ${result.details}`
    : 'Not run yet';
  view.style.color = result ? BADGE_COLOR[result.status] : '#777';
}

function setResult(id: StepId, status: Status, details: string): void {
  const results = readResults();

  results[id] = { status, details, at: Date.now() };
  sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  showResult(id);
  log(`Step ${id}: ${BADGE[status]} ${details}`);
}

/** Runs a step, and turns an unexpected error into its failure. */
async function runStep(id: StepId, run: () => Promise<void>): Promise<void> {
  const button = buttons.get(id);

  button.disabled = true;
  setResult(id, 'running', 'running');

  try {
    await run();
  } catch (error) {
    setResult(id, 'fail', `error: ${(error as Error).message}`);
  } finally {
    button.disabled = false;
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

  /** A large upload settles 5 s after its first draw. */
  await waitFor(() => pendingRecords() === 0, 15_000);
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
      `sets ${sets.map(({ name, references }) => `${name} (${references})`).join(', ')}, one set held by 4 viewports expected`
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
      : `256 MB: ${formatBytes(reducedBytes)}, reset: ${formatBytes(before.bytes)}, redrawn with no click`
  );
}

/**
 * Step 4 reloads with a fresh record, then loses the context of the first
 * large 3D texture as it uploads (see `armContextLoss`).
 */
function stepContextLoss(): void {
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
  setResult('contextLoss', 'running', 'losing the context during the load');

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
        ? 'no failure reported: the page was hidden, and a hidden page counts no loss'
        : 'no failure reported within 60 s'
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
    `${failures.length} failure(s): ${failure.kind} at ${formatBytes(failure.failedBytes)}, suggested ${formatBytes(failure.suggestedBytes)}, reload ${failure.mustReload ? 'required' : 'not required'}. The popup offers the suggestion; "Reload" brings the viewer back. On a dev server, close the error overlay of the known vtk.js error after a loss (cornerstonejs/cornerstone3D#3174).`
  );
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
      : `pop-ups are blocked: open ${url.toString()} in a new tab of this browser`
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
      : 'the second tab saw the wait start and end. This tab follows the wait it wrote for up to 20 s.'
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
      'WebGL waits after a failure: run the step again when it ends'
    );

    return;
  }

  const start = Date.now();

  sessionStorage.setItem(PENDING_KEY, 'allocate');
  await allocateUntilFailure({
    renderingEngine,
    viewportId: viewport3DId,
    sourceVolumeId: volumeId,
    log,
  });
  sessionStorage.removeItem(PENDING_KEY);

  const failure = getLastGpuMemoryFailure();

  if (failure && failure.at >= start) {
    setResult(
      'allocate',
      'pass',
      `${failure.kind} at ${formatBytes(failure.failedBytes)}, suggested ${formatBytes(failure.suggestedBytes)}; WebGL ${isWebGLBlocked() ? `waits (${getGpuMemoryStatus().webglBlockReason})` : 'is available'}`
    );
  } else {
    setResult(
      'allocate',
      'info',
      'no failure was reported: the run was cancelled, reached 32 GB, or stopped early (see the log)'
    );
  }
}

async function stepCalibrate(): Promise<void> {
  if (!canRunGpuMemoryCalibration()) {
    setResult(
      'calibrate',
      'info',
      'a calibration runs only after a GPU failure, and while WebGL does not wait: run step 6 first, or wait'
    );

    return;
  }

  if (
    !window.confirm(
      'The calibration allocates GPU memory until the GPU fails. The browser then blocks WebGL for this site for about two minutes, in every tab. Run it?'
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
    `worked up to ${formatBytes(result.largestSuccessBytes)}, failed at ${formatBytes(result.failedBytes)}; the limit ${unchanged ? 'is unchanged' : 'changed, which it must not'}`
  );
}

/** A step that the reload or a stopped tab interrupted ends here. */
async function finishPendingStep(): Promise<void> {
  const pending = sessionStorage.getItem(PENDING_KEY);

  sessionStorage.removeItem(PENDING_KEY);

  if (pending === 'contextLoss') {
    await finishContextLoss();
  } else if (pending === 'allocate') {
    await waitFor(() => Boolean(getLastGpuMemoryFailure()), 5000);

    const failure = getLastGpuMemoryFailure();

    setResult(
      'allocate',
      failure ? 'pass' : 'fail',
      failure
        ? `the tab stopped; the next start found a ${failure.kind} at ${formatBytes(failure.failedBytes)}`
        : 'the tab stopped, and the next start found no failure'
    );
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
  const fresh = document.createElement('button');

  fresh.textContent = 'Fresh start (clears the record and the results)';
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
  stepsBox.appendChild(fresh);

  STEPS.forEach(({ id, title }) => {
    const row = document.createElement('div');
    const button = document.createElement('button');
    const status = document.createElement('div');

    Object.assign(row.style, { margin: '6px 0' });
    button.textContent = title;
    button.onclick = STEP_RUNNERS[id];
    Object.assign(status.style, { fontSize: '12px', marginLeft: '4px' });
    row.append(button, status);
    stepsBox.appendChild(row);
    buttons.set(id, button);
    statusViews.set(id, status);
    showResult(id);
  });

  const report = document.createElement('button');
  const output = document.createElement('textarea');

  report.textContent = 'Copy report';
  Object.assign(output.style, {
    display: 'none',
    width: '100%',
    height: '10em',
    fontSize: '11px',
  });
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
    output.style.display = 'block';
    output.select();

    try {
      await navigator.clipboard.writeText(text);
      report.textContent = 'Copied. Copy report again';
    } catch {
      report.textContent = 'Select the text below and copy it';
    }
  };
  stepsBox.append(report, output);
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
    panel.textContent =
      'This is the second tab of step 5. It reports the wait for WebGL to the first tab, and closes by itself.';
    grid.remove();
    runAsSecondTab();

    return;
  }

  addGpuMemoryStatusLine(logBox);
  log = addGpuMemoryLog(logBox);
  applied.forEach((text) => log(text));
  attachGpuMemoryFailurePopup(log);
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

  imageIds = await createImageIdsAndCacheMetaData(ctSeries);

  updateLivePanels();
  setInterval(updateLivePanels, 1000);

  await finishPendingStep();
}

run();
