import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
  Annotation,
} from '../../types';

import { fillInsideSphere } from './strategies/fillSphere';
import { eraseInsideSphere } from './strategies/eraseSphere';
import { Events, SegmentationRepresentations } from '../../enums';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  config as segmentationConfig,
  segmentLocking,
  segmentIndex as segmentIndexController,
  activeSegmentation,
} from '../../stateManagement/segmentation';

import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import LabelmapBaseTool from './LabelmapBaseTool';

/**
 * Tool for manipulating segmentation data by drawing a sphere in 3d space. It acts on the
 * active Segmentation on the viewport (enabled element) and requires an active
 * segmentation to be already present. By default it will use the activeSegmentIndex
 * for the segmentation to modify. You can use SegmentationModule to set the active
 * segmentation and segmentIndex. Todo: sphere scissor has some memory problem which
 * lead to ui blocking behavior that needs to be fixed.
 */
class SphereScissorsTool extends LabelmapBaseTool {
  static toolName;
  editData: {
    annotation: Annotation;
    segmentIndex: number;
    segmentsLocked: number[];
    segmentationId: string;
    // volume labelmap
    volumeId: string;
    referencedVolumeId: string;
    // stack labelmap
    imageId: string;
    //
    toolGroupId: string;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    centerCanvas?: Array<number>;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideSphere,
          ERASE_INSIDE: eraseInsideSphere,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the enabledElement, it
   * finds the active segmentation info and use it for the current tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  preMouseDownCallback = (evt: EventTypes.InteractionEventType): true => {
    // if we are already drawing, means we have started with a click, and now we
    // are moving the mouse (not dragging) so the final click should not
    // be handled by this preMouseDownCallback but rather the endCallback
    if (this.isDrawing === true) {
      return;
    }

    this.doneEditMemo();
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentation(viewport.id);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { segmentationId } = activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const segmentsLocked =
      segmentLocking.getLockedSegmentIndices(segmentationId);

    const segmentColor = segmentationConfig.color.getSegmentIndexColor(
      viewport.id,
      segmentationId,
      segmentIndex
    );

    this.isDrawing = true;

    // Used for drawing the svg only, we might not need it at all
    const annotation = {
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.getToolName(),
        segmentColor,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            [...worldPos],
            [...worldPos],
            [...worldPos],
            [...worldPos],
          ] as Types.Point3[],
          activeHandleIndex: null,
        },
        cachedStats: {},
        highlighted: true,
      },
    };

    const viewportIdsToRender = [viewport.id];

    this.editData = {
      annotation,
      centerCanvas: canvasPos,
      segmentIndex,
      segmentationId,
      segmentsLocked,
      segmentColor,
      toolGroupId: this.toolGroupId,
      viewportIdsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
      volumeId: null,
      referencedVolumeId: null,
      imageId: null,
    };

    const { representationData } = getSegmentation(segmentationId);

    const editData = this.getEditData({
      viewport,
      representationData,
      segmentsLocked,
      segmentationId,
      volumeOperation: true,
    });

    this.editData = {
      ...this.editData,
      ...editData,
    };

    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return true;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    //////
    const { annotation, viewportIdsToRender, centerCanvas } = this.editData;
    const { data } = annotation;

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);
    const radius = Math.sqrt(dX * dX + dY * dY);

    const bottomCanvas: Types.Point2 = [
      centerCanvas[0],
      centerCanvas[1] + radius,
    ];
    const topCanvas: Types.Point2 = [centerCanvas[0], centerCanvas[1] - radius];
    const leftCanvas: Types.Point2 = [
      centerCanvas[0] - radius,
      centerCanvas[1],
    ];
    const rightCanvas: Types.Point2 = [
      centerCanvas[0] + radius,
      centerCanvas[1],
    ];

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ];

    annotation.invalidated = true;

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _endCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      newAnnotation,
      hasMoved,
      segmentIndex,
      segmentsLocked,
    } = this.editData;
    const { data } = annotation;
    const { viewPlaneNormal, viewUp } = annotation.metadata;

    if (newAnnotation && !hasMoved) {
      return;
    }
    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);

    const operationData = {
      ...this.editData,
      points: data.handles.points,
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      viewUp,
      createMemo: this.createMemo.bind(this),
    };

    this.editData = null;
    this.isDrawing = false;

    this.applyActiveStrategy(enabledElement, operationData);
    this.doneEditMemo();
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  _activateDraw = (element) => {
    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the sphereScissor annotation in each
   * request animation frame. Note that the annotation are disappeared
   * after the segmentation modification.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    if (!this.editData) {
      return renderStatus;
    }

    const { viewport } = enabledElement;
    const { viewportIdsToRender } = this.editData;

    if (!viewportIdsToRender.includes(viewport.id)) {
      return renderStatus;
    }

    const { annotation } = this.editData;

    // Todo: rectangle color based on segment index
    const toolMetadata = annotation.metadata;
    const annotationUID = annotation.annotationUID;

    const data = annotation.data;
    const { points } = data.handles;
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

    const bottom = canvasCoordinates[0];
    const top = canvasCoordinates[1];

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ];

    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2));

    // @ts-expect-error
    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return renderStatus;
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

    renderStatus = true;

    return renderStatus;
  };
}

SphereScissorsTool.toolName = 'SphereScissor';
export default SphereScissorsTool;
