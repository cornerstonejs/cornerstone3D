import type { Types } from '@cornerstonejs/core';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import pointInShapeCallback from '../../../utilities/pointInShapeCallback';
import isWithinThreshold from './utils/isWithinThreshold';
import type BoundsIJK from '../../../types/BoundsIJK';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeRegionFill from './utils/initializeRegionFill';

export type OperationData = {
  segmentationId: string;
  imageVolume: Types.IImageVolume;
  points: Types.Point3[];
  volume: Types.IImageVolume;
  /**
   * The final segment value to apply for this colour at the end
   */
  segmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  // constraintFn: () => boolean;
};

export type InitializedOperationData = OperationData & {
  fill?: () => void;
  modifiedSlicesToUse: Set<number>;
  enabledElement: Types.IEnabledElement;
  imageData: vtkImageData;
  scalarData: Float32Array | Uint16Array | Int16Array | Uint8Array | Int8Array;
  isInObject?: (pointLPS, pointIJK) => boolean;
  isWithinThreshold?: (data) => boolean;
  boundsIJK?: BoundsIJK;
  setValue: (data) => void;
  viewport: Types.IViewport;
  dimensions: Types.Point3;
  centerWorld: Types.Point3;
  initDown?: () => void;
  completeUp?: () => void;
  centerIJK?: Types.Point3;
  getPreviewSegmentIndex?: (previousIndex: number) => number;
  segmentIndices: Set<number>;
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
  /**
   * Creates a basic setValue that applies the segment index to the given index.
   */
  public static initializeSetValue = initializeSetValue;
  public static initializePreview = initializePreview;

  public static initializeThreshold = (
    initializerData: InitializedOperationData
  ) => {
    initializerData.isWithinThreshold = (data) =>
      isWithinThreshold(
        data,
        initializerData.imageVolume,
        initializerData.strategySpecificConfiguration
      );
  };

  public static initializeRegionFill = initializeRegionFill;

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

    const arrayOfSlices: number[] = Array.from(
      initializedData.modifiedSlicesToUse
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
    const modifiedSlicesToUse = new Set() as Set<number>;
    const { volume: segmentationVolume, segmentationId } = operationData;
    const { imageData, dimensions } = segmentationVolume;
    const scalarData = segmentationVolume.getScalarData();
    const { viewport } = enabledElement;

    const initializedData: InitializedOperationData = {
      ...operationData,
      modifiedSlicesToUse,
      enabledElement,
      imageData,
      scalarData,
      viewport,
      dimensions,
      fill: null,
      setValue: null,
      centerWorld: null,
      segmentIndices: new Set<number>(),
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
}
