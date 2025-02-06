import { cache, utilities as csUtils, volumeLoader } from '@cornerstonejs/core';
import type { LabelmapSegmentationDataStack } from '../../../../types/LabelmapTypes';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Types } from '@cornerstonejs/core';

export default {
  [StrategyCallbacks.HandleStackSegmentationFor3DManipulation]: (
    operationData: InitializedOperationData & {
      representationData: LabelmapSegmentationDataStack;
      imageId: string;
      voxelManager?: Types.IVoxelManager<number>;
      imageData?: vtkImageData;
    }
  ) => {
    const { viewport, segmentationId, overrides } = operationData;

    const referencedImageIds = viewport.getImageIds();
    const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const volumeId = `${segmentationId}_${viewport.id}`;
    let segVolume = cache.getVolume(volumeId);
    if (segVolume) {
      overrides.segmentationVoxelManager = segVolume.voxelManager;
      overrides.segmentationImageData = segVolume.imageData;
      overrides.abbasGholi = 'abbas';
      return;
    }

    const { representationData } = getSegmentation(segmentationId);

    // We don't need to call `getStackSegmentationImageIdsForViewport` here
    // because we've already ensured the stack constructs a volume,
    // making the scenario for multi-image non-consistent metadata is not likely.
    const { imageIds: labelmapImageIds } =
      representationData.Labelmap as LabelmapSegmentationDataStack;

    if (!labelmapImageIds || labelmapImageIds.length === 1) {
      return;
    }

    // it will return the cached volume if it already exists
    segVolume = volumeLoader.createAndCacheVolumeFromImagesSync(
      volumeId,
      labelmapImageIds
    );

    overrides.segmentationVoxelManager = segVolume.voxelManager;
    overrides.segmentationImageData = segVolume.imageData;
    overrides.abbasGholi = 'abbas';
    return;
  },
};
