import type { Types } from '@cornerstonejs/core';
import {
  cache,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
  Enums,
} from '@cornerstonejs/core';

import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';

const { WorkerTypes } = cornerstoneTools.Enums;
const { computeVolumeLabelmapFromStack } =
  cornerstoneTools.utilities.segmentation;

const workerManager = getWebWorkerManager();

/**
 * Triggers worker progress event with error handling
 * @param eventTarget - The event target to trigger on
 * @param progress - Progress percentage (0-100)
 * @param id - The segment index identifier
 */
const triggerWorkerProgress = (eventTarget, progress: number, id: number) => {
  try {
    triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
      progress,
      type: WorkerTypes.POLYSEG_LABELMAP_TO_SURFACE,
      id,
    });
  } catch (error) {
    console.warn('Failed to trigger worker progress event:', error);
  }
};

/**
 * Converts a labelmap representation to a surface representation.
 *
 * @param labelmapRepresentationData - The labelmap segmentation data.
 * @param segmentIndex - The index of the segment to convert.
 * @returns A promise that resolves to the surface data.
 */
export async function convertLabelmapToSurface(
  labelmapRepresentationData: ToolsTypes.LabelmapSegmentationData,
  segmentIndex: number
): Promise<Types.SurfaceData> {
  try {
    // Input validation
    if (!labelmapRepresentationData) {
      throw new Error('Labelmap representation data is required');
    }

    if (typeof segmentIndex !== 'number' || segmentIndex < 0) {
      throw new Error('Valid segment index (>= 0) is required');
    }

    let volumeId: string;

    // Try to get volumeId from volume data first
    const volumeData =
      labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataVolume;
    const volumeIds = volumeData.volumeIds || [];

    if (volumeIds.length > 0) {
      volumeId = volumeIds[0];

      // Validate that the volume exists in cache
      if (!cache.getVolume(volumeId)) {
        throw new Error(`Volume not found in cache: ${volumeId}`);
      }
    } else {
      // Fallback to stack data
      const stackData =
        labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataStack;

      if (!stackData.imageIds || stackData.imageIds.length === 0) {
        throw new Error('No imageIds found in labelmap data');
      }

      try {
        const { volumeIds: computedVolumeIds } =
          await computeVolumeLabelmapFromStack({
            imageIds: stackData.imageIds,
          });

        if (!computedVolumeIds || computedVolumeIds.length === 0) {
          throw new Error('Failed to compute volume from stack');
        }

        volumeId = computedVolumeIds[0];
      } catch (error) {
        throw new Error(
          `Failed to compute volume labelmap from stack: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (!volumeId) {
      throw new Error('Unable to obtain volumeId from labelmap data');
    }

    // Get volume and validate
    const volume = cache.getVolume(volumeId);
    if (!volume) {
      throw new Error(`Volume not found in cache: ${volumeId}`);
    }

    // Validate volume properties
    if (!volume.voxelManager) {
      throw new Error('Volume does not have a voxel manager');
    }

    const scalarData = volume.voxelManager.getCompleteScalarDataArray();
    if (!scalarData) {
      throw new Error('Failed to get scalar data from volume');
    }

    const { dimensions, spacing, origin, direction } = volume;

    // Validate volume metadata
    if (!dimensions || !spacing || !origin || !direction) {
      throw new Error(
        'Volume is missing required metadata (dimensions, spacing, origin, or direction)'
      );
    }

    triggerWorkerProgress(eventTarget, 0, segmentIndex);

    // Execute worker task with validation
    const results = await workerManager.executeTask(
      'polySeg',
      'convertLabelmapToSurface',
      {
        scalarData,
        dimensions,
        spacing,
        origin,
        direction,
        segmentIndex,
      },
      {
        callbacks: [
          (progress) => {
            triggerWorkerProgress(eventTarget, progress, segmentIndex);
          },
        ],
      }
    );

    if (!results) {
      throw new Error(
        'Worker failed to process labelmap to surface conversion'
      );
    }

    triggerWorkerProgress(eventTarget, 100, segmentIndex);

    return results;
  } catch (error) {
    console.error(
      `Failed to convert labelmap to surface for segment ${segmentIndex}:`,
      error
    );
    throw error;
  }
}
