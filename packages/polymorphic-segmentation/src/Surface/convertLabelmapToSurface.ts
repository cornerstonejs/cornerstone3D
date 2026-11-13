import type { Types } from '@cornerstonejs/core';
import {
  cache,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
  Enums,
  utilities,
} from '@cornerstonejs/core';

import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';

import {
  cropLabelmapToBlock,
  findSegmentBounds,
  getSegmentBlock,
} from './cropLabelmapToSegment';
import type { LabelmapFrame } from './cropLabelmapToSegment';

const { WorkerTypes } = cornerstoneTools.Enums;
const { computeVolumeLabelmapFromStack } =
  cornerstoneTools.utilities.segmentation;

const cs3dLogger = utilities.logger.polySegLog.getLogger(
  'Surface.convertLabelmapToSurface'
);

const workerManager = getWebWorkerManager();

const MIB = 1024 * 1024;
/** The worker copies each voxel into a 32-bit buffer. */
const WORKER_BYTES_PER_VOXEL = 4;
/**
 * The largest block, in MiB of the 32-bit copy in the worker, that goes to the
 * worker. It starts at the 2 GiB heap of the worker, and it drops to the size
 * of each block that fails, so a block of that size or more is not tried again.
 */
let maxBlockMiB = 2048;

const EMPTY_SURFACE = { points: [], polys: [] } as Types.SurfaceData;

const triggerWorkerProgress = (
  progress: number,
  id: number,
  error?: string
) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_LABELMAP_TO_SURFACE,
    id,
    error,
  });
};

/**
 * Reports a segment that has no surface. The event has progress 100, so a
 * viewer closes its progress notification, and `error` gives the reason.
 */
const reportFailure = (segmentIndex: number, error: string) => {
  cs3dLogger.warn(error);
  triggerWorkerProgress(100, segmentIndex, error);
};

async function getLabelmapVolume(
  labelmapRepresentationData: ToolsTypes.LabelmapSegmentationData
): Promise<Types.IImageVolume> {
  let { volumeId } =
    labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataVolume;

  if (!volumeId) {
    const { imageIds } =
      labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataStack;
    ({ volumeId } = await computeVolumeLabelmapFromStack({ imageIds }));
  }

  return cache.getVolume(volumeId);
}

/**
 * Gives the frames of a labelmap volume: the runs of an RLE image, the array of
 * a volume that holds one, or `getSliceData` otherwise.
 */
function getLabelmapFrames(
  volume: Types.IImageVolume
): (k: number) => LabelmapFrame {
  const { dimensions, imageIds, voxelManager } = volume;
  const [width, height, depth] = dimensions;
  const frameSize = width * height;
  // A volume that holds its own array gives frames without a copy.
  const scalarData = voxelManager.getWritableScalarData?.();
  // A dynamic volume lists the images of every group, so frame k is not imageIds[k].
  const frameImageIds = imageIds?.length === depth ? imageIds : undefined;

  return (k: number): LabelmapFrame => {
    if (scalarData) {
      return { data: scalarData.subarray(k * frameSize, (k + 1) * frameSize) };
    }
    const map =
      frameImageIds && cache.getImage(frameImageIds[k])?.voxelManager?.map;
    if (
      map instanceof utilities.RLEVoxelMap &&
      map.width === width &&
      map.height === height &&
      !map.defaultValue
    ) {
      return { map: map as utilities.RLEVoxelMap<number> };
    }
    return {
      data: voxelManager.getSliceData({ sliceIndex: k, slicePlane: 2 }),
    };
  };
}

/**
 * Converts segments of a labelmap to surfaces.
 *
 * One scan of the labelmap finds the bounds of all the segments. Then each
 * segment, one after another, sends only its block (see `getSegmentBlock`) to
 * the worker.
 *
 * A segment gets an empty surface, and the worker is not started for it, when:
 * - the segment has no voxels (no progress event),
 * - its block is at least the block limit (`maxBlockMiB`), or
 * - the worker fails for it. The limit then drops to the size of its block.
 *
 * For the last two, a WEB_WORKER_PROGRESS event with progress 100 and an
 * `error` message reports the failure.
 *
 * @param labelmapRepresentationData - The labelmap segmentation data.
 * @param segmentIndices - The indices of the segments to convert.
 * @returns The surface of each segment, in the order of `segmentIndices`.
 */
export async function convertLabelmapToSurfaces(
  labelmapRepresentationData: ToolsTypes.LabelmapSegmentationData,
  segmentIndices: number[]
): Promise<Types.SurfaceData[]> {
  const volume = await getLabelmapVolume(labelmapRepresentationData);
  const { dimensions, spacing, direction, voxelManager } = volume;
  const getFrame = getLabelmapFrames(volume);
  const boundsBySegment = await findSegmentBounds(
    dimensions,
    getFrame,
    segmentIndices
  );

  const surfaces = [];
  for (const segmentIndex of segmentIndices) {
    const bounds = boundsBySegment.get(segmentIndex);
    // The scans yield, so the volume can be destroyed (imageData null) meanwhile.
    if (!bounds || !volume.imageData) {
      surfaces.push(EMPTY_SURFACE);
      continue;
    }

    const block = getSegmentBlock(bounds, dimensions);
    const [blockWidth, blockHeight, blockDepth] = block.dimensions;
    const blockMiB =
      (blockWidth * blockHeight * blockDepth * WORKER_BYTES_PER_VOXEL) / MIB;
    if (blockMiB >= maxBlockMiB) {
      reportFailure(
        segmentIndex,
        `Segment ${segmentIndex} is too large for a 3D surface (${Math.ceil(blockMiB)} MiB, limit ${Math.ceil(maxBlockMiB)} MiB).`
      );
      surfaces.push(EMPTY_SURFACE);
      continue;
    }

    const scalarData = await cropLabelmapToBlock(
      dimensions,
      getFrame,
      voxelManager.getConstructor(),
      block
    );
    if (!volume.imageData) {
      surfaces.push(EMPTY_SURFACE);
      continue;
    }

    triggerWorkerProgress(0, segmentIndex);
    try {
      surfaces.push(
        await workerManager.executeTask(
          'polySeg',
          'convertLabelmapToSurface',
          {
            scalarData,
            dimensions: block.dimensions,
            spacing,
            origin: volume.imageData.indexToWorld(block.start),
            direction,
            segmentIndex,
          },
          {
            callbacks: [
              (progress) => triggerWorkerProgress(progress, segmentIndex),
            ],
          }
        )
      );
      triggerWorkerProgress(100, segmentIndex);
    } catch (error) {
      maxBlockMiB = Math.min(maxBlockMiB, blockMiB);
      reportFailure(
        segmentIndex,
        `The 3D surface of segment ${segmentIndex} failed (${Math.ceil(blockMiB)} MiB). Segments of this size or more are not converted now.`
      );
      surfaces.push(EMPTY_SURFACE);
    }
  }

  return surfaces;
}
