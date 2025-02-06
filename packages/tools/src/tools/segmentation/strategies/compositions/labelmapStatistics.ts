import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';
import VolumetricCalculator from '../../../../utilities/segmentation/VolumetricCalculator';
import { getActiveSegmentIndex } from '../../../../stateManagement/segmentation/getActiveSegmentIndex';
import { getStrategyData } from '../utils/getStrategyData';
import { utilities, type Types } from '@cornerstonejs/core';
import { getPixelValueUnits } from '../../../../utilities/getPixelValueUnits';
import { AnnotationTool } from '../../../base';
import { isViewportPreScaled } from '../../../../utilities/viewport/isViewportPreScaled';

// Radius for a volume of 10, eg 1 cm^3 = 1000 mm^3
const radiusForVol1 = Math.pow((3 * 1000) / (4 * Math.PI), 1 / 3);

/**
 * Compute basic labelmap segmentation statistics.
 */
export default {
  [StrategyCallbacks.GetStatistics]: function (
    enabledElement,
    operationData: InitializedOperationData,
    options?: { indices?: number | number[] }
  ) {
    const { viewport } = enabledElement;
    let { indices } = options;
    const { segmentationId } = operationData;
    if (!indices) {
      indices = [getActiveSegmentIndex(segmentationId)];
    } else if (!Array.isArray(indices)) {
      // Include the preview index
      indices = [indices, 255];
    }
    const indicesArr = indices as number[];

    const {
      segmentationVoxelManager,
      imageVoxelManager,
      segmentationImageData,
    } = getStrategyData({
      operationData,
      viewport,
      strategy: this,
    });

    const spacing = segmentationImageData.getSpacing();

    const { boundsIJK: boundsOrig } = segmentationVoxelManager;
    if (!boundsOrig) {
      return VolumetricCalculator.getStatistics({ spacing });
    }

    segmentationVoxelManager.forEach((voxel) => {
      const { value, pointIJK } = voxel;
      if (indicesArr.indexOf(value) === -1) {
        return;
      }
      const imageValue = imageVoxelManager.getAtIJKPoint(pointIJK);
      VolumetricCalculator.statsCallback({ value: imageValue, pointIJK });
    });
    const targetId = viewport.getViewReferenceId();
    const modalityUnitOptions = {
      isPreScaled: isViewportPreScaled(viewport, targetId),
      isSuvScaled: AnnotationTool.isSuvScaled(
        viewport,
        targetId,
        viewport.getCurrentImageId()
      ),
    };

    const imageData = (viewport as Types.IVolumeViewport).getImageData();
    const unit = getPixelValueUnits(
      imageData.metadata.Modality,
      viewport.getCurrentImageId(),
      modalityUnitOptions
    );

    const stats = VolumetricCalculator.getStatistics({ spacing, unit });
    const { maxIJKs } = stats;
    if (!maxIJKs?.length) {
      return stats;
    }

    // The calculation isn't very good at setting units
    stats.mean.unit = unit;
    stats.max.unit = unit;
    stats.min.unit = unit;

    if (unit !== 'SUV') {
      return stats;
    }

    // Get the IJK rounded radius, not using less than 1, and using the
    // radius for the spacing given the desired mm spacing of 10
    // Add 10% to the radius to account for whole pixel in/out issues
    const radiusIJK = spacing.map((s) =>
      Math.max(1, Math.round((1.1 * radiusForVol1) / s))
    );
    for (const testMax of maxIJKs) {
      const testStats = getSphereStats(
        testMax,
        radiusIJK,
        segmentationImageData,
        imageVoxelManager,
        spacing
      );
      if (!testStats) {
        continue;
      }
      const { mean } = testStats;
      // @ts-expect-error - TODO: fix this
      if (!stats.peakValue || stats.peakValue.value <= mean.value) {
        // @ts-expect-error - TODO: fix this
        stats.peakValue = {
          name: 'peakValue',
          label: 'Peak Value',
          value: mean.value,
          unit,
        };
      }
    }

    return stats;
  },
};

/**
 * Gets the statistics for a 1 cm^3 sphere centered on radiusIJK.
 * Assumes the segmentation and pixel data are co-incident.
 */
function getSphereStats(testMax, radiusIJK, segData, imageVoxels, spacing) {
  const { pointIJK: centerIJK } = testMax;
  const boundsIJK = centerIJK.map((ijk, idx) => [
    ijk - radiusIJK[idx],
    ijk + radiusIJK[idx],
  ]);
  const testFunction = (_pointLPS, pointIJK) => {
    const i = (pointIJK[0] - centerIJK[0]) / radiusIJK[0];
    const j = (pointIJK[1] - centerIJK[1]) / radiusIJK[1];
    const k = (pointIJK[2] - centerIJK[2]) / radiusIJK[2];
    const radius = i * i + j * j + k * k;
    return radius <= 1;
  };
  const statsFunction = ({ pointIJK, pointLPS }) => {
    const value = imageVoxels.getAtIJKPoint(pointIJK);
    if (value === undefined) {
      return;
    }
    VolumetricCalculator.statsCallback({ value, pointLPS, pointIJK });
  };
  VolumetricCalculator.statsInit({ storePointData: false });
  // pointInShapeCallback(segData, testFunction, statsFunction, boundsIJK);

  utilities.pointInShapeCallback(segData, {
    pointInShapeFn: testFunction,
    callback: statsFunction,
    boundsIJK,
  });

  return VolumetricCalculator.getStatistics({ spacing });
}
