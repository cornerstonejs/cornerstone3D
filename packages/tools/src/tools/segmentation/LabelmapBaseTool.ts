import {
  getEnabledElement,
  cache,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  config as segmentationConfig,
  segmentIndex as segmentIndexController,
  segmentLocking,
  state as segmentationState,
  activeSegmentation,
  triggerSegmentationEvents,
} from '../../stateManagement/segmentation';
import { state as annotationState } from '../../stateManagement/annotation';
import { LabelmapMemo } from '../../utilities/segmentation';
import { BaseTool } from '../base';
import {
  LabelmapSegmentationDataVolume,
  LabelmapSegmentationDataStack,
} from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from './strategies/utils/stackVolumeCheck';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { StrategyCallbacks } from '../../enums';
import filterAnnotationsForDisplay from '../../utilities/planar/filterAnnotationsForDisplay';
import { isPointInsidePolyline3D } from '../../utilities/math/polyline/isPointInsidePolyline3D';
import * as ToolGroupManager from '../../store/ToolGroupManager';

const { triggerSegmentationDataModified } = triggerSegmentationEvents;

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

/**
 * Labelmap tool containing shared functionality for labelmap tools.
 */
export default class LabelmapBaseTool extends BaseTool {
  protected _editData: {
    segmentsLocked: number[]; //
    segmentationRepresentationUID?: string;
    imageIdReferenceMap?: Map<string, string>;
    volumeId?: string;
    referencedVolumeId?: string;
  } | null;

  protected _previewData?: PreviewData = {
    preview: null,
    element: null,
    timerStart: 0,
    timer: null,
    startPoint: [NaN, NaN],
    isDrag: false,
  };

  protected _hoverData?: {
    brushCursor: any;
    segmentationId: string;
    segmentIndex: number;
    segmentationRepresentationUID: string;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    centerCanvas?: Array<number>;
  };

  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Creates a labelmap memo instance, which is a partially created memo
   * object that stores the changes made to the labelmap rather than the
   * initial state.  This memo is then committed once done so that the
   */
  public createMemo(segmentId: string, segmentationVoxelManager, preview) {
    this.memo ||= LabelmapMemo.createLabelmapMemo(
      segmentId,
      segmentationVoxelManager,
      preview
    );
    return this.memo as LabelmapMemo.LabelmapMemo;
  }

  /**
   * Creates a set of edit data used to modify a labelmap.
   */

  createEditData(element) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create a segmentation representation before using the brush tool'
      );
    }

    const { segmentationId, type, segmentationRepresentationUID } =
      activeSegmentationRepresentation;

    if (type === SegmentationRepresentations.Contour) {
      throw new Error('Not implemented yet');
    }

    const segmentsLocked = segmentLocking.getLockedSegments(segmentationId);

    const { representationData } =
      segmentationState.getSegmentation(segmentationId);

    const labelmapData =
      representationData[SegmentationRepresentations.Labelmap];

    if (isVolumeSegmentation(labelmapData, viewport)) {
      const { volumeId } = representationData[
        type
      ] as LabelmapSegmentationDataVolume;
      const actors = viewport.getActors();

      // we used to take the first actor here but we should take the one that is
      // probably the same size as the segmentation volume
      const volumes = actors.map((actorEntry) =>
        cache.getVolume(actorEntry.referenceId)
      );

      const segmentationVolume = cache.getVolume(volumeId);

      const referencedVolumeIdToThreshold =
        volumes.find((volume) =>
          csUtils.isEqual(volume.dimensions, segmentationVolume.dimensions)
        )?.volumeId || volumes[0]?.volumeId;

      return {
        volumeId,
        referencedVolumeId:
          this.configuration.thresholdVolumeId ?? referencedVolumeIdToThreshold,
        segmentsLocked,
        segmentationRepresentationUID,
      };
    } else {
      const { imageIdReferenceMap } =
        labelmapData as LabelmapSegmentationDataStack;

      const currentImageId = viewport.getCurrentImageId();

      if (!imageIdReferenceMap.get(currentImageId)) {
        // if there is no stack segmentation slice for the current image
        // we should not allow the user to perform any operation
        return;
      }

      // here we should identify if we can perform sphere manipulation
      // for these stack of images, if the metadata is not present
      // to create a volume or if there are inconsistencies between
      // the image metadata we should not allow the sphere manipulation
      // and should throw an error or maybe simply just allow circle manipulation
      // and not sphere manipulation
      if (this.configuration.activeStrategy.includes('SPHERE')) {
        throw new Error(
          'Sphere manipulation is not supported for stacks of image segmentations yet'
        );
        // Todo: add sphere (volumetric) manipulation support for stacks of images
        // we should basically check if the stack constructs a valid volume
        // meaning all the metadata is present and consistent
        // then we use a VoxelManager mapping to map a volume like appearance
        // for the stack data.
        // csUtils.isValidVolume(referencedImageIds
      }

      return {
        imageIdReferenceMap,
        segmentsLocked,
        segmentationRepresentationUID,
      };
    }
  }

  /**
   * Creates the data needed for hovering or clicking into a segmentation to
   * start editing the segmentation labelmap.
   */
  protected createHoverData(element, centerCanvas?) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const viewportIdsToRender = [viewport.id];

    const {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
    } = this.getActiveSegmentationData() || {};

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
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
      viewportIdsToRender,
    };
  }

  /**
   * Gets the segmentation data that is currently active, along with the
   * color and segment index that is active.
   */
  protected getActiveSegmentationData() {
    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      console.warn(
        'No active segmentation detected, create one before using the brush tool'
      );
      return;
    }

    const { segmentationRepresentationUID, segmentationId } =
      activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);

    const segmentColor = segmentationConfig.color.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    return {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
    };
  }

  /**
   * Adds a preview that can be filled with data.
   */
  public addPreview(
    element = this._previewData.element,
    options?: { acceptReject: boolean }
  ) {
    const acceptReject = options?.acceptReject;
    if (acceptReject === true) {
      this.acceptPreview(element);
    } else if (acceptReject === false) {
      this.rejectPreview(element);
    }
    const enabledElement = getEnabledElement(element);
    this._previewData.preview = this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.AddPreview
    );
    this._previewData.isDrag = true;
    return this._previewData.preview;
  }

  /**
   * Cancels any preview view being shown, resetting any segments being shown.
   */
  public rejectPreview(element = this._previewData.element) {
    if (!element || !this._previewData.preview) {
      return;
    }
    const enabledElement = getEnabledElement(element);
    this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.RejectPreview
    );
    this._previewData.preview = null;
    this._previewData.isDrag = false;
  }

  /**
   * Accepts a preview, marking it as the active segment.
   */
  public acceptPreview(element = this._previewData.element) {
    if (!element || !this._previewData?.preview) {
      return;
    }
    this.doneEditMemo();
    const enabledElement = getEnabledElement(element);

    this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.AcceptPreview
    );
    this._previewData.isDrag = false;
    this._previewData.preview = null;
    // Store the edit memo too
    this.doneEditMemo();
  }

  protected getOperationData(element?) {
    const editData = this._editData || this.createEditData(element);

    const {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      brushCursor,
    } = this._hoverData || this.createHoverData(element);
    const { data, metadata = {} } = brushCursor || {};
    const { viewPlaneNormal, viewUp } = metadata;
    const operationData = {
      ...editData,
      points: data?.handles?.points,
      segmentIndex,
      previewColors:
        this.configuration.preview?.enabled || this._previewData.preview
          ? this.configuration.preview.previewColors
          : null,
      viewPlaneNormal,
      toolGroupId: this.toolGroupId,
      segmentationId,
      segmentationRepresentationUID,
      viewUp,
      strategySpecificConfiguration:
        this.configuration.strategySpecificConfiguration,
      // Provide the preview information so that data can be used directly
      preview: this._previewData?.preview,
      configuration: this.configuration,
      createMemo: this.createMemo.bind(this),
    };
    return operationData;
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
    const annotations = annotationState.getAllAnnotations();
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

    const toolGroup = ToolGroupManager.getToolGroupForViewport(
      viewport.id,
      viewport.getRenderingEngine().id
    );
    // TODO - allow configuration of the tool, or make this a member function?
    const tool = toolGroup.getToolInstance('ThresholdCircle');
    const preview = tool.addPreview(viewport.element);
    const { memo, segmentationId } = preview;
    const previewVoxels = memo?.voxelManager || preview.previewVoxelManager;
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

      const activeIndex =
        segmentIndexController.getActiveSegmentIndex(segmentationId);
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
        annotationState.removeAnnotation(annotation.annotationUID);
      }
    }

    const slices = previewVoxels.getArrayOfSlices();
    triggerSegmentationDataModified(segmentationId, slices);
  }
}
