import { cache, utilities } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

const { VoxelManager, HistoryMemo } = utilities;

const { DefaultHistoryMemo } = HistoryMemo;

// TODO - get this from a preview supplied to the create
const previewSegmentIndex = 255;

export default function createLabelmapMemo(
  _element,
  activeSegmentationRepresentation,
  data
) {
  console.log('Hello labelmap memo', activeSegmentationRepresentation, data);

  const state = createLabelmapMemoState(
    activeSegmentationRepresentation,
    getVoxelsSegmentation(data)
  );

  // Get the voxel manager for the segmentation representation
  // Create an RLE copy of the segmentation rep
  // On restore
  //  1. Take another RLE copy of the segmentation rep
  //  2. Set copy the RLE data to the destination data
  //  3. Fire segmentation modified events on the updated slices

  const labelmapMemo = {
    restoreMemo: () => {
      const voxels = getVoxelsSegmentation(data);
      const currentState = createLabelmapMemoState(
        activeSegmentationRepresentation,
        voxels
      );
      const { segmentationVoxelManager } = voxels;
      segmentationVoxelManager.clear(true);
      state.voxels.forEach(({ value, pointIJK }) => {
        if (!value) {
          return;
        }
        segmentationVoxelManager.setAtIJKPoint(pointIJK, value);
      });
      Object.assign(state, currentState);
      const slices = segmentationVoxelManager.getArrayOfSlices();
      if (!slices.length) {
        const sliceCount = segmentationVoxelManager.dimensions[2];
        for (let slice = 0; slice < sliceCount; slice++) {
          slices.push(slice);
        }
      }
      triggerSegmentationDataModified(state.segmentationId, slices);
    },
  };
  DefaultHistoryMemo.push(labelmapMemo);
  return labelmapMemo;
}

/**
 * Gets the segmentation voxel manager from the segmentation representation data
 */
function getVoxelsSegmentation(data) {
  let segmentationVoxelManager;
  let segmentationScalarData;
  let segmentationDimensions;

  const { volumeId } = data;
  if (volumeId) {
    const segmentationVolume = cache.getVolume(volumeId);
    if (!segmentationVolume) {
      return;
    }
    segmentationScalarData = segmentationVolume.getScalarData();
    segmentationDimensions = segmentationVolume.dimensions;

    segmentationVoxelManager = segmentationVolume.voxelManager;
  } else {
    console.warn('TODO - implement stack segmentation data');
  }

  segmentationVoxelManager ||= VoxelManager.createVolumeVoxelManager(
    segmentationDimensions,
    segmentationDimensions
  );

  return { segmentationVoxelManager, segmentationScalarData };
}

/**
 * Creates a memo state for the labelmap data.
 * This state uses an RLE copy of the underlying data, and is basically just
 * the the segmentation id/representation uid with the voxels value.
 */
function createLabelmapMemoState(
  activeSegmentationRepresentation,
  segmentationVoxels
) {
  if (!segmentationVoxels || !segmentationVoxels.segmentationVoxelManager) {
    return;
  }
  const { segmentationVoxelManager } = segmentationVoxels;
  const copiedVoxels = VoxelManager.createRLEVoxelManager(
    segmentationVoxelManager.dimensions
  );
  let setCount = 0;
  const { dimensions } = segmentationVoxelManager;
  const boundsIJK = [
    [0, dimensions[0] - 1],
    [0, dimensions[1] - 1],
    [0, dimensions[2] - 1],
  ];
  segmentationVoxelManager.forEach(
    ({ value, pointIJK }) => {
      // TODO - check for previewSegmentIndex original value in history, and set
      // that instead - to handle erase preview
      if (!value || value === previewSegmentIndex) {
        return;
      }
      setCount++;
      copiedVoxels.setAtIJKPoint(pointIJK, value);
    },
    { boundsIJK }
  );
  console.log(
    'rle voxel manager created with',
    setCount,
    'from',
    segmentationVoxelManager
  );

  return {
    ...activeSegmentationRepresentation,
    voxels: copiedVoxels,
  };
}
