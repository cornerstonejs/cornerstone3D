import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  cache,
  eventTarget,
  volumeLoader,
  getConfiguration,
  setConfiguration,
  getLossyDownsampling,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  getGpuMemoryLimit,
  getGpuMemoryByKind,
  getGpuMemoryStatus,
  getGpuMemoryHistory,
  suggestGpuMemoryLimit,
  getLastGpuMemoryFailure,
  acknowledgeGpuMemoryFailure,
  canRunGpuMemoryCalibration,
  runGpuMemoryCalibration,
  isWebGLBlocked,
  GPU_MEMORY_BUCKETS_GB,
} from '@cornerstonejs/core';

/**
 * The GPU memory controls of this example. They model what an application
 * such as OHIF shows: a status line, a log of the GPU memory events, a popup
 * after a failure, and a button that allocates until the GPU fails, which is
 * the end-to-end test of a real failure.
 */

const { Events } = Enums;

const MEGABYTE = 1024 ** 2;
const GIGABYTE = 1024 ** 3;

/** A size for a person: `341 MB`, `1.5 GB`. */
function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return 'none';
  }

  return bytes >= GIGABYTE
    ? `${Number((bytes / GIGABYTE).toFixed(2))} GB`
    : `${Math.round(bytes / MEGABYTE)} MB`;
}

/** A count for a person: `1 time`, `3 times`. */
function times(count: number): string {
  return `${count} ${count === 1 ? 'time' : 'times'}`;
}

/** A count of volumes for a person: `1 volume`, `4 volumes`. */
function volumesText(count: number): string {
  return `${count} ${count === 1 ? 'volume' : 'volumes'}`;
}

/** A size for the `gpuMemory` URL parameter, in whole megabytes. */
function sizeParameter(bytes: number): string {
  return `${Math.floor(bytes / MEGABYTE)}MB`;
}

/** Reloads the page with these URL parameters set, and the others kept. */
function reloadWith(parameters: Record<string, string>): void {
  const url = new URL(window.location.href);

  Object.entries(parameters).forEach(([name, value]) =>
    url.searchParams.set(name, value)
  );
  window.location.href = url.toString();
}

/**
 * What the "View GPU probe" panel shows: the probed capabilities, the record
 * of the device, the memory status, and the history with its suggestion.
 */
export function gpuMemoryReport() {
  const history = getGpuMemoryHistory();
  const usedBuckets = history.buckets.filter(
    ({ successes, failures }) => successes || failures
  );

  return {
    capabilities: getRenderingCapabilities(),
    memoryLimit: getGpuMemoryLimit() ?? 'none',
    memoryStatus: getGpuMemoryStatus(),
    memoryByKind: getGpuMemoryByKind(),
    memoryHistory: {
      ...history,
      buckets: usedBuckets.length ? usedBuckets : 'no load recorded yet',
    },
    suggestedLimit: formatBytes(suggestGpuMemoryLimit()),
    record: getStoredRenderingCapabilities(),
  };
}

/**
 * A log of the GPU memory events, newest line first.
 *
 * @returns the function that adds a line
 */
export function addGpuMemoryLog(
  container: HTMLElement
): (text: string) => void {
  const output = document.createElement('pre');

  Object.assign(output.style, {
    clear: 'both',
    maxWidth: '60em',
    maxHeight: '8em',
    overflow: 'auto',
    margin: '0.25em 0',
    padding: '0.25em 0.5em',
    background: '#f5f5f5',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
  });
  output.textContent = 'GPU memory log';
  container.appendChild(output);

  const log = (text: string) => {
    const time = new Date().toLocaleTimeString();

    output.textContent = `${time} ${text}\n${output.textContent}`;
  };

  eventTarget.addEventListener(Events.GPU_MEMORY_LIMIT_CHANGED, (event) => {
    const { previous, current } = (
      event as CustomEvent<Types.EventTypes.GpuMemoryLimitChangedEventDetail>
    ).detail;

    log(
      `Limit ${formatBytes(previous?.bytes)} (${previous?.source ?? 'none'}) -> ${formatBytes(current?.bytes)} (${current?.source ?? 'none'})`
    );
  });
  eventTarget.addEventListener(Events.WEBGL_AVAILABILITY_CHANGED, (event) => {
    const { blocked, until, reason, sourceTab } = (
      event as CustomEvent<Types.EventTypes.WebGLAvailabilityChangedEventDetail>
    ).detail;

    log(
      blocked
        ? `WebGL blocked (${reason}, ${sourceTab} tab) until ${until ? new Date(until).toLocaleTimeString() : 'unknown'}`
        : `WebGL available again (${sourceTab} tab)`
    );
  });
  eventTarget.addEventListener(Events.GPU_MEMORY_CALIBRATED, (event) => {
    const { largestSuccessBytes } = (
      event as CustomEvent<Types.EventTypes.GpuMemoryCalibratedEventDetail>
    ).detail;

    log(
      `Calibration: the largest size that worked is ${formatBytes(largestSuccessBytes)}`
    );
  });

  return log;
}

/**
 * A line that states the memory limit, the GPU bytes of the page and whether
 * WebGL waits. It updates each second and on every GPU memory event.
 */
export function addGpuMemoryStatusLine(container: HTMLElement): void {
  const line = document.createElement('div');

  Object.assign(line.style, {
    clear: 'both',
    padding: '0.25em 0',
    fontFamily: 'monospace',
    fontSize: '12px',
  });
  container.appendChild(line);

  const update = () => {
    const status = getGpuMemoryStatus();
    const parts = status.applies
      ? [
          `GPU memory limit ${formatBytes(status.limitBytes)} (${status.source}${status.hard ? ', hard' : ''})`,
          `page ${formatBytes(status.pageBytes)}`,
          `start of the device ${formatBytes(status.startBytes)}`,
        ]
      : [
          `No GPU memory limit applies (renderer class ${status.rendererClass})`,
        ];

    if (!getLossyDownsampling().final) {
      parts.push('final downsampling is off, so no volume is reduced');
    }

    parts.push(
      status.webglBlocked
        ? `WebGL blocked (${status.webglBlockReason}) until ${status.webglBlockedUntil ? new Date(status.webglBlockedUntil).toLocaleTimeString() : 'unknown'}`
        : 'WebGL available'
    );

    line.textContent = parts.join(' | ');
  };

  update();
  setInterval(update, 1000);

  [
    Events.GPU_MEMORY_LIMIT_CHANGED,
    Events.GPU_MEMORY_FAILURE,
    Events.WEBGL_AVAILABILITY_CHANGED,
    Events.GPU_MEMORY_CALIBRATED,
  ].forEach((type) => eventTarget.addEventListener(type, update));
}

/** What a failure of each kind means, in one sentence. */
const FAILURE_TEXT: Record<Types.GpuMemoryFailureKind, string> = {
  contextLost: 'The GPU lost the WebGL context during a large allocation.',
  crash:
    'The tab stopped during a large allocation. This start found the record that it left.',
  outOfMemory: 'The GPU reported out of memory during a large allocation.',
};

/**
 * The popup after a GPU memory failure, as OHIF shows it. It opens on
 * `GPU_MEMORY_FAILURE`, and at the start of the page when a failure waits
 * (`getLastGpuMemoryFailure`), for example a crash that the start found.
 *
 * It offers the suggested limit and one step lower, CPU rendering when no GPU
 * size works, and the calibration run when it may start. While WebGL is
 * blocked it counts down, and when the failed page must reload, it reloads
 * once the block ends. A page that did not fail shows a note while another
 * tab blocks WebGL.
 */
export function attachGpuMemoryFailurePopup(log: (text: string) => void): void {
  const modal = document.createElement('div');

  Object.assign(modal.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.45)',
    zIndex: '1000',
  });

  const panel = document.createElement('div');

  Object.assign(panel.style, {
    width: '420px',
    padding: '16px',
    borderRadius: '6px',
    background: '#fff',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.3)',
    fontFamily: 'sans-serif',
    fontSize: '14px',
  });

  const title = document.createElement('div');

  title.textContent = 'GPU memory failure';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';

  const message = document.createElement('div');

  message.style.whiteSpace = 'pre-line';
  message.style.marginBottom = '8px';

  const countdown = document.createElement('div');

  countdown.style.marginBottom = '12px';
  countdown.style.fontWeight = '600';

  const actions = document.createElement('div');

  Object.assign(actions.style, {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: '8px',
  });

  panel.append(title, message, countdown, actions);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  /** The note of a page that did not fail, while another tab blocks WebGL. */
  const note = document.createElement('div');

  Object.assign(note.style, {
    position: 'fixed',
    right: '8px',
    bottom: '8px',
    display: 'none',
    padding: '8px 12px',
    background: '#fff3cd',
    border: '1px solid #e0c060',
    borderRadius: '4px',
    fontFamily: 'sans-serif',
    fontSize: '13px',
    zIndex: '999',
  });
  document.body.appendChild(note);

  let shown: Types.EventTypes.GpuMemoryFailureEventDetail | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const button = (text: string, onClick: () => void) => {
    const element = document.createElement('button');

    element.textContent = text;
    element.onclick = onClick;
    actions.appendChild(element);
  };

  const hide = () => {
    modal.style.display = 'none';
    shown = undefined;
    clearInterval(timer);
  };

  const updateCountdown = () => {
    const until = getGpuMemoryStatus().webglBlockedUntil;

    if (!isWebGLBlocked()) {
      countdown.textContent = shown?.mustReload
        ? 'WebGL is available. This page must reload to draw again.'
        : '';

      return;
    }

    const seconds = until
      ? Math.max(0, Math.ceil((until - Date.now()) / 1000))
      : undefined;

    countdown.textContent =
      seconds === undefined
        ? 'The browser blocks WebGL for this site for a while.'
        : `The browser blocks WebGL for this site for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`;
  };

  const show = (detail: Types.EventTypes.GpuMemoryFailureEventDetail) => {
    shown = detail;

    const lines = [
      FAILURE_TEXT[detail.kind],
      `GPU memory of the page at the failure: ${formatBytes(detail.failedBytes)}. The limit in force: ${formatBytes(detail.limitBytes)} (${detail.limitSource}).`,
      `At this size or above: worked ${times(detail.successesAtOrAboveFailed)}, failed ${times(detail.failuresAtOrAboveFailed)}.`,
    ];

    if (detail.largestSuccessBytes !== undefined) {
      lines.push(
        `The largest size that worked: ${formatBytes(detail.largestSuccessBytes)}, ${times(detail.largestSuccessCount ?? 0)}.`
      );
    }

    lines.push(
      detail.oneOff
        ? 'This size worked several times before, so the suggestion keeps the limit.'
        : `Suggested limit: ${formatBytes(detail.suggestedBytes)}.`
    );
    message.textContent = lines.join('\n');

    actions.replaceChildren();

    button(`Reload with ${formatBytes(detail.suggestedBytes)}`, () =>
      reloadWith({ gpuMemory: sizeParameter(detail.suggestedBytes) })
    );

    const lower = [...GPU_MEMORY_BUCKETS_GB]
      .reverse()
      .map((gb) => gb * GIGABYTE)
      .find((bytes) => bytes < detail.suggestedBytes);

    if (lower !== undefined) {
      button(`Reload with ${formatBytes(lower)}`, () =>
        reloadWith({ gpuMemory: sizeParameter(lower) })
      );
    }

    if (detail.noGpuSizeWorks) {
      button('Reload with CPU rendering', () => reloadWith({ cpu: 'true' }));
    }

    /** Read now, not from the detail: a wait can have ended since. */
    if (canRunGpuMemoryCalibration()) {
      button('Run calibration', () => {
        if (
          !window.confirm(
            'The calibration allocates GPU memory until the GPU fails. The browser then blocks WebGL for this site for about two minutes, in every tab. Run it?'
          )
        ) {
          return;
        }

        hide();
        runGpuMemoryCalibration()
          .then((result) =>
            log(
              `Calibration: ${formatBytes(result.largestSuccessBytes)} worked`
            )
          )
          .catch((error) => log(`Calibration: ${error.message}`));
      });
    }

    /**
     * A page that lost its context must reload to draw again. When no wait
     * starts (outside Chromium, a first failure), this is the way back.
     */
    if (detail.mustReload) {
      button('Reload', () => window.location.reload());
    }

    button('Dismiss', () => {
      acknowledgeGpuMemoryFailure();
      hide();
    });

    updateCountdown();
    clearInterval(timer);
    timer = setInterval(updateCountdown, 1000);
    modal.style.display = 'flex';
  };

  eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, (event) => {
    const { detail } =
      event as CustomEvent<Types.EventTypes.GpuMemoryFailureEventDetail>;

    log(
      `Failure (${detail.kind}) at ${formatBytes(detail.failedBytes)}, suggested ${formatBytes(detail.suggestedBytes)}`
    );
    show(detail);
  });

  eventTarget.addEventListener(Events.WEBGL_AVAILABILITY_CHANGED, (event) => {
    const { blocked, until, sourceTab } = (
      event as CustomEvent<Types.EventTypes.WebGLAvailabilityChangedEventDetail>
    ).detail;

    if (blocked && sourceTab === 'other' && !shown) {
      note.textContent = `Another tab of this site had a GPU failure. Large loads wait until ${until ? new Date(until).toLocaleTimeString() : 'WebGL is available'}.`;
      note.style.display = 'block';
    }

    if (!blocked) {
      note.style.display = 'none';

      if (shown?.mustReload) {
        log('WebGL is available again, so the failed page reloads');
        window.location.reload();
      } else if (shown) {
        /** The offers change when the wait ends, for example the calibration. */
        show(shown);
      }
    }
  });

  /** A failure that fired before this page listened, such as a crash. */
  const waiting = getLastGpuMemoryFailure();

  if (waiting) {
    log(
      `Failure (${waiting.kind}) at ${formatBytes(waiting.failedBytes)}, found before the page listened, suggested ${formatBytes(waiting.suggestedBytes)}`
    );
    show(waiting);
  }
}

/** The frames of one volume of "Allocate until failure". */
const STRESS_CHUNK_FRAMES = 256;
/** The run stops here when nothing failed. */
const STRESS_MAX_BYTES = 32 * GIGABYTE;
/**
 * The wait after each step. The allocation tracker counts an allocation as a
 * success 5 s after its first draw, so each step waits a little longer.
 */
const STRESS_STEP_WAIT_MS = 7000;

let stressRunning = false;

/**
 * "Allocate until failure": a real GPU failure, through the normal volume
 * path, for an end-to-end test of the tracker, the record, the event and the
 * popup.
 *
 * Each step doubles the frames that the 3D viewport shows: 256, 512, 1024 and
 * so on, made of the frames of the loaded series, repeated. The frames go in
 * volumes of 256 frames that share one buffer in memory, so the GPU memory
 * doubles at each step and the memory of the page does not. The run stops at
 * the first failure (a lost context or an out of memory), when WebGL waits,
 * when a step allocates no texture, on a hidden page, or at 32 GB. It does
 * not start while WebGL waits.
 *
 * For the run, a hard limit of 64 GB applies to this page only (a
 * configuration value, not a stored limit), so the strategy reduces nothing.
 * Reload the page to undo it and to free the memory.
 */
export async function allocateUntilFailure({
  renderingEngine,
  viewportId,
  sourceVolumeId,
  log,
}: {
  renderingEngine: Types.IRenderingEngine;
  viewportId: string;
  sourceVolumeId: string;
  log: (text: string) => void;
}): Promise<void> {
  if (stressRunning) {
    log('Allocate until failure: already running');

    return;
  }

  if (isWebGLBlocked()) {
    log(
      'Allocate until failure: WebGL waits after a GPU failure, so the run waits for the end of the wait'
    );

    return;
  }

  if (!getLossyDownsampling().final || !getGpuMemoryStatus().applies) {
    log(
      'Allocate until failure: the GPU settings do not apply (final downsampling off, CPU rendering or a software renderer), so no failure is recorded'
    );

    return;
  }

  if (
    !window.confirm(
      'This allocates GPU memory until the GPU fails, up to 32 GB. The tab or the browser can stop, and the browser can block WebGL for this site for about two minutes. Run it?'
    )
  ) {
    return;
  }

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IVolumeViewport;

  stressRunning = true;

  const rendering = getConfiguration().rendering;

  setConfiguration({
    ...getConfiguration(),
    rendering: {
      ...rendering,
      autoGpuSettings: {
        ...rendering?.autoGpuSettings,
        hardMemoryBytes: 2 * STRESS_MAX_BYTES,
      },
    },
  });
  cache.setMaxCacheSize(
    Math.max(cache.getMaxCacheSize(), 4 * STRESS_MAX_BYTES)
  );
  log(
    'Allocate until failure: a hard limit of 64 GB applies to this page until a reload'
  );

  let contextLost = false;
  let memoryFailed = false;
  const onContextLost = () => {
    contextLost = true;
  };
  /** An out of memory keeps the context (Firefox, Safari), and stops the run too. */
  const onMemoryFailure = () => {
    memoryFailed = true;
  };
  const stopped = () => contextLost || memoryFailed || isWebGLBlocked();
  let previousTexture = 0;

  eventTarget.addEventListener(Events.WEBGL_CONTEXT_LOST, onContextLost);
  eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, onMemoryFailure);

  try {
    const chunk = stressChunk(sourceVolumeId);
    const volumeIds: string[] = [];

    for (let step = 0; ; step++) {
      const target = 2 ** step;
      const added: string[] = [];

      while (volumeIds.length < target) {
        const volumeId = `gpuMemoryStress:${volumeIds.length}`;

        volumeLoader.createLocalVolume(
          volumeId,
          chunk.optionsAt(volumeIds.length, volumeId)
        );
        volumeIds.push(volumeId);
        added.push(volumeId);
      }

      /** `addVolumes` hides a volume unless its input states the visibility. */
      const inputs = added.map((volumeId) => ({ volumeId, visibility: true }));

      if (step === 0) {
        await viewport.setVolumes(inputs);
      } else {
        await viewport.addVolumes(inputs);
      }

      added.forEach((volumeId) =>
        viewport.setProperties({ preset: 'CT-Bone' }, volumeId)
      );
      viewport.resetCamera();
      viewport.render();

      const start = Date.now();

      while (Date.now() - start < STRESS_STEP_WAIT_MS && !stopped()) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const { texture } = getGpuMemoryByKind();
      const frames = target * STRESS_CHUNK_FRAMES;

      if (contextLost) {
        log(
          `Step ${step + 1}: ${frames} frames in ${volumesText(target)}, textures ${formatBytes(texture)}: the WebGL context was lost`
        );
        break;
      }

      if (memoryFailed) {
        log(
          `Step ${step + 1}: ${frames} frames in ${volumesText(target)}, textures ${formatBytes(texture)}: a GPU memory failure, so the run stops`
        );
        break;
      }

      /** Another tab can start a wait at any time; large uploads stop then. */
      if (isWebGLBlocked()) {
        log(`Step ${step + 1}: WebGL waits, so the run stops`);
        break;
      }

      /** A step that allocated no texture would add volumes for nothing. */
      if (texture <= previousTexture) {
        log(`Step ${step + 1}: no new texture was allocated, so the run stops`);
        break;
      }

      previousTexture = texture;

      if (document.hidden) {
        log(`Step ${step + 1}: the page is hidden, so the run stops`);
        break;
      }

      log(
        `Step ${step + 1}: ${frames} frames in ${volumesText(target)}, textures ${formatBytes(texture)}, page ${formatBytes(getGpuMemoryStatus().pageBytes)}: drew`
      );

      if (texture * 2 > STRESS_MAX_BYTES) {
        log('Allocate until failure: 32 GB reached with no failure');
        break;
      }
    }
  } catch (error) {
    log(`Allocate until failure: ${(error as Error).message}`);
  } finally {
    eventTarget.removeEventListener(Events.WEBGL_CONTEXT_LOST, onContextLost);
    eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, onMemoryFailure);
    stressRunning = false;
  }
}

/**
 * The buffer that every volume of the run shares: 256 frames of the loaded
 * series, repeated, as 16-bit values. With no series loaded, a pattern of
 * 512 x 512 fills it.
 */
function stressChunk(sourceVolumeId: string) {
  const source = cache.getVolume(sourceVolumeId);
  const [columns, rows, sourceFrames] = source?.dimensions ?? [512, 512, 0];
  const frameLength = columns * rows;
  const data = new Int16Array(frameLength * STRESS_CHUNK_FRAMES);
  const sourceData = source?.voxelManager?.getCompleteScalarDataArray?.() as
    | ArrayLike<number>
    | undefined;

  for (let frame = 0; frame < STRESS_CHUNK_FRAMES; frame++) {
    const offset = frame * frameLength;

    if (sourceData && sourceFrames) {
      const sourceOffset = (frame % sourceFrames) * frameLength;

      for (let index = 0; index < frameLength; index++) {
        data[offset + index] = sourceData[sourceOffset + index];
      }
    } else {
      for (let index = 0; index < frameLength; index++) {
        data[offset + index] =
          (index % columns ^ Math.floor(index / columns)) & 1023;
      }
    }
  }

  const spacing = (source?.spacing ?? [1, 1, 1]) as Types.Point3;
  const origin = (source?.origin ?? [0, 0, 0]) as Types.Point3;
  const direction = (source?.direction ?? [
    1, 0, 0, 0, 1, 0, 0, 0, 1,
  ]) as Types.Mat3;
  const metadata = (source?.metadata ?? {
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    SamplesPerPixel: 1,
    PixelRepresentation: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    Modality: 'CT',
    voiLut: [],
  }) as Types.Metadata;

  return {
    /**
     * The options of the volume at this index, placed after the one before.
     * The volume references its own images, which are in the cache, so the
     * default window reads them there and asks no image loader, which a local
     * volume does not have.
     */
    optionsAt: (index: number, volumeId: string) => {
      const shift = index * STRESS_CHUNK_FRAMES * spacing[2];

      return {
        referencedImageIds: Array.from(
          { length: STRESS_CHUNK_FRAMES },
          (_, frame) => `${volumeId}_slice_${frame}`
        ),
        metadata,
        dimensions: [columns, rows, STRESS_CHUNK_FRAMES] as Types.Point3,
        spacing,
        origin: [
          origin[0] + direction[6] * shift,
          origin[1] + direction[7] * shift,
          origin[2] + direction[8] * shift,
        ] as Types.Point3,
        direction,
        scalarData: data,
      };
    },
  };
}
