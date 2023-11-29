import type { InitializedOperationData } from '../BrushStrategy';

/**
 * Sets up tracking for use by preview and other services.
 * This sets up a  TRACKING value in the strategy specific configuration which
 * stores the original value for updated pixels, and allows the changes to be
 * applied (eg for a preview), reverted, or acted on in other ways.
 */
export default function initializeTracking(
  operationData: InitializedOperationData
) {
  const { initDown } = operationData;
  operationData.initDown = () => {
    operationData.strategySpecificConfiguration.TRACKING = null;
    initDown?.();
  };

  // It always generates preview data, so use that for tracking
  operationData.strategySpecificConfiguration.TRACKING ||=
    operationData.previewVoxelValue;
  // And use the preview data associated with this tracking object as needed
  operationData.previewVoxelValue =
    operationData.strategySpecificConfiguration.TRACKING;
}
