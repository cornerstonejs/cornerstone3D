import type { GpuMemoryStatus } from '../types/GpuMemory';
import { getGpuMemoryLimit, startMemoryBytes } from './gpuSettingsPresets';
import { getGpuMemoryTotal } from './gpuMemoryLedger';
import {
  GPU_MEMORY_MIN_BYTES,
  getRendererClass,
} from './renderingCapabilities';
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
  /**
   * A failure at 128 MB or below, or a calibration that failed at its first
   * step at or below 128 MB, means that no GPU size works.
   */
  const history = getGpuMemoryHistory();
  const { calibration } = history;
  const noGpuSizeWorks =
    history.buckets[0].failures > 0 ||
    (calibration?.largestSuccessBytes === 0 &&
      calibration.failedBytes <= GPU_MEMORY_MIN_BYTES);

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
