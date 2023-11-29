import { utilities as csUtils, getEnabledElement } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import type { Types } from '@cornerstonejs/core';
import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { BaseTool } from '../base';
import {
  fillInsideSphere,
  thresholdInsideSphere,
} from './strategies/fillSphere';
import { eraseInsideSphere } from './strategies/eraseSphere';
import {
  thresholdInsideCircle,
  fillInsideCircle,
} from './strategies/fillCircle';
import { eraseInsideCircle } from './strategies/eraseCircle';
import { Events, ToolModes, SegmentationRepresentations } from '../../enums';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  config as segmentationConfig,
  segmentLocking,
  segmentIndex as segmentIndexController,
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import {
  LabelmapSegmentationDataVolume,
  LabelmapSegmentationDataStack,
} from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from './strategies/utils/stackVolumeCheck';

/**
 * @public
 */
class BrushTool extends BaseTool {
  static toolName;
  private _editData: {
    segmentsLocked: number[]; //
    segmentationRepresentationUID?: string;
    imageIdReferenceMap?: Map<string, string>;
    volumeId?: string;
    referencedVolumeId?: string;
  } | null;
  private _hoverData?: {
    brushCursor: any;
    segmentationId: string;
    segmentIndex: number;
    segmentationRepresentationUID: string;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    centerCanvas?: Array<number>;
  };

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE_CIRCLE: fillInsideCircle,
          ERASE_INSIDE_CIRCLE: eraseInsideCircle,
          FILL_INSIDE_SPHERE: fillInsideSphere,
          ERASE_INSIDE_SPHERE: eraseInsideSphere,
          THRESHOLD_INSIDE_CIRCLE: thresholdInsideCircle,
          THRESHOLD_INSIDE_SPHERE: thresholdInsideSphere,
        },
        strategySpecificConfiguration: {
          THRESHOLD_INSIDE_CIRCLE: {
            threshold: [-150, -70], // E.g. CT Fat // Only used during threshold strategies.
          },
        },
        defaultStrategy: 'FILL_INSIDE_CIRCLE',
        activeStrategy: 'FILL_INSIDE_CIRCLE',
        brushSize: 25,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  onSetToolPassive = () => {
    this.disableCursor();
  };

  onSetToolEnabled = () => {
    this.disableCursor();
  };

  onSetToolDisabled = () => {
    this.disableCursor();
  };

  private disableCursor() {
    this._hoverData = undefined;
  }
  createEditData(element) {
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using the brush tool'
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

    const viewportIdsToRender = [viewport.id];

    if (isVolumeSegmentation(labelmapData)) {
      const { volumeId } = representationData[
        type
      ] as LabelmapSegmentationDataVolume;
      const actors = viewport.getActors();

      // Note: For tools that need the source data. Assumed to use
      // First volume actor for now.
      const firstVolumeActorUID = actors[0].uid;

      return {
        volumeId,
        referencedVolumeId: firstVolumeActorUID,
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
        console.warn(
          'Sphere manipulation is not supported for this stack of images yet'
        );
        return;

        // Todo: add sphere (volumetric) manipulation support for stacks of images
        // we should basically check if the stack constructs a valid volume
        // meaning all the metadata is present and consistent
        // then we use a VoxelValue mapping to map a volume like appearance
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

  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this._editData = this.createEditData(element);
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      this._hoverData.viewportIdsToRender
    );

    // TODO - this should move to click event
    this.acceptPreview(element);

    this.applyActiveStrategyEvent(
      enabledElement,
      this.getOperationData(),
      'initDown'
    );

    return true;
  };

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this.mode === ToolModes.Active) {
      this.updateCursor(evt);
    }
  };

  private createHoverData(element, centerCanvas?) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

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

    const viewportIdsToRender = [viewport.id];

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
   * Updates the cursor position and whether it is showing or not.
   * Can be over-ridden to add more cursor details or a preview.
   */
  protected updateCursor(evt: EventTypes.InteractionEventType) {
    const eventData = evt.detail;
    const { element } = eventData;
    const { currentPoints } = eventData;
    const centerCanvas = currentPoints.canvas;
    this._hoverData = this.createHoverData(element, centerCanvas);

    this._calculateCursor(element, centerCanvas);

    triggerAnnotationRenderForViewportUIDs(
      getEnabledElement(element).renderingEngine,
      this._hoverData.viewportIdsToRender
    );
  }

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this.updateCursor(evt);

    const { viewportIdsToRender } = this._hoverData;

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportIdsToRender
    );

    this.applyActiveStrategy(enabledElement, this.getOperationData());
  };

  protected getOperationData(element?) {
    const editData = this._editData || this.createEditData(element);

    const {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      brushCursor,
    } = this._hoverData || this.createHoverData(element);
    const previewSegmentIndex =
      segmentIndexController.getPreviewSegmentIndex(segmentationId);
    const { data, metadata = {} } = brushCursor || {};
    const { viewPlaneNormal, viewUp } = metadata;
    const operationData = {
      ...editData,
      points: data?.handles?.points,
      segmentIndex,
      previewSegmentIndex,
      viewPlaneNormal,
      toolGroupId: this.toolGroupId,
      segmentationId,
      segmentationRepresentationUID,
      viewUp,
      strategySpecificConfiguration:
        this.configuration.strategySpecificConfiguration,
    };
    return operationData;
  }

  private _calculateCursor(element, centerCanvas) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvasToWorld } = viewport;
    const camera = viewport.getCamera();
    const { brushSize } = this.configuration;

    const viewUp = vec3.fromValues(
      camera.viewUp[0],
      camera.viewUp[1],
      camera.viewUp[2]
    );
    const viewPlaneNormal = vec3.fromValues(
      camera.viewPlaneNormal[0],
      camera.viewPlaneNormal[1],
      camera.viewPlaneNormal[2]
    );
    const viewRight = vec3.create();

    vec3.cross(viewRight, viewUp, viewPlaneNormal);

    // in the world coordinate system, the brushSize is the radius of the circle
    // in mm
    const centerCursorInWorld: Types.Point3 = canvasToWorld([
      centerCanvas[0],
      centerCanvas[1],
    ]);

    const bottomCursorInWorld = vec3.create();
    const topCursorInWorld = vec3.create();
    const leftCursorInWorld = vec3.create();
    const rightCursorInWorld = vec3.create();

    // Calculate the bottom and top points of the circle in world coordinates
    for (let i = 0; i <= 2; i++) {
      bottomCursorInWorld[i] = centerCursorInWorld[i] - viewUp[i] * brushSize;
      topCursorInWorld[i] = centerCursorInWorld[i] + viewUp[i] * brushSize;
      leftCursorInWorld[i] = centerCursorInWorld[i] - viewRight[i] * brushSize;
      rightCursorInWorld[i] = centerCursorInWorld[i] + viewRight[i] * brushSize;
    }

    const { brushCursor } = this._hoverData;
    const { data } = brushCursor;

    if (data.handles === undefined) {
      data.handles = {};
    }

    data.handles.points = [
      bottomCursorInWorld,
      topCursorInWorld,
      leftCursorInWorld,
      rightCursorInWorld,
    ];

    data.invalidated = false;
  }

  private _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);

    const operationData = this.getOperationData(element);
    this.applyActiveStrategy(enabledElement, operationData);

    this._deactivateDraw(element);

    resetElementCursor(element);

    this.updateCursor(evt);

    this._editData = null;

    this.applyActiveStrategyEvent(enabledElement, operationData, 'completeUp');
  };

  /**
   * Cancels any preview view being shown, resetting any segments being shown.
   */
  public cancelPreview(element) {
    const enabledElement = getEnabledElement(element);
    this.applyActiveStrategyEvent(
      enabledElement,
      this.getOperationData(element),
      'cancelPreview'
    );
  }

  /**
   * Accepts a preview, marking it as the active segment.
   */
  public acceptPreview(element) {
    const enabledElement = getEnabledElement(element);

    this.applyActiveStrategyEvent(
      enabledElement,
      this.getOperationData(enabledElement),
      'acceptPreview'
    );
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  private _activateDraw = (element: HTMLDivElement): void => {
    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  private _deactivateDraw = (element: HTMLDivElement): void => {
    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );
  };

  public invalidateBrushCursor() {
    if (this._hoverData !== undefined) {
      const { data } = this._hoverData.brushCursor;

      data.invalidated = true;
    }
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    if (!this._hoverData) {
      return;
    }

    const { viewport } = enabledElement;

    const viewportIdsToRender = this._hoverData.viewportIdsToRender;

    if (!viewportIdsToRender.includes(viewport.id)) {
      return;
    }

    const brushCursor = this._hoverData.brushCursor;

    if (brushCursor.data.invalidated === true) {
      const { centerCanvas } = this._hoverData;
      const { element } = viewport;

      // This can be set true when changing the brush size programmatically
      // whilst the cursor is being rendered.
      this._calculateCursor(element, centerCanvas);
    }

    const toolMetadata = brushCursor.metadata;
    const annotationUID = toolMetadata.brushCursorUID;

    const data = brushCursor.data;
    const { points } = data.handles;
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

    const bottom = canvasCoordinates[0];
    const top = canvasCoordinates[1];

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ];

    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2));

    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }

    const circleUID = '0';
    drawCircleSvg(
      svgDrawingHelper,
      annotationUID,
      circleUID,
      center as Types.Point2,
      radius,
      {
        color,
      }
    );
    const circleUID1 = '1';
    drawCircleSvg(
      svgDrawingHelper,
      annotationUID,
      circleUID1,
      center as Types.Point2,
      2,
      {
        color,
      }
    );
  }
}

BrushTool.toolName = 'Brush';
export default BrushTool;
