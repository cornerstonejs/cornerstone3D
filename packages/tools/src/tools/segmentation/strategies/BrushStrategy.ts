import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeRegionFill from './utils/initializeRegionFill';
import initializeThreshold from './utils/initializeThreshold';
import { getStrategyData } from './utils/getStrategyData';

const { VoxelValue } = utilities;

export type OperationData = {
  segmentationId: string;
  imageVolume: Types.IImageVolume;
  points: Types.Point3[];
  volume: Types.IImageVolume;
  /**
   * The final segment value to apply for this colour at the end
   */
  segmentIndex: number;
  /**
   * The colour to apply as an intermediate value
   */
  previewSegmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  // constraintFn: () => boolean;
};

export type InitializedOperationData = OperationData & {
  // Additional data for performing the strategy
  enabledElement: Types.IEnabledElement;
  centerIJK?: Types.Point3;
  centerWorld: Types.Point3;
  viewport: Types.IViewport;
  imageVoxelValue: utilities.VoxelValue<number>;
  segmentationVoxelValue: utilities.VoxelValue<number>;
  segmentationImageData: ImageData;
  previewVoxelValue: utilities.VoxelValue<number>;

  // TODO - move this into a separate object and just hold a reference here
  fill?: () => void;
  isInObject?: (pointLPS, pointIJK) => boolean;
  isWithinThreshold?: (data) => boolean;
  initDown?: () => void;
  completeUp?: () => void;
  cancelPreview?: () => void;
  acceptPreview?: () => void;
  setValue: (data) => void;
};

type Initializer = (operationData: InitializedOperationData) => void;

/**
 * Parts to a strategy:
 * 1. Fill strategy - how the fill gets done (left/right, 3d, paint fill etc)
 * 2. Set value strategy - can clear values or set them, or something else?
 * 3. In object strategy - how to tell if a point is contained in the object
 *    * Bounding box getter for the object strategy
 * 4. thresholdStrategy - how to determine if a point is within a threshold value
 *
 * These combine to form an actual brush:
 *
 * Circle - convexFill, defaultSetValue, inEllipse/boundingbox ellipse, empty threshold
 * Rectangle - - convexFill, defaultSetValue, inRectangle/boundingbox rectangle, empty threshold
 * might also get parameter values from input,  init for setup of convexFill
 *
 * Generate a callback, and a call to pointInShape calling the various callbacks/settings.
 */

export default class BrushStrategy {
  // @deprecated
  public static initializeSetValue = initializeSetValue;
  public static initializePreview = initializePreview;
  public static initializeThreshold = initializeThreshold;
  public static initializeRegionFill = initializeRegionFill;

  /**
   * Provide some default initializers for various situations, mostly for
   * external use to allow defining new brushes
   */
  public static initializers = {
    initializePreview,
    initializeSetValue,
    initializeThreshold,
    initializeRegionFill,
  };

  protected configurationName: string;
  protected initializers: Initializer[];

  constructor(name, ...initializers: Initializer[]) {
    this.configurationName = name;
    this.initializers = initializers;
  }

  public fill(
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) {
    const initializedData = this.getInitializedData(
      enabledElement,
      operationData
    );

    initializedData.fill();

    const { previewVoxelValue } = initializedData;

    const arrayOfSlices: number[] = Array.from(
      previewVoxelValue.modifiedSlices
    );

    triggerSegmentationDataModified(
      initializedData.segmentationId,
      arrayOfSlices
    );
  }

  protected getInitializedData(
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ): InitializedOperationData {
    const { viewport } = enabledElement;
    const data = getStrategyData({ operationData, viewport });

    if (!data) {
      console.warn('No data found for BrushStrategy');
      return;
    }

    const { imageVoxelValue, segmentationVoxelValue, segmentationImageData } =
      data;
    const previewVoxelValue = VoxelValue.historyVoxelValue(
      segmentationVoxelValue
    );

    const initializedData: InitializedOperationData = {
      ...operationData,
      enabledElement,
      imageVoxelValue,
      segmentationVoxelValue,
      segmentationImageData,
      previewVoxelValue,
      viewport,

      fill: null,
      setValue: null,
      centerWorld: null,
    };

    this.initializers.forEach((initializer) => initializer(initializedData));
    return initializedData;
  }

  public initDown = (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => {
    this.getInitializedData(enabledElement, operationData).initDown?.();
  };

  public completeUp = (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => {
    this.getInitializedData(enabledElement, operationData).completeUp?.();
  };

  public cancelPreview = (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => {
    this.getInitializedData(enabledElement, operationData).cancelPreview?.();
  };

  public acceptPreview = (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => {
    this.getInitializedData(enabledElement, operationData).acceptPreview?.();
  };

  public assignMethods(strategy) {
    strategy.initDown = this.initDown;
    strategy.completeUp = this.completeUp;
    strategy.cancelPreview = this.cancelPreview;
    strategy.acceptPreview = this.acceptPreview;
  }
}
