import type { GpuMemoryStatus } from '../types/GpuMemory';
import { getGpuMemoryLimit, startMemoryBytes } from './gpuSettingsPresets';
import { getGpuMemoryTotal } from './gpuMemoryLedger';
import { getRendererClass } from './renderingCapabilities';
import { getWebGLBlock } from './webglAvailability';
import { canRunGpuMemoryCalibration } from './gpuMemoryCalibration';
import { getGpuMemoryHistory } from './gpuMemoryHistory';

/**
 * The GPU memory of `auto` now, for a memory dialog or a status line: the
 * limit and its source, the start of the device, the bytes that the page
 * holds, and whether WebGL waits.
 *
 * With GPU settings that do not apply (a software renderer, CPU rendering or
 * no WebGL), `applies` is false and the limit fields are absent.
 */
function getGpuMemoryStatus(): GpuMemoryStatus {
  const limit = getGpuMemoryLimit();
  const block = getWebGLBlock();
  /** A failure at 128 MB or below means that no GPU size works. */
  const noGpuSizeWorks = getGpuMemoryHistory().buckets[0].failures > 0;

  return {
    applies: limit !== undefined,
    ...(limit && { limitBytes: limit.bytes, source: limit.source }),
    hard: limit?.hard ?? false,
    ...(limit && { startBytes: startMemoryBytes() }),
    rendererClass: getRendererClass(),
    pageBytes: getGpuMemoryTotal(),
    noGpuSizeWorks,
    cpuRecommended: noGpuSizeWorks,
    canCalibrate: canRunGpuMemoryCalibration(),
    webglBlocked: block !== undefined,
    ...(block && {
      webglBlockedUntil: block.until,
      webglBlockReason: block.reason,
    }),
  };
}

export { getGpuMemoryStatus };
