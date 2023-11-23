import type { Types } from '@cornerstonejs/core';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInShapeCallback } from '../../../utilities';
import isWithinThreshold from './utils/isWithinThreshold';
import type BoundsIJK from '../../../types/BoundsIJK';

export type OperationData = {
  segmentationId: string;
  imageVolume: Types.IImageVolume;
  points: Types.Point3[];
  volume: Types.IImageVolume;
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
  public static initializeSetValue = function (
    initializerData: InitializedOperationData
  ) {
    initializerData.setValue = ({ value, index, pointIJK }) => {
      if (initializerData.segmentsLocked.includes(value)) {
        return;
      }
      initializerData.scalarData[index] = initializerData.segmentIndex;
      //Todo: I don't think this will always be index 2 in streamingImageVolume?
      initializerData.modifiedSlicesToUse.add(pointIJK[2]);
    };
  };

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

  public static initializeRegionFill = function (
    initializerData: InitializedOperationData
  ) {
    initializerData.fill = () => {
      const callback = initializerData.isWithinThreshold
        ? (data) => {
            const { value, index } = data;
            if (initializerData.segmentsLocked.includes(value)) {
              return;
            }
            if (!initializerData.isWithinThreshold(index)) {
              return;
            }
            initializerData.setValue(data);
          }
        : initializerData.setValue;

      pointInShapeCallback(
        initializerData.imageData,
        initializerData.isInObject,
        callback,
        initializerData.boundsIJK
      );

      const arrayOfSlices: number[] = Array.from(
        initializerData.modifiedSlicesToUse
      );

      triggerSegmentationDataModified(
        initializerData.segmentationId,
        arrayOfSlices
      );
    };
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
    };

    this.initializers.forEach((initializer) => initializer(initializedData));
    return initializedData;
  }

  public initDown(
    enabledElement: Types.IEnabledElement,
    operationData: OperationData
  ) {
    this.getInitializedData(enabledElement, operationData).initDown?.();
  }
}
