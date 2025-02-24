import { expose } from 'comlink';
import VolumetricCalculator from '../utilities/segmentation/VolumetricCalculator';

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

    for (let i = 0; i < segmentationScalarData.length; i++) {
      const segmentationValue = segmentationScalarData[i];

      if (indices.indexOf(segmentationValue) === -1) {
        continue;
      }
      const imageValue = imageScalarData[i];

      VolumetricCalculator.statsCallback({
        value: imageValue,
        pointIJK: [
          i % segmentationDimensions[0],
          Math.floor(i / segmentationDimensions[0]) % segmentationDimensions[1],
          Math.floor(i / segmentationDimensions[0] / segmentationDimensions[1]),
        ],
      });
    }

    const stats = VolumetricCalculator.getStatistics({
      spacing: segmentationSpacing,
      unit: 'mm',
    });

    return stats;
  },
  calculateSegmentsStatisticsStack: (args) => {
    const { segmentationInfo, imageInfo, indices } = args;

    // loop over pairs of segmentation and image info and calculate the stats
    for (let i = 0; i < segmentationInfo.length; i++) {
      const segmentationValue = segmentationInfo[i];
      const imageValue = imageInfo[i];

      const segmentationSpacing = segmentationInfo[i].spacing;
      const imageSpacing = imageInfo[i].spacing;

      const segmentationScalarData = segmentationInfo[i].scalarData;
      const imageScalarData = imageInfo[i].scalarData;

      for (let i = 0; i < segmentationScalarData.length; i++) {
        const segmentationValue = segmentationScalarData[i];

        if (indices.indexOf(segmentationValue) === -1) {
          continue;
        }
        const imageValue = imageScalarData[i];

        VolumetricCalculator.statsCallback({
          value: imageValue,
        });
      }
    }

    // pick first one for spacing
    const spacing = segmentationInfo[0].spacing;

    const stats = VolumetricCalculator.getStatistics({
      spacing,
    });

    return stats;
  },
};

expose(computeWorker);
