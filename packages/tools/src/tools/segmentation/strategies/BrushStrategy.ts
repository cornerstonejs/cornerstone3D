import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeRegionFill from './utils/initializeRegionFill';
import initializeThreshold from './utils/initializeThreshold';
import { getStrategyData } from './utils/getStrategyData';
import type {
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
} from '../../../types/LabelmapToolOperationData';

const { VoxelValue } = utilities;
export type OperationData =
  | LabelmapToolOperationDataVolume
  | LabelmapToolOperationDataStack;

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

  brushStrategy: BrushStrategy;
};

export type StrategyFunction = (
  enabled,
  operationData: InitializedOperationData
) => unknown;

export type InitializerInstance = {
  initDown?: StrategyFunction;
  completeUp?: StrategyFunction;
  fill?: StrategyFunction;
  createInitialized?: StrategyFunction;
  createIsInThreshold?: StrategyFunction;
};

export type InitializerFunction = () => InitializerInstance;

export type Initializer = InitializerFunction | InitializerInstance;

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

  protected static childFunctions = {
    initDown: addListMethod('initDown'),
    completeUp: addListMethod('completeUp', 'createInitialized'),
    fill: addListMethod('fill'),
    createInitialized: addListMethod('createInitialized'),
    createIsInThreshold: addSingletonMethod('createIsInThreshold'),
    acceptPreview: addListMethod('acceptPreview', 'createInitialized'),
    rejectPreview: addListMethod('rejectPreview', 'createInitialized'),
    setValue: addSingletonMethod('setValue'),
    preview: addSingletonMethod('preview'),
  };

  protected configurationName: string;
  public initializers: Initializer[];
  protected _createInitialized = [];
  protected _fill = [];
  protected _acceptPreview: [];

  constructor(name, ...initializers: Initializer[]) {
    this.configurationName = name;
    this.initializers = initializers;
    initializers.forEach((initializer) => {
      const result =
        typeof initializer === 'function' ? initializer() : initializer;
      if (!result) {
        return;
      }
      for (const key in result) {
        if (!BrushStrategy.childFunctions[key]) {
          throw new Error(`Didn't find ${key} as a brush strategy`);
        }
        BrushStrategy.childFunctions[key](this, result[key]);
      }
    });
  }

  /**
   * Performs a fill of the given region.
   * Returns the preview data if the fill performs a preview, and otherwise
   * returns null.
   */
  public fill = (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => {
    const initializedData = this.createInitialized(
      enabledElement,
      operationData
    );

    const { strategySpecificConfiguration = {}, centerIJK } = initializedData;
    if (utilities.isEqual(centerIJK, strategySpecificConfiguration.centerIJK)) {
      return operationData.preview;
    } else {
      strategySpecificConfiguration.centerIJK = centerIJK;
    }

    this._fill.forEach((func) => func(enabledElement, initializedData));

    const { segmentationVoxelValue, previewVoxelValue, previewSegmentIndex } =
      initializedData;

    triggerSegmentationDataModified(
      initializedData.segmentationId,
      segmentationVoxelValue.getArrayOfSlices()
    );

    // We are only previewing if there is a preview index, and there is at
    // least one slice modified
    if (!previewSegmentIndex || !previewVoxelValue.modifiedSlices.size) {
      return null;
    }
    return previewVoxelValue;
  };

  protected createInitialized(
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ): InitializedOperationData {
    const { viewport } = enabledElement;
    const data = getStrategyData({ operationData, viewport });

    if (!data) {
      console.warn('No data found for BrushStrategy');
      return operationData.preview;
    }

    const { imageVoxelValue, segmentationVoxelValue, segmentationImageData } =
      data;
    const previewVoxelValue =
      operationData.preview ||
      VoxelValue.historyVoxelValue(segmentationVoxelValue);

    const initializedData: InitializedOperationData = {
      ...operationData,
      enabledElement,
      imageVoxelValue,
      segmentationVoxelValue,
      segmentationImageData,
      previewVoxelValue,
      viewport,

      centerWorld: null,
      brushStrategy: this,
    };

    this._createInitialized.forEach((func) =>
      func(enabledElement, initializedData)
    );

    return initializedData;
  }

  public initDown: (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => void;

  public completeUp: (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => void;

  public rejectPreview: (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => void;

  public acceptPreview: (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => void;

  public preview: (
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) => unknown;

  public setValue: (data, operationData: InitializedOperationData) => void;

  public createIsInThreshold: (
    enabled,
    operationData: InitializedOperationData
  ) => any;

  /**
   * This creates the old method functions for the strategies.  The newer
   * method is intended to directly use this object.
   */
  public assignMethods(strategyFunction?: (enabled, operationData) => unknown) {
    if (!strategyFunction) {
      strategyFunction = (enabled, operationData) =>
        this.fill(enabled, operationData);
    }
    for (const key of Object.keys(BrushStrategy.childFunctions)) {
      strategyFunction[key] = this[key];
    }
    return strategyFunction;
  }
}

/**
 * Adds a list method to the set of defined methods.
 */
function addListMethod(name: string, createInitialized?: string) {
  const listName = `_${name}`;
  return (brushStrategy, func) => {
    brushStrategy[listName] ||= [];
    brushStrategy[listName].push(func);
    brushStrategy[name] ||= function (enabledElement, operationData) {
      const initializedData = createInitialized
        ? brushStrategy[createInitialized](enabledElement, operationData)
        : operationData;
      brushStrategy[listName].forEach((func) =>
        func.call(brushStrategy, enabledElement, initializedData)
      );
    };
  };
}

/**
 * Adds a singleton method, throwing an exception if it is already defined
 */
function addSingletonMethod(name: string) {
  return (brushStrategy, func) => {
    if (brushStrategy[name]) {
      throw new Error(`The singleton method ${name} already exists`);
    }
    brushStrategy[name] = func.bind(brushStrategy);
  };
}
