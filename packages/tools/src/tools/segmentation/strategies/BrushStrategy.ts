import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import compositions from './compositions';
import { getStrategyData } from './utils/getStrategyData';
import { StrategyCallbacks } from '../../../enums';
import type { LabelmapToolOperationDataAny } from '../../../types/LabelmapToolOperationData';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { LabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';

export type InitializedOperationData = LabelmapToolOperationDataAny & {
  // Allow initialization that is operation specific by keying on the name
  operationName?: string;

  centerSegmentIndexInfo: {
    segmentIndex: number;
    hasSegmentIndex: boolean;
    hasPreviewIndex: boolean;
    changedIndices: number[];
  };
  // Additional data for performing the strategy
  enabledElement: Types.IEnabledElement;
  centerIJK?: Types.Point3;
  centerWorld: Types.Point3;
  isInObject: (point: Types.Point3) => boolean;
  isInObjectBoundsIJK: Types.BoundsIJK;
  viewport: Types.IViewport;
  imageVoxelManager:
    | Types.IVoxelManager<number>
    | Types.IVoxelManager<Types.RGB>;
  segmentationVoxelManager: Types.IVoxelManager<number>;
  segmentationImageData: vtkImageData;
  // The index to use for the preview segment.  Currently always undefined or 255
  // but define it here for future expansion of LUT tables
  previewSegmentIndex?: number;
  previewColor?: [number, number, number, number];
  brushStrategy: BrushStrategy;
  activeStrategy: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration?: {
    [key: string]: unknown;
    brushSize: number;
    centerSegmentIndex?: {
      segmentIndex: number;
    };
    threshold?: {
      range?: number[];
      isDynamic: boolean;
      dynamicRadius: number;
      dynamicRadiusInCanvas?: number;
    };
  };
  hoverData?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brushCursor: any;
    segmentationId: string;
    segmentIndex: number;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    centerCanvas?: Array<number>;
    viewport: Types.IViewport;
  };
  memo?: LabelmapMemo;
  modified?: boolean;
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
 * Circle - convexFill, defaultSetValue, inEllipse/bounding box ellipse, empty threshold
 * Rectangle - - convexFill, defaultSetValue, inRectangle/bounding box rectangle, empty threshold
 * might also get parameter values from input,  init for setup of convexFill
 *
 * The pieces are combined to generate a strategyFunction, which performs
 * the actual strategy operation, as well as various callbacks for the strategy
 * to allow more control over behavior in the specific strategy (such as displaying
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
    [StrategyCallbacks.Interpolate]: addListMethod(
      StrategyCallbacks.Interpolate,
      StrategyCallbacks.Initialize
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
    [StrategyCallbacks.ComputeInnerCircleRadius]: addListMethod(
      StrategyCallbacks.ComputeInnerCircleRadius
    ),
    [StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation]:
      addListMethod(
        StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation
      ),
    [StrategyCallbacks.EnsureImageVolumeFor3DManipulation]: addListMethod(
      StrategyCallbacks.EnsureImageVolumeFor3DManipulation
    ),
    [StrategyCallbacks.AddPreview]: addListMethod(StrategyCallbacks.AddPreview),
    [StrategyCallbacks.GetStatistics]: addSingletonMethod(
      StrategyCallbacks.GetStatistics
    ),
    [StrategyCallbacks.CalculateCursorGeometry]: addSingletonMethod(
      StrategyCallbacks.CalculateCursorGeometry,
      true
    ),
    [StrategyCallbacks.RenderCursor]: addSingletonMethod(
      StrategyCallbacks.RenderCursor,
      true
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

    // Ensuring backwards compatibility - always have a circular cursor if none is defined
    const cursorGeometryInitializer = initializers.find((init) =>
      init.hasOwnProperty(StrategyCallbacks.CalculateCursorGeometry)
    );
    const renderCursorInitializer = initializers.find((init) =>
      init.hasOwnProperty(StrategyCallbacks.RenderCursor)
    );

    if (!cursorGeometryInitializer) {
      initializers.push({
        [StrategyCallbacks.CalculateCursorGeometry]:
          compositions.circularCursor.calculateCursorGeometry,
      });
    }

    if (!renderCursorInitializer) {
      initializers.push({
        [StrategyCallbacks.RenderCursor]:
          compositions.circularCursor.renderCursor,
      });
    }

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
    this.strategyFunction = (enabledElement, operationData) => {
      return this.fill(enabledElement, operationData);
    };

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
      return;
    }

    this._fill.forEach((func) => func(initializedData));

    const { segmentationVoxelManager, segmentIndex } = initializedData;

    triggerSegmentationDataModified(
      initializedData.segmentationId,
      segmentationVoxelManager.getArrayOfModifiedSlices(),
      segmentIndex
    );

    // Use the original initialized data set to preserve preview info
    return initializedData;
  };

  protected initialize(
    enabledElement: Types.IEnabledElement,
    operationData: LabelmapToolOperationDataAny,
    operationName?: string
  ): InitializedOperationData {
    const { viewport } = enabledElement;

    const data = getStrategyData({ operationData, viewport, strategy: this });

    if (
      !data ||
      !data.imageVoxelManager ||
      !data.segmentationVoxelManager ||
      !data.segmentationImageData
    ) {
      return null;
    }

    const {
      imageVoxelManager,
      segmentationVoxelManager,
      segmentationImageData,
    } = data;

    const memo = operationData.createMemo(
      operationData.segmentationId,
      segmentationVoxelManager
    );

    // @ts-expect-error
    const initializedData: InitializedOperationData = {
      operationName,
      ...operationData,
      segmentIndex: operationData.segmentIndex,
      enabledElement,
      imageVoxelManager,
      segmentationVoxelManager,
      segmentationImageData,
      viewport,
      centerWorld: null,
      isInObject: null,
      isInObjectBoundsIJK: null,
      brushStrategy: this,
      memo,
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
    // const { preview } = operationData;
    // Need to skip the init down if it has already occurred in teh preview
    // That prevents resetting values which were used to determine the preview
    // if (preview?.isPreviewFromHover) {
    //   preview.isPreviewFromHover = false;
    //   return;
    // }
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
   * Adds a preview to the view, without filling it with any contents, returning
   * the initialized preview data.
   */
  public addPreview = (
    enabledElement,
    operationData: LabelmapToolOperationDataAny
  ) => {
    const initializedData = this.initialize(
      enabledElement,
      operationData,
      StrategyCallbacks.AddPreview
    );

    if (!initializedData) {
      // Happens when there is no label map
      return;
    }

    return initializedData;
  };

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

  /** Interpolate the labelmaps */
  public interpolate: (
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public createIsInThreshold: (operationData: InitializedOperationData) => any;

  public calculateCursorGeometry: (
    enabledElement: Types.IEnabledElement,
    operationData: InitializedOperationData
  ) => void;
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
      ? (enabledElement, operationData, ...args) => {
          const initializedData = brushStrategy[createInitialized](
            enabledElement,
            operationData,
            name
          );
          let returnValue;
          brushStrategy[listName].forEach((func) => {
            const value = func.call(brushStrategy, initializedData, ...args);
            returnValue ||= value;
          });
          return returnValue;
        }
      : (operationData, ...args) => {
          brushStrategy[listName].forEach((func) =>
            func.call(brushStrategy, operationData, ...args)
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
      : (enabledElement, operationData, ...args) => {
          // Store the enabled element in the operation data so we can use single
          // argument calls
          operationData.enabledElement = enabledElement;
          return func.call(brushStrategy, operationData, ...args);
        };
  };
}
