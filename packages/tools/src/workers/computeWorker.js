import { expose } from 'comlink';
import { utilities } from '@cornerstonejs/core';
import VolumetricCalculator from '../utilities/segmentation/VolumetricCalculator';

const { VoxelManager } = utilities;

const computeWorker = {
  calculateSegmentsStatisticsVolume: (args) => {
    const { segmentationInfo, imageInfo, indices } = args;

    const {
      scalarData: segmentationScalarData,
      dimensions: segmentationDimensions,
      spacing: segmentationSpacing,
    } = segmentationInfo;
    const { scalarData: imageScalarData, dimensions: imageDimensions } =
      imageInfo;

    // if dimensions are not the same, for now just throw an error
    if (
      segmentationDimensions[0] !== imageDimensions[0] ||
      segmentationDimensions[1] !== imageDimensions[1] ||
      segmentationDimensions[2] !== imageDimensions[2]
    ) {
      throw new Error(
        'Dimensions do not match to calculate statistics, different dimensions not supported yet'
      );
    }

    // Create VoxelManagers for both segmentation and image data
    const segVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: segmentationDimensions,
      scalarData: segmentationScalarData,
    });

    const imageVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: imageDimensions,
      scalarData: imageScalarData,
    });

    // Use forEach to iterate over all voxels and call statsCallback for those in the segmentation
    segVoxelManager.forEach(
      ({ value, pointIJK, index }) => {
        if (indices.indexOf(value) === -1) {
          return;
        }

        // get the value from the image voxel manager
        const imageValue = imageVoxelManager.getAtIndex(index);

        // Todo: later add the isInObject check based on lps for the different dimensions
        // for now just assume the pointIJK is within the bounds
        VolumetricCalculator.statsCallback({
          value: imageValue,
          pointIJK,
        });
      },
      {
        boundsIJK: imageVoxelManager.getDefaultBounds(),
      }
    );

    const stats = VolumetricCalculator.getStatistics({
      spacing: segmentationSpacing,
      unit: 'mm',
    });

    return stats;
  },

  calculateSegmentsStatisticsStack: (args) => {
    const { segmentationInfo, imageInfo, indices } = args;

    // Create voxel managers for each pair of segmentation and image info
    for (let i = 0; i < segmentationInfo.length; i++) {
      const segInfo = segmentationInfo[i];
      const imgInfo = imageInfo[i];

      const segDimensions = [
        segInfo.dimensions[0],
        segInfo.dimensions[1],
        1, // For a single slice
      ];

      const segVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: segDimensions,
        scalarData: segInfo.scalarData,
      });

      const imageVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: segDimensions,
        scalarData: imgInfo.scalarData,
      });

      // Use forEach to iterate and call statsCallback
      segVoxelManager.forEach(
        ({ value, pointIJK, index }) => {
          // Todo: later add the isInObject check based on lps for the different dimensions
          // for now just assume the pointIJK is within the bounds

          if (indices.indexOf(value) === -1) {
            return;
          }

          // get the value from the image voxel manager
          const imageValue = imageVoxelManager.getAtIndex(index);

          VolumetricCalculator.statsCallback({
            value: imageValue,
          });
        },
        {
          boundsIJK: imageVoxelManager.getDefaultBounds(),
        }
      );
    }

    // Pick first one for spacing
    const spacing = segmentationInfo[0].spacing;

    const stats = VolumetricCalculator.getStatistics({
      spacing,
    });

    return stats;
  },
};

expose(computeWorker);
