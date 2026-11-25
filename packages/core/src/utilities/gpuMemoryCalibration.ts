import type {
  GpuMemoryCalibration,
  RunGpuMemoryCalibrationOptions,
} from '../types/GpuMemory';
import { isWebGLBlocked } from './webglAvailability';
import { getGpuMemoryHistory } from './gpuMemoryHistory';

/**
 * True when a calibration run may start: the record holds a GPU memory
 * failure that happened during an allocation, and WebGL is available.
 *
 * A calibration run allocates until the GPU fails, so the browser blocks
 * WebGL for about two minutes afterwards. The application warns the user of
 * that before it starts a run.
 */
function canRunGpuMemoryCalibration(): boolean {
  return Boolean(getGpuMemoryHistory().lastFailure) && !isWebGLBlocked();
}

/**
 * Allocates GPU memory in growing steps until the GPU fails, and records the
 * largest size that worked. It runs in a WebGL context of its own, outside
 * the viewports. The result is offered to the user; it does not change the
 * memory limit.
 *
 * It rejects when `canRunGpuMemoryCalibration()` is false. This version
 * records no failure yet, so it always rejects.
 *
 * @param _options.startBytes - the size of the first step
 * @param _options.stepBytes - the growth of each step
 * @returns the result, when the page survives the run
 */
function runGpuMemoryCalibration(
  _options: RunGpuMemoryCalibrationOptions = {}
): Promise<GpuMemoryCalibration> {
  return Promise.reject(
    new Error(
      'runGpuMemoryCalibration: no GPU memory failure is recorded, or WebGL is blocked'
    )
  );
}

export { canRunGpuMemoryCalibration, runGpuMemoryCalibration };
