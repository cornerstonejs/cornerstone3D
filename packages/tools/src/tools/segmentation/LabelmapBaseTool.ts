import {
  getEnabledElement,
  cache,
  utilities as csUtils,
  Enums,
  eventTarget,
  BaseVolumeViewport,
  StackViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import type { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getActiveSegmentation } from '../../stateManagement/segmentation/getActiveSegmentation';
import { getLockedSegmentIndices } from '../../stateManagement/segmentation/segmentLocking';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { getCurrentLabelmapImageIdForViewport } from '../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentIndexColor } from '../../stateManagement/segmentation/config/segmentationColor';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { StrategyCallbacks } from '../../enums';
import * as LabelmapMemo from '../../utilities/segmentation/createLabelmapMemo';
import {
  getAllAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { filterAnnotationsForDisplay } from '../../utilities/planar';
import { isPointInsidePolyline3D } from '../../utilities/math/polyline';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { fillInsideCircle } from './strategies';
import type { LabelmapToolOperationData } from '../../types/LabelmapToolOperationData';

/**
 * A type for preview data/information, used to setup previews on hover, or
 * maintain the preview information.
 */
export type PreviewData = {
  /**
   *  The preview data returned from the strategy
   */
  preview: unknown;
  /** A timer id to allow cancelling the timer */
  timer?: number;
  /** The start time for the timer, to allow showing preview after a given length of time */
  timerStart: number;
  /**
   * The starting point where the use clicked down on, used to cancel preview
   * on drag, but preserve it if the user moves the mouse tiny amounts accidentally.
   */
  startPoint: Types.Point2;
  element: HTMLDivElement;
  /**
   * Record if this is a drag preview, that is, a preview which is being extended
   * by the user dragging to view more area.
   */
  isDrag: boolean;
};

type EditDataReturnType =
  | {
      volumeId: string;
      referencedVolumeId: string;
      segmentsLocked: number[];
    }
  | {
      imageId: string;
      segmentsLocked: number[];
      override?: {
        voxelManager:
          | Types.IVoxelManager<number>
          | Types.IVoxelManager<Types.RGB>;
        imageData: vtkImageData;
      };
    }
  | null;

type ModifiedLabelmapToolOperationData = Omit<
  LabelmapToolOperationData,
  'voxelManager' | 'override'
> & {
  voxelManager?: Types.IVoxelManager<number> | Types.IVoxelManager<Types.RGB>;
  override?: {
    voxelManager: Types.IVoxelManager<number> | Types.IVoxelManager<Types.RGB>;
    imageData: vtkImageData;
  };
};

/**
 * Labelmap tool containing shared functionality for labelmap tools.
 */
export default class LabelmapBaseTool extends BaseTool {
  protected _editData: {
    override: {
      voxelManager: Types.IVoxelManager<number>;
      imageData: vtkImageData;
    };
    segmentsLocked: number[]; //
    imageId?: string; // stack labelmap
    imageIds?: string[]; // stack labelmap
    volumeId?: string; // volume labelmap
    referencedVolumeId?: string;
  } | null;

  protected centerSegmentIndexInfo: {
    segmentIndex: number;
    hasSegmentIndex: boolean;
    hasPreviewIndex: boolean;
    changedIndices: number[];
  };

  protected _hoverData?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brushCursor: any;
    segmentationId: string;
    segmentIndex: number;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    centerCanvas?: Array<number>;
    viewport: Types.IViewport;
  };

  public static previewData?: PreviewData = {
    preview: null,
    element: null,
    timerStart: 0,
    timer: null,
    startPoint: [NaN, NaN],
    isDrag: false,
  };

  protected memoMap: Map<string, LabelmapMemo.LabelmapMemo>;
  protected acceptedMemoIds: Map<
    string,
    { element: HTMLDivElement; segmentIndex: number }
  >;
  protected memo: LabelmapMemo.LabelmapMemo;

  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);
    this.memoMap = new Map();
    this.acceptedMemoIds = new Map();
    this.centerSegmentIndexInfo = {
      segmentIndex: null,
      hasSegmentIndex: false,
      hasPreviewIndex: false,
      changedIndices: [],
    };
  }

  protected _historyRedoHandler(evt) {
    const { id, operationType } = evt.detail;

    // Skip if not a labelmap operation
    if (operationType !== 'labelmap') {
      return;
    }

    if (this.acceptedMemoIds.has(id)) {
      // Note: this is very important to null here, since the undo might happen while
      // the viewport is not active OR through some UI, so the cursor might not be
      // on the element so we need to null out the hover data so that it get
      // recalculated again based on the current element (that we stored previously)
      this._hoverData = null;

      const memoData = this.acceptedMemoIds.get(id);

      const element = memoData?.element;
      const operationData = this.getOperationData(element);
      operationData.segmentIndex = memoData?.segmentIndex;

      if (element) {
        this.applyActiveStrategyCallback(
          getEnabledElement(element),
          operationData,
          StrategyCallbacks.AcceptPreview
        );
      }
    }

    // Mark the preview as a drag to prevent additional processing
    this._previewData.isDrag = true;
  }

  // Gets a shared preview data
  protected get _previewData() {
    return LabelmapBaseTool.previewData;
  }

  /**
   * Checks if the tool has a preview data associated.
   * @returns True if the tool has preview data, false otherwise.
   */
  public hasPreviewData() {
    return !!this._previewData.preview;
  }

  /**
   * Checks if the tool should resolve preview requests.
   * This is used to determine if the tool is in a state where it can handle
   * preview requests.
   * @returns True if the tool should resolve preview requests, false otherwise.
   */
  public shouldResolvePreviewRequests() {
    return (
      (this.mode === 'Active' || this.mode === 'Enabled') &&
      this.hasPreviewData()
    );
  }

  /**
   * Creates a labelmap memo instance, which stores the changes made to the
   * labelmap rather than the initial state.
   */
  public createMemo(segmentationId: string, segmentationVoxelManager) {
    const voxelManagerId = segmentationVoxelManager.id;

    if (
      this.memo &&
      this.memo.segmentationVoxelManager === segmentationVoxelManager
    ) {
      return this.memo;
    }

    let memo = this.memoMap.get(voxelManagerId);

    if (!memo) {
      memo = LabelmapMemo.createLabelmapMemo(
        segmentationId,
        segmentationVoxelManager
      );
      this.memoMap.set(voxelManagerId, memo);
    } else {
      // If the memo was previously committed, we need a fresh one
      if (memo.redoVoxelManager) {
        memo = LabelmapMemo.createLabelmapMemo(
          segmentationId,
          segmentationVoxelManager
        );
        this.memoMap.set(voxelManagerId, memo);
      }
    }

    this.memo = memo;
    return memo;
  }

  protected createEditData(element): EditDataReturnType {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const activeSegmentation = getActiveSegmentation(viewport.id);
    if (!activeSegmentation) {
      const event = new CustomEvent(Enums.Events.ERROR_EVENT, {
        detail: {
          type: 'Segmentation',
          message:
            'No active segmentation detected, create a segmentation representation before using the brush tool',
        },
        cancelable: true,
      });
      eventTarget.dispatchEvent(event);
      return null;
    }

    const { segmentationId } = activeSegmentation;

    const segmentsLocked = getLockedSegmentIndices(segmentationId);

    const { representationData } = getSegmentation(segmentationId);

    const editData = this.getEditData({
      viewport,
      representationData,
      segmentsLocked,
      segmentationId,
    });

    return editData;
  }

  protected getEditData({
    viewport,
    representationData,
    segmentsLocked,
    segmentationId,
  }): EditDataReturnType {
    if (viewport instanceof BaseVolumeViewport) {
      if (!representationData[SegmentationRepresentations.Labelmap]) {
        return;
      }

      const { volumeId } = representationData[
        SegmentationRepresentations.Labelmap
      ] as LabelmapSegmentationDataVolume;
      if (!volumeId) {
        return;
      }
      const actors = viewport.getActors();

      const isStackViewport = viewport instanceof StackViewport;

      if (isStackViewport) {
        const event = new CustomEvent(Enums.Events.ERROR_EVENT, {
          detail: {
            type: 'Segmentation',
            message: 'Cannot perform brush operation on the selected viewport',
          },
          cancelable: true,
        });
        eventTarget.dispatchEvent(event);
        return null;
      }

      // we used to take the first actor here but we should take the one that is
      // probably the same size as the segmentation volume
      const volumes = actors
        .filter((actorEntry) => actorEntry.referencedId)
        .map((actorEntry) => cache.getVolume(actorEntry.referencedId));

      const segmentationVolume = cache.getVolume(volumeId);

      const referencedVolumeIdToThreshold =
        volumes.find((volume) =>
          csUtils.isEqual(volume.dimensions, segmentationVolume.dimensions)
        )?.volumeId || volumes[0]?.volumeId;

      return {
        volumeId,
        referencedVolumeId:
          this.configuration.threshold?.volumeId ??
          referencedVolumeIdToThreshold,
        segmentsLocked,
      };
    } else {
      const segmentationImageId = getCurrentLabelmapImageIdForViewport(
        viewport.id,
        segmentationId
      );

      if (!segmentationImageId) {
        // if there is no stack segmentation slice for the current image
        // we should not allow the user to perform any operation
        return;
      }

      return {
        imageId: segmentationImageId,
        segmentsLocked,
      };
    }
  }

  protected createHoverData(element, centerCanvas?) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const viewportIdsToRender = [viewport.id];

    const { segmentIndex, segmentationId, segmentColor } =
      this.getActiveSegmentationData(viewport) || {};

    // Center of circle in canvas Coordinates
    const brushCursor = {
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.getToolName(),
        segmentColor,
      },
      data: {},
    };

    return {
      brushCursor,
      centerCanvas,
      segmentIndex,
      viewport,
      segmentationId,
      segmentColor,
      viewportIdsToRender,
    };
  }

  protected getActiveSegmentationData(viewport) {
    const viewportId = viewport.id;
    const activeRepresentation = getActiveSegmentation(viewportId);

    if (!activeRepresentation) {
      return;
    }

    const { segmentationId } = activeRepresentation;
    const segmentIndex = getActiveSegmentIndex(segmentationId);

    if (!segmentIndex) {
      return;
    }

    const segmentColor = getSegmentIndexColor(
      viewportId,
      segmentationId,
      segmentIndex
    );

    return {
      segmentIndex,
      segmentationId,
      segmentColor,
    };
  }

  protected getOperationData(element?): ModifiedLabelmapToolOperationData {
    const editData = this._editData || this.createEditData(element);
    const { segmentIndex, segmentationId, brushCursor } =
      this._hoverData || this.createHoverData(element);
    const { data, metadata = {} } = brushCursor || {};
    const { viewPlaneNormal, viewUp } = metadata;

    const configColor =
      this.configuration.preview?.previewColors?.[segmentIndex];
    const { viewport } = getEnabledElement(element);
    const segmentColor = getSegmentIndexColor(
      viewport.id,
      segmentationId,
      segmentIndex
    );

    if (!configColor && !segmentColor) {
      return;
    }

    let previewColor = null,
      previewSegmentIndex = null;
    if (this.configuration.preview?.enabled) {
      previewColor = configColor || lightenColor(...segmentColor);
      previewSegmentIndex = 255;
    }

    const operationData = {
      ...editData,
      points: data?.handles?.points,
      segmentIndex,
      viewPlaneNormal,
      previewOnHover: !this._previewData.isDrag,
      toolGroupId: this.toolGroupId,
      segmentationId,
      viewUp,
      centerSegmentIndexInfo: this.centerSegmentIndexInfo,
      activeStrategy: this.configuration.activeStrategy,
      configuration: this.configuration,
      // Provide the preview information so that data can be used directly
      previewColor,
      previewSegmentIndex,
      createMemo: this.createMemo.bind(this),
      hoverData: this._hoverData,
    };
    return operationData;
  }

  /**
   * Adds a preview that can be filled with data.
   */
  public addPreview(
    element = this._previewData.element,
    options?: { acceptReject: boolean }
  ) {
    const { _previewData } = this;
    const acceptReject = options?.acceptReject;
    if (acceptReject === true) {
      this.acceptPreview(element);
    } else if (acceptReject === false) {
      this.rejectPreview(element);
    }
    const enabledElement = getEnabledElement(element);
    const results = this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.AddPreview
    );
    _previewData.isDrag = true;
    // If the results are modified, we store it as preview data
    if (results?.modified) {
      _previewData.preview = results;
      _previewData.element = element;
    }
    return results;
  }

  /**
   * Cancels any preview view being shown, resetting any segments being shown.
   */
  public rejectPreview(element = this._previewData.element) {
    if (!element) {
      return;
    }
    this.doneEditMemo();
    const enabledElement = getEnabledElement(element);
    this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.RejectPreview
    );

    // Make sure to fully reset all preview related data
    this._previewData.preview = null;
    this._previewData.isDrag = false;
  }

  /**
   * Accepts a preview, marking it as the active segment.
   */
  public acceptPreview(element = this._previewData.element) {
    if (!element) {
      return;
    }

    const operationData = this.getOperationData(element);

    // Track the memo ID if it was from an acceptPreview operation
    if (this.memo && this.memo.id) {
      // Store the element and current segment index

      this.acceptedMemoIds.set(this.memo.id, {
        element,
        segmentIndex: operationData.segmentIndex,
      });
    }

    const enabledElement = getEnabledElement(element);

    this.applyActiveStrategyCallback(
      enabledElement,
      operationData,
      StrategyCallbacks.AcceptPreview
    );

    // perform the commit after we accept the preview so that
    // we choose the correct timestamp with the confirmed segment index
    this.doneEditMemo();
    this._previewData.preview = null;
    this._previewData.isDrag = false;
  }

  /**
   * This function converts contours on this view into labelmap data, using the
   * handle[0] state
   */
  public static viewportContoursToLabelmap(
    viewport: Types.IViewport,
    options?: { removeContours: boolean }
  ) {
    const removeContours = options?.removeContours ?? true;
    const annotations = getAllAnnotations();
    const viewAnnotations = filterAnnotationsForDisplay(viewport, annotations);
    if (!viewAnnotations?.length) {
      return;
    }
    const contourAnnotations = viewAnnotations.filter(
      (annotation) => annotation.data.contour?.polyline?.length
    );
    if (!contourAnnotations.length) {
      return;
    }

    const brushInstance = new LabelmapBaseTool(
      {},
      {
        configuration: {
          strategies: {
            FILL_INSIDE_CIRCLE: fillInsideCircle,
          },
          activeStrategy: 'FILL_INSIDE_CIRCLE',
        },
      }
    );
    const preview = brushInstance.addPreview(viewport.element);

    // Use type assertion for the preview object
    const { memo, segmentationId } = preview as {
      memo: LabelmapMemo.LabelmapMemo;
      segmentationId: string;
    };
    const previewVoxels = memo?.voxelManager;
    const segmentationVoxels =
      previewVoxels.sourceVoxelManager || previewVoxels;
    const { dimensions } = previewVoxels;

    // Create an undo history for the operation
    // Iterate through the canvas space in canvas index coordinates
    const imageData = viewport
      .getDefaultActor()
      .actor.getMapper()
      .getInputData();

    for (const annotation of contourAnnotations) {
      const boundsIJK = [
        [Infinity, -Infinity],
        [Infinity, -Infinity],
        [Infinity, -Infinity],
      ];

      const { polyline } = annotation.data.contour;
      for (const point of polyline) {
        const indexPoint = imageData.worldToIndex(point);
        indexPoint.forEach((v, idx) => {
          boundsIJK[idx][0] = Math.min(boundsIJK[idx][0], v);
          boundsIJK[idx][1] = Math.max(boundsIJK[idx][1], v);
        });
      }

      boundsIJK.forEach((bound, idx) => {
        bound[0] = Math.round(Math.max(0, bound[0]));
        bound[1] = Math.round(Math.min(dimensions[idx] - 1, bound[1]));
      });

      const activeIndex = getActiveSegmentIndex(segmentationId);
      const startPoint = annotation.data.handles?.[0] || polyline[0];
      const startIndex = imageData.worldToIndex(startPoint).map(Math.round);
      const startValue = segmentationVoxels.getAtIJKPoint(startIndex) || 0;
      let hasZeroIndex = false;
      let hasPositiveIndex = false;
      for (const polyPoint of polyline) {
        const polyIndex = imageData.worldToIndex(polyPoint).map(Math.round);
        const polyValue = segmentationVoxels.getAtIJKPoint(polyIndex);
        if (polyValue === startValue) {
          hasZeroIndex = true;
        } else if (polyValue >= 0) {
          hasPositiveIndex = true;
        }
      }
      const hasBoth = hasZeroIndex && hasPositiveIndex;
      const segmentIndex = hasBoth
        ? startValue
        : startValue === 0
          ? activeIndex
          : 0;
      for (let i = boundsIJK[0][0]; i <= boundsIJK[0][1]; i++) {
        for (let j = boundsIJK[1][0]; j <= boundsIJK[1][1]; j++) {
          for (let k = boundsIJK[2][0]; k <= boundsIJK[2][1]; k++) {
            const worldPoint = imageData.indexToWorld([i, j, k]);
            const isContained = isPointInsidePolyline3D(worldPoint, polyline);
            if (isContained) {
              previewVoxels.setAtIJK(i, j, k, segmentIndex);
            }
          }
        }
      }

      if (removeContours) {
        removeAnnotation(annotation.annotationUID);
      }
    }

    const slices = previewVoxels.getArrayOfModifiedSlices();
    triggerSegmentationDataModified(segmentationId, slices);
  }
}

function lightenColor(r, g, b, a, factor = 0.4) {
  return [
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
    a,
  ];
}
