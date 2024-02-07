import type { Types } from '@cornerstonejs/core';
import { cache, utilities as csUtils } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import compositions from './compositions';
import { getStrategyData } from './utils/getStrategyData';
import { isVolumeSegmentation } from './utils/stackVolumeCheck';
import { StrategyCallbacks } from '../../../enums';
import type {
  LabelmapToolOperationDataAny,
  LabelmapToolOperationDataVolume,
} from '../../../types/LabelmapToolOperationData';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

const { VoxelManager } = csUtils;

export type InitializedOperationData = LabelmapToolOperationDataAny & {
  // Allow initialization that is operation specific by keying on the name
  operationName?: string;

  // Additional data for performing the strategy
  enabledElement: Types.IEnabledElement;
  centerIJK?: Types.Point3;
  centerWorld: Types.Point3;
  viewport: Types.IViewport;
  imageVoxelManager:
    | csUtils.VoxelManager<number>
    | csUtils.VoxelManager<Types.RGB>;
  segmentationVoxelManager: csUtils.VoxelManager<number>;
  segmentationImageData: vtkImageData;
  previewVoxelManager: csUtils.VoxelManager<number>;
  // The index to use for the preview segment.  Currently always undefined or 255
  // but define it here for future expansion of LUT tables
  previewSegmentIndex?: number;

  brushStrategy: BrushStrategy;
};

export type StrategyFunction = (
  operationData: InitializedOperationData,
  ...args
) => unknown;

export type CompositionInstance = {
  [callback in StrategyCallbacks]?: StrategyFunction;
};

export type CompositionFunction = () => CompositionInstance;

export type Composition = CompositionFunction | CompositionInstance;

/**
 * A brush strategy is a composition of individual parts which together form
 * the strategy for a brush tool.
 *
 * Parts of a strategy:
 * 1. Fill strategy - how the fill gets done (left/right, 3d, paint fill etc)
 * 2. Set value strategy - can clear values or set them, or something else?
 * 3. In object strategy - how to tell if a point is contained in the object
 *    * Bounding box getter for the object strategy
 * 4. threshold - how to determine if a point is within a threshold value
 * 5. preview - how to display preview information
 * 6. Various strategy customizations such as erase
 *
 * These combine to form an actual brush:
 *
 * Circle - convexFill, defaultSetValue, inEllipse/boundingbox ellipse, empty threshold
 * Rectangle - - convexFill, defaultSetValue, inRectangle/boundingbox rectangle, empty threshold
 * might also get parameter values from input,  init for setup of convexFill
 *
 * The pieces are combined to generate a strategyFunction, which performs
 * the actual strategy operation, as well as various callbacks for the strategy
 * to allow more control over behaviour in the specific strategy (such as displaying
 * preview)
 */

export default class BrushStrategy {
  /**
   * Provide some default initializers for various situations, mostly for
   * external use to allow defining new brushes
   */
  public static COMPOSITIONS = compositions;

  protected static childFunctions = {
    [StrategyCallbacks.OnInteractionStart]: addListMethod(
      StrategyCallbacks.OnInteractionStart,
      StrategyCallbacks.Initialize
    ),
    [StrategyCallbacks.OnInteractionEnd]: addListMethod(
      StrategyCallbacks.OnInteractionEnd,
      StrategyCallbacks.Initialize
    ),
    [StrategyCallbacks.Fill]: addListMethod(StrategyCallbacks.Fill),
    [StrategyCallbacks.Initialize]: addListMethod(StrategyCallbacks.Initialize),
    [StrategyCallbacks.CreateIsInThreshold]: addSingletonMethod(
      StrategyCallbacks.CreateIsInThreshold
    ),
    [StrategyCallbacks.AcceptPreview]: addListMethod(
      StrategyCallbacks.AcceptPreview,
      StrategyCallbacks.Initialize
    ),
    [StrategyCallbacks.RejectPreview]: addListMethod(
      StrategyCallbacks.RejectPreview,
      StrategyCallbacks.Initialize
    ),
    [StrategyCallbacks.INTERNAL_setValue]: addSingletonMethod(
      StrategyCallbacks.INTERNAL_setValue
    ),
    [StrategyCallbacks.Preview]: addSingletonMethod(
      StrategyCallbacks.Preview,
      false
    ),
    // Add other exposed fields below
    // initializers is exposed on the function to allow extension of the composition object
    compositions: null,
  };

  public compositions: Composition[];
  public strategyFunction: (enabledElement, operationData) => unknown;

  protected configurationName: string;
  protected _initialize = [];
  protected _fill = [];
  protected _acceptPreview: [];
  protected _onInteractionStart = [];

  constructor(name, ...initializers: Composition[]) {
    this.configurationName = name;
    this.compositions = initializers;
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
    this.strategyFunction = (enabledElement, operationData) =>
      this.fill(enabledElement, operationData);

    for (const key of Object.keys(BrushStrategy.childFunctions)) {
      this.strategyFunction[key] = this[key];
    }
  }

  /**
   * Performs a fill of the given region.
   * Returns the preview data if the fill performs a preview, and otherwise
   * returns null.
   */
  public fill = (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => {
    const initializedData = this.initialize(
      enabledElement,
      operationData,
      StrategyCallbacks.Fill
    );

    if (!initializedData) {
      // Happens when there is no label map
      return;
    }

    const { strategySpecificConfiguration = {}, centerIJK } = initializedData;
    // Store the center IJK location so that we can skip an immediate same-point update
    // TODO - move this to the BrushTool
    if (csUtils.isEqual(centerIJK, strategySpecificConfiguration.centerIJK)) {
      return operationData.preview;
    } else {
      strategySpecificConfiguration.centerIJK = centerIJK;
    }

    this._fill.forEach((func) => func(initializedData));

    const {
      segmentationVoxelManager,
      previewVoxelManager,
      previewSegmentIndex,
    } = initializedData;

    triggerSegmentationDataModified(
      initializedData.segmentationId,
      segmentationVoxelManager.getArrayOfSlices()
    );
    // We are only previewing if there is a preview index, and there is at
    // least one slice modified
    if (!previewSegmentIndex || !previewVoxelManager.modifiedSlices.size) {
      return null;
    }
    // Use the original initialized data set to preserve preview info
    return initializedData.preview || initializedData;
  };

  protected initialize(
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny,
    operationName?: string
  ): InitializedOperationData {
    const { viewport } = enabledElement;
    const data = getStrategyData({ operationData, viewport });

    if (!data) {
      console.warn('No data found for BrushStrategy');
      return operationData.preview;
    }

    if (isVolumeSegmentation(operationData, viewport)) {
      const { referencedVolumeId, volumeId } =
        operationData as LabelmapToolOperationDataVolume;

      const segmentation = cache.getVolume(volumeId);

      if (referencedVolumeId) {
        const imageVolume = cache.getVolume(referencedVolumeId);

        if (
          !csUtils.isEqual(segmentation.dimensions, imageVolume.dimensions) ||
          !csUtils.isEqual(segmentation.direction, imageVolume.direction)
        ) {
          throw new Error(
            'Only source data the same dimensions/size/orientation as the segmentation currently supported.'
          );
        }
      }
    }

    const {
      imageVoxelManager,
      segmentationVoxelManager,
      segmentationImageData,
    } = data;
    const previewVoxelManager =
      operationData.preview?.previewVoxelManager ||
      VoxelManager.createHistoryVoxelManager(segmentationVoxelManager);
    const previewEnabled = !!operationData.previewColors;
    const previewSegmentIndex = previewEnabled ? 255 : undefined;

    const initializedData: InitializedOperationData = {
      operationName,
      previewSegmentIndex,
      ...operationData,
      enabledElement,
      imageVoxelManager,
      segmentationVoxelManager,
      segmentationImageData,
      previewVoxelManager,
      viewport,

      centerWorld: null,
      brushStrategy: this,
    };

    this._initialize.forEach((func) => func(initializedData));

    return initializedData;
  }

  /**
   * Function called to initialize the start of the strategy.  Often this is
   * on mouse down, so calling this initDown.
   * Over-written by the strategy composition.
   */
  public onInteractionStart = (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => {
    const { preview } = operationData;
    // Need to skip the init down if it has already occurred in teh preview
    // That prevents resetting values which were used to determine the preview
    if (preview?.isPreviewFromHover) {
      preview.isPreviewFromHover = false;
      return;
    }
    const initializedData = this.initialize(enabledElement, operationData);
    if (!initializedData) {
      // Happens if there isn't a labelmap to apply to
      return;
    }
    this._onInteractionStart.forEach((func) =>
      func.call(this, initializedData)
    );
  };

  /**
   * Function called when a strategy is complete in some way.
   * Often called on mouse up, hence the name.
   *
   * Over-written by the strategy composition.
   */
  public onInteractionEnd: (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => void;

  /**
   * Reject the preview.
   * Over-written by the strategy composition.
   */
  public rejectPreview: (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => void;

  /**
   * Accept the preview, making it part of the overall segmentation
   *
   * Over-written by the strategy composition.
   */
  public acceptPreview: (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => void;

  /**
   * Display a preview at the current position.  This will typically
   * using the onInteractionStart, fill and onInteractionEnd methods,
   * plus optional use of a preview.
   *
   * Over-written by the strategy composition.
   * @returns preview data if a preview is displayed.
   */
  public preview: (
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => unknown;

  /**
   * Over-written by the strategy composition.
   */
  public setValue: (operationData: InitializedOperationData, data) => void;

  /**
   * Over-written by the strategy composition.
   */
  public createIsInThreshold: (operationData: InitializedOperationData) => any;
}

/**
 * Adds a list method to the set of defined methods.
 */
function addListMethod(name: string, createInitialized?: string) {
  const listName = `_${name}`;
  return (brushStrategy, func) => {
    brushStrategy[listName] ||= [];
    brushStrategy[listName].push(func);
    brushStrategy[name] ||= createInitialized
      ? (enabledElement, operationData) => {
          const initializedData = brushStrategy[createInitialized](
            enabledElement,
            operationData,
            name
          );
          brushStrategy[listName].forEach((func) =>
            func.call(brushStrategy, initializedData)
          );
        }
      : (operationData) => {
          brushStrategy[listName].forEach((func) =>
            func.call(brushStrategy, operationData)
          );
        };
  };
}

/**
 * Adds a singleton method, throwing an exception if it is already defined
 */
function addSingletonMethod(name: string, isInitialized = true) {
  return (brushStrategy, func) => {
    if (brushStrategy[name]) {
      throw new Error(`The singleton method ${name} already exists`);
    }
    brushStrategy[name] = isInitialized
      ? func
      : (enabledElement, operationData) => {
          // Store the enabled element in the operation data so we can use single
          // argument calls
          operationData.enabledElement = enabledElement;
          return func.call(brushStrategy, operationData);
        };
  };
}
