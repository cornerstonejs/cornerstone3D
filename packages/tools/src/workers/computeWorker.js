import { expose } from 'comlink';
import VolumetricCalculator from '../utilities/segmentation/VolumetricCalculator';

const computeWorker = {
  calculateSegmentsStatistics: (args) => {
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
      throw new Error('Dimensions do not match');
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
};

expose(computeWorker);
