import isWithinThreshold from './isWithinThreshold';
import type { InitializedOperationData } from '../BrushStrategy';

const initializeThreshold = (initializerData: InitializedOperationData) => {
  initializerData.isWithinThreshold = (data) =>
    isWithinThreshold(
      data,
      initializerData.imageVoxelValue,
      initializerData.strategySpecificConfiguration
    );
};

export default initializeThreshold;
