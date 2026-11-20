import { vec3 } from 'gl-matrix';
import {
  utilities,
  type Types,
  type PlanarViewport,
} from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getViewportICamera from '../../../../utilities/getViewportICamera';

/**
 * The centres of a whole stroke filled in one call, in IJK: the stroke of a
 * lazy edit (`shouldUseLazyLabelmapEditing`), which holds the mouse down point
 * and every drag point. An eager stroke fills one segment of two points per
 * call and gives none.
 */
function getWholeStrokeCentersIJK(
  operationData: InitializedOperationData
): Types.Point3[] {
  const { strokePointsWorld, segmentationImageData } = operationData;

  if (!strokePointsWorld || strokePointsWorld.length <= 2) {
    return [];
  }

  return strokePointsWorld.map((point) =>
    utilities.transformWorldToIndex(segmentationImageData, point)
  );
}

/** The grey value of a voxel: its value, or the length of a colour. */
function getGray(value: number | Types.RGB): number {
  return Array.isArray(value) ? vec3.len(value) : value;
}

/**
 * Initializes the threshold values for the dynamic threshold.
 * If the threshold is undefined/null, the threshold will be set
 * by looking at the area centered on the centerIJK, with a delta radius,
 * and taking the range of those pixel values.
 * If the threshold is already set, then the range will be extended by just the
 * center voxel at centerIJK.
 *
 * A whole stroke filled in one call (a lazy edit, as on a CPU viewport) takes
 * the range that the strokes filled one segment per call reach at their end:
 * the area around its first drag point, the first centre of an eager stroke,
 * extended by the centre voxel of every later point. So one stroke fills on
 * the CPU what it fills on the GPU.
 */
export default {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      operationName,
      segmentationVoxelManager,
      imageVoxelManager,
      configuration,
      segmentIndex,
      viewport,
    } = operationData;
    const strokeCentersIJK = getWholeStrokeCentersIJK(operationData);
    const centerIJK = strokeCentersIJK[1] ?? operationData.centerIJK;

    if (!configuration?.threshold?.isDynamic || !centerIJK || !segmentIndex) {
      return;
    }
    if (
      operationName === StrategyCallbacks.RejectPreview ||
      operationName === StrategyCallbacks.OnInteractionEnd
    ) {
      return;
    }

    const boundsIJK = segmentationVoxelManager.getBoundsIJK();
    const { range: oldThreshold, dynamicRadius = 0 } = configuration.threshold;
    const useDelta = oldThreshold ? 0 : dynamicRadius;
    const { viewPlaneNormal } = getViewportICamera(viewport);

    if (!viewPlaneNormal) {
      return;
    }

    const nestedBounds = boundsIJK.map((ijk, idx) => {
      const [min, max] = ijk;
      return [
        Math.max(min, centerIJK[idx] - useDelta),
        Math.min(max, centerIJK[idx] + useDelta),
      ];
    }) as BoundsIJK;
    // Squash the bounds to the plane in view when it is orthogonal, or close
    // to orthogonal to one of the bounding planes.
    // Otherwise just use the full area for now.
    if (Math.abs(viewPlaneNormal[0]) > 0.8) {
      nestedBounds[0] = [centerIJK[0], centerIJK[0]];
    } else if (Math.abs(viewPlaneNormal[1]) > 0.8) {
      nestedBounds[1] = [centerIJK[1], centerIJK[1]];
    } else if (Math.abs(viewPlaneNormal[2]) > 0.8) {
      nestedBounds[2] = [centerIJK[2], centerIJK[2]];
    }

    const threshold = oldThreshold || [Infinity, -Infinity];
    // TODO - threshold on all three values separately
    const useDeltaSqr = useDelta * useDelta;
    const callback = ({ value, pointIJK }) => {
      const distance = vec3.sqrDist(centerIJK, pointIJK);
      if (distance > useDeltaSqr) {
        return;
      }
      // @ts-ignore
      const gray = Array.isArray(value) ? vec3.len(value) : value;
      threshold[0] = Math.min(gray, threshold[0]);
      threshold[1] = Math.max(gray, threshold[1]);
    };
    imageVoxelManager.forEach(callback, { boundsIJK: nestedBounds });

    strokeCentersIJK.slice(2).forEach((strokeCenterIJK) => {
      if (
        strokeCenterIJK.some(
          (value, axis) =>
            value < boundsIJK[axis][0] || value > boundsIJK[axis][1]
        )
      ) {
        return;
      }

      const gray = getGray(imageVoxelManager.getAtIJKPoint(strokeCenterIJK));
      threshold[0] = Math.min(gray, threshold[0]);
      threshold[1] = Math.max(gray, threshold[1]);
    });

    configuration.threshold.range = threshold;
  },
  // Setup a clear threshold value on mouse/touch down
  [StrategyCallbacks.OnInteractionStart]: (
    operationData: InitializedOperationData
  ) => {
    const { configuration } = operationData;

    if (!configuration?.threshold?.isDynamic) {
      return;
    }

    configuration.threshold.range = null;
  },
  /**
   * It computes the inner circle radius in canvas coordinates and stores it
   * This is used to show the user the area that is used to compute the threshold.
   */
  [StrategyCallbacks.ComputeInnerCircleRadius]: (
    operationData: InitializedOperationData
  ) => {
    const { configuration, viewport } = operationData;

    const thresholdConfig = configuration?.threshold;

    if (!thresholdConfig) {
      return;
    }

    const { dynamicRadius = 0, isDynamic } = thresholdConfig;

    if (!isDynamic) {
      thresholdConfig.dynamicRadiusInCanvas = 0;
      return;
    }

    if (dynamicRadius === 0) {
      return;
    }

    const imageData = (viewport as PlanarViewport).getImageData();

    if (!imageData) {
      return;
    }

    const { spacing } = imageData;
    const centerCanvas = [
      viewport.element.clientWidth / 2,
      viewport.element.clientHeight / 2,
    ] as Types.Point2;
    const radiusInWorld = dynamicRadius * spacing[0];
    const centerCursorInWorld = viewport.canvasToWorld(centerCanvas);

    const offSetCenterInWorld = centerCursorInWorld.map(
      (coord) => coord + radiusInWorld
    ) as Types.Point3;

    const offSetCenterCanvas = viewport.worldToCanvas(offSetCenterInWorld);
    const dynamicRadiusInCanvas = Math.abs(
      centerCanvas[0] - offSetCenterCanvas[0]
    );

    if (!thresholdConfig.dynamicRadiusInCanvas) {
      thresholdConfig.dynamicRadiusInCanvas = 0;
    }

    // Add a couple of pixels to the radius to make it more obvious what is
    // included.
    thresholdConfig.dynamicRadiusInCanvas = 3 + dynamicRadiusInCanvas;
  },
};
