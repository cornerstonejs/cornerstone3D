// eslint-
import { cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import shaderCode from './growCutShader';

const GB = 1024 * 1024 * 1024;
const WEBGPU_MEMORY_LIMIT = 1.99 * GB;

const DEFAULT_GROWCUT_OPTIONS = {
  windowSize: 3,
  maxProcessingTime: 30000,
  inspection: {
    numCyclesInterval: 5,
    numCyclesBelowThreshold: 3,
    threshold: 1e-4,
  },
};

/**
 * Grow cut options
 */
type GrowCutOptions = {
  /**
   * Maximum amount of time the grow cut will be running in the GPU. This value
   * also depends on `numCyclesInterval` because N (numCyclesInterval) steps are
   * pushed to the GPU asynchronously and only after getting the response back
   * for running those N steps it would check if the amount of time spent is
   * greater than `maxProcessingTime`.
   *
   * As an example, let say `numCyclesInterval` is set to 30 and `maxProcessingTime`
   * is set to 1 second. If it takes 45ms to run each batch of 30 cycles in the
   * GPU that means it should stop after running 23 batches and that would take
   * 1.035 second which is greater than 1 second.
   */
  maxProcessingTime?: number;
  /**
   * Window used to compare each voxel to all its NxNxN neighbors. Large window
   * size may result in a better segmentation but it would also take more time
   * to compute
   */
  windowSize?: number;
  /**
   * Configuration used to monitor and stop processing the volume before
   * reaching the number of steps expected to segment the volume.
   */

  positiveSeedValue?: number;
  negativeSeedValue?: number;
  positiveSeedVariance?: number;
  negativeSeedVariance?: number;

  inspection?: {
    /**
     * Number of grow cut steps (FOR loop) that shall be run in the GPU before
     * checking its current state. This is useful because if the expected number
     * of cycles is 100 it may get the segmentation done after 27 cycles. That
     * means if `numCyclesInterval` is set to 10 it would stop after 30 cycles
     * (3 batches * 10 cycles) saving 70 cycles.
     *
     * It changes automatically to 1 once it detects that its running below the
     * `threshold` and get back to `numCyclesInterval` if it gets above the
     * `threshold` again.
     *
     * Small values are not good because taking data out of the gpu to compare
     * is very expensive. Higher values may let the algorithm run for a few more
     * cycles even when it is already done.
     *
     * PS: 1 cycle is equal to 1 grow cut iteration (FOR loop running in the GPU)
     */
    numCyclesInterval?: number;
    /**
     * It stops running grow cut once it keeps below the threshold (see `threshold`)
     * for a few cycles (`numCyclesBelowThreshold`).
     */
    numCyclesBelowThreshold?: number;
    /**
     * Threshold used to decide if it should or not stop running grow cut. It
     * stops only after staying N cycles (`numCyclesBelowThreshold`) below this
     * threshold. In some cases the number of voxels updated may decrease
     * but increase again after a few cycles.
     *
     *   threshold = number of voxels updated / total number of voxels
     */
    threshold?: number;
  };
};

/**
 * Run the grow cut algorithm in the gpu (compute shader) and updates the label
 * map passed in as parameter.
 *
 * The volume, labelmap, another local buffer called `strengthBuffer` and the
 * previous state buffers are sent to the gpu that runs grow cut comparing each
 * voxel to all NxNxN neighbors voxels updating the labelmap accordingly.
 *
 * It also checks if the segmentation is complete before the expected number of
 * steps and stop when that happens saving processing time.
 *
 * @param referenceVolumeId - Volume id
 * @param labelmapVolumeId - Label map associated with the given volumeId
 * @param options - Options
 */
async function runGrowCut({
  referenceVolumeId,
  labelmapVolumeId,
  referenceImageId,
  labelmapImageId,
  options = DEFAULT_GROWCUT_OPTIONS,
}: {
  referenceVolumeId?: string;
  labelmapVolumeId?: string;
  referenceImageId?: string;
  labelmapImageId?: string;
  options?: GrowCutOptions;
}) {
  const workGroupSize = [8, 8, 4];
  const { windowSize, maxProcessingTime } = Object.assign(
    {},
    DEFAULT_GROWCUT_OPTIONS,
    options
  );

  const inspection = Object.assign(
    {},
    DEFAULT_GROWCUT_OPTIONS.inspection,
    options.inspection
  );

  let columns: number;
  let rows: number;
  let numSlices: number;
  let reference;
  let labelmap;
  if (referenceVolumeId && labelmapVolumeId) {
    reference = cache.getVolume(referenceVolumeId);
    labelmap = cache.getVolume(labelmapVolumeId);
    [columns, rows, numSlices] = reference.dimensions;

    if (
      labelmap.dimensions[0] !== columns ||
      labelmap.dimensions[1] !== rows ||
      labelmap.dimensions[2] !== numSlices
    ) {
      throw new Error('Volume and labelmap must have the same size');
    }
  } else if (referenceImageId && labelmapImageId) {
    reference = cache.getImage(referenceImageId);
    labelmap = cache.getImage(labelmapImageId);
    columns = reference.width;
    rows = reference.height;

    if (labelmap.width !== columns || labelmap.height !== rows) {
      throw new Error('Volume and labelmap must have the same size');
    }
    numSlices = 1;
  } else {
    throw new Error(
      'Either referenceVolumeId and labelmapVolumeId or referenceImageId and labelmapImageId must be provided'
    );
  }

  const numIterations = Math.floor(
    Math.sqrt(rows ** 2 + columns ** 2 + numSlices ** 2) / 2
  );

  const labelmapData =
    labelmap.voxelManager.getCompleteScalarDataArray() as Types.PixelDataTypedArray;

  let volumePixelData =
    reference.voxelManager.getCompleteScalarDataArray() as Types.PixelDataTypedArray;
  if (!(volumePixelData instanceof Float32Array)) {
    volumePixelData = new Float32Array(volumePixelData);
  }

  const requiredLimits = {
    maxStorageBufferBindingSize: WEBGPU_MEMORY_LIMIT,
    maxBufferSize: WEBGPU_MEMORY_LIMIT,
  };

  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter.requestDevice({ requiredLimits });
  const BUFFER_SIZE = volumePixelData.byteLength;

  // Stores the number of voxels updated per iteration. If it expects to run 100
  // steps to segment the volume it then allocate 100 x 4 bytes and in the end
  // we know how many voxels got updated per iteration.
  const UPDATED_VOXELS_COUNTER_BUFFER_SIZE =
    numIterations * Uint32Array.BYTES_PER_ELEMENT;

  const shaderModule = device.createShaderModule({
    code: shaderCode,
  });

  // `numIteration` index in the `paramsArrayValues` array
  const numIterationIndex = 3;

  const paramsArrayValues = new Uint32Array([
    columns,
    rows,
    numSlices,
    0, // reserved for `numIteration`
  ]);

  const gpuParamsBuffer = device.createBuffer({
    size: paramsArrayValues.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const gpuVolumePixelDataBuffer = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(gpuVolumePixelDataBuffer, 0, volumePixelData);

  const gpuLabelmapBuffers = [0, 1].map(() =>
    device.createBuffer({
      size: BUFFER_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    })
  );

  device.queue.writeBuffer(
    gpuLabelmapBuffers[0],
    0,
    new Uint32Array(labelmapData)
  );

  const gpuStrengthBuffers = [0, 1].map(() => {
    const strengthBuffer = device.createBuffer({
      size: BUFFER_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });

    return strengthBuffer;
  });

  // This buffer stores the number of voxels updated on each iteration making it
  // more performant when calculating the threshold instead of having to move the
  // entire labelmap which may be huge from the gpu to the cpu.
  const gpuCounterBuffer = device.createBuffer({
    size: UPDATED_VOXELS_COUNTER_BUFFER_SIZE,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'uniform',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'storage',
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'storage',
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'storage',
        },
      },
    ],
  });

  const bindGroups = [0, 1].map((i) => {
    const outputLabelmapBuffer = gpuLabelmapBuffers[i];
    const outputStrengthBuffer = gpuStrengthBuffers[i];
    const previouLabelmapBuffer = gpuLabelmapBuffers[(i + 1) % 2];
    const previousStrengthBuffer = gpuStrengthBuffers[(i + 1) % 2];

    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: gpuParamsBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: gpuVolumePixelDataBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: outputLabelmapBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: outputStrengthBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: previouLabelmapBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: previousStrengthBuffer,
          },
        },
        {
          binding: 6,
          resource: {
            buffer: gpuCounterBuffer,
          },
        },
      ],
    });
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: shaderModule,
      entryPoint: 'main',
      constants: {
        workGroupSizeX: workGroupSize[0],
        workGroupSizeY: workGroupSize[1],
        workGroupSizeZ: workGroupSize[2],
        windowSize,
      },
    },
  });

  const numWorkGroups = [
    Math.ceil(columns / workGroupSize[0]),
    Math.ceil(rows / workGroupSize[1]),
    Math.ceil(numSlices / workGroupSize[2]),
  ];

  const gpuUpdatedVoxelsCounterStagingBuffer = device.createBuffer({
    size: UPDATED_VOXELS_COUNTER_BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const labelmapStagingBufferTemp = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const limitProcessingTime = maxProcessingTime
    ? performance.now() + maxProcessingTime
    : 0;
  let currentInspectionNumCyclesInterval = inspection.numCyclesInterval;
  let belowThresholdCounter = 0;

  // Create each iteration step and submit them to the GPU
  for (let i = 0; i < numIterations; i++) {
    paramsArrayValues[numIterationIndex] = i;
    device.queue.writeBuffer(gpuParamsBuffer, 0, paramsArrayValues);

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);

    passEncoder.setBindGroup(0, bindGroups[i % 2]);
    passEncoder.dispatchWorkgroups(
      numWorkGroups[0],
      numWorkGroups[1],
      numWorkGroups[2]
    );

    passEncoder.end();

    // Get the number of updated voxels for the current iteration only
    commandEncoder.copyBufferToBuffer(
      gpuCounterBuffer,
      i * Uint32Array.BYTES_PER_ELEMENT, // Source offset
      gpuUpdatedVoxelsCounterStagingBuffer,
      i * Uint32Array.BYTES_PER_ELEMENT, // Destination offset
      Uint32Array.BYTES_PER_ELEMENT
    );

    device.queue.submit([commandEncoder.finish()]);

    // Read some data out of the gpu on every N steps to see if it is already done
    const inspect = i > 0 && !(i % currentInspectionNumCyclesInterval);

    if (inspect) {
      // map staging buffer to read results back to JS
      await gpuUpdatedVoxelsCounterStagingBuffer.mapAsync(
        GPUMapMode.READ,
        0, // Offset
        UPDATED_VOXELS_COUNTER_BUFFER_SIZE // Length
      );

      const updatedVoxelsCounterResultBuffer =
        gpuUpdatedVoxelsCounterStagingBuffer.getMappedRange(
          0,
          UPDATED_VOXELS_COUNTER_BUFFER_SIZE
        );

      const updatedVoxelsCounterBufferData = new Uint32Array(
        updatedVoxelsCounterResultBuffer.slice(0)
      );

      const updatedVoxelsRatio =
        updatedVoxelsCounterBufferData[i] / volumePixelData.length;

      gpuUpdatedVoxelsCounterStagingBuffer.unmap();

      // Skip i=0 because the labelmap is not updated on the first iteration
      if (i >= 1 && updatedVoxelsRatio < inspection.threshold) {
        // Once if gets below the threshold it needs to check one by one otherwise
        // it may skip the stop point.
        currentInspectionNumCyclesInterval = 1;
        belowThresholdCounter++;

        if (belowThresholdCounter === inspection.numCyclesBelowThreshold) {
          break;
        }
      } else {
        // Reset it back to its original value
        currentInspectionNumCyclesInterval = inspection.numCyclesInterval;
      }
    }

    if (limitProcessingTime && performance.now() > limitProcessingTime) {
      console.warn(`Exceeded processing time limit (${maxProcessingTime})ms`);
      break;
    }
  }

  const commandEncoder = device.createCommandEncoder();
  const outputLabelmapBufferIndex = (numIterations + 1) % 2;
  const labelmapStagingBuffer = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Copy output buffer to staging buffer
  commandEncoder.copyBufferToBuffer(
    gpuLabelmapBuffers[outputLabelmapBufferIndex],
    0, // Source offset
    labelmapStagingBuffer,
    0, // Destination offset
    BUFFER_SIZE
  );

  device.queue.submit([commandEncoder.finish()]);

  // map staging buffer to read results back to JS
  await labelmapStagingBuffer.mapAsync(
    GPUMapMode.READ,
    0, // Offset
    BUFFER_SIZE // Length
  );

  const labelmapResultBuffer = labelmapStagingBuffer.getMappedRange(
    0,
    BUFFER_SIZE
  );

  const labelmapResult = new Uint32Array(labelmapResultBuffer);

  // Copy the resulting buffer (Uint32) returned by the gpu to the `labelmapData` (Uint8)
  labelmapData.set(labelmapResult);

  // Release the gpu staging buffer used to copy the data from the gpu
  labelmapStagingBuffer.unmap();

  // update the voxel manager with the new labelmap data
  labelmap.voxelManager.setCompleteScalarDataArray(labelmapData);
}

export { runGrowCut as default, runGrowCut as run };
export type { GrowCutOptions };
