import { vec3 } from 'gl-matrix';
import { cache, getEnabledElement, StackViewport } from '@cornerstonejs/core';

import type { Types } from '@cornerstonejs/core';
import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { AnnotationTool, BaseTool } from '../base';
import { fillInsideSphere } from './strategies/fillSphere';
import { eraseInsideSphere } from './strategies/eraseSphere';
import {
  addAnnotation,
  getAnnotations,
  getAnnotation,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import {
  thresholdInsideCircle,
  fillInsideCircle,
} from './strategies/fillCircle';
import { eraseInsideCircle } from './strategies/eraseCircle';
import { Events, ToolModes } from '../../enums';
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
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import { LabelmapSegmentationData } from '../../types/LabelmapTypes';
import { BrushCursor } from '../../types/ToolSpecificAnnotationTypes';

/**
 * @public
 */
class BrushTool extends AnnotationTool {
  static toolName;
  private _editData: {
    segmentation: Types.IImageVolume;
    imageVolume: Types.IImageVolume; //
    segmentsLocked: number[]; //
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
          THRESHOLD_INSIDE_CIRCLE: thresholdInsideCircle,
          ERASE_INSIDE_CIRCLE: eraseInsideCircle,
          FILL_INSIDE_SPHERE: fillInsideSphere,
          ERASE_INSIDE_SPHERE: eraseInsideSphere,
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

  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): BrushCursor => {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;

    const enabledElement = getEnabledElement(element);
    const worldPos = currentPoints.world;
    const { viewport, renderingEngine } = enabledElement;

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet');
    }

    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using the brush tool'
      );
    }

    const { segmentationId, type } = activeSegmentationRepresentation;
    const segmentsLocked = segmentLocking.getLockedSegments(segmentationId);

    const { representationData } =
      segmentationState.getSegmentation(segmentationId);

    // Todo: are we going to support contour editing with this tool?
    const { volumeId } = representationData[type] as LabelmapSegmentationData;
    const segmentation = cache.getVolume(volumeId);

    const actors = viewport.getActors();

    // Note: For tools that need the source data. Assumed to use
    // First volume actor for now.
    const firstVolumeActorUID = actors[0].uid;
    const imageVolume = cache.getVolume(firstVolumeActorUID);

    const viewportIdsToRender = [viewport.id];

    this._editData = {
      segmentation,
      imageVolume,
      segmentsLocked,
    };

    hideElementCursor(element);

    this._addAnnotation(viewport, worldPos);
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  private _addAnnotation = (viewport, worldPos) => {
    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();
    const camera = viewport.getCamera();

    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      annotationUID: 'brushCursorUID',
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        handles: {
          points: [[...this._calculateBrushLocation(viewport, worldPos)]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        label: '',
        cachedStats: {},
      },
    };

    addAnnotation(annotation, viewport.element);

    return annotation;
  };

  mouseMoveCallback = (evt: EventTypes.InteractionEventType) => {
    if (this.mode === ToolModes.Active) {
      this._updateBrushLocation(evt);
    }
  };

  private _updateBrushLocation(
    evt: EventTypes.InteractionEventType,
    drag = false
  ) {
    const eventData = evt.detail;
    const { element } = eventData;
    const { currentPoints } = eventData;
    const centerCanvas = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

    let annotation = getAnnotation('brushCursorUID');

    if (!annotation || !drag) {
      annotation = this._addAnnotation(viewport, currentPoints.world);
    }

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

    this._hoverData = {
      centerCanvas,
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
      viewportIdsToRender,
    };

    if (drag) {
      const pos = this._calculateBrushLocation(viewport, centerCanvas);
      annotation.data.handles.points.push(pos);
      annotation.data.invalidated = false;
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this._updateBrushLocation(evt, true);

    const { viewportIdsToRender } = this._hoverData;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  private _calculateBrushLocation(viewport, centerCanvas) {
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

    return [
      bottomCursorInWorld,
      topCursorInWorld,
      leftCursorInWorld,
      rightCursorInWorld,
    ];
  }

  private _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { imageVolume, segmentation, segmentsLocked } = this._editData;
    const { segmentIndex, segmentationId, segmentationRepresentationUID } =
      this._hoverData;

    const annotation = getAnnotation('brushCursorUID');
    const { viewPlaneNormal, viewUp } = annotation.metadata;

    this._deactivateDraw(element);

    resetElementCursor(element);
    removeAnnotation('brushCursorUID');

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this._editData = null;
    this._updateBrushLocation(evt);

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet');
    }

    const operationData = {
      points: annotation.data.handles.points,
      volume: segmentation,
      imageVolume,
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      toolGroupId: this.toolGroupId,
      segmentationId,
      segmentationRepresentationUID,
      viewUp,
      strategySpecificConfiguration:
        this.configuration.strategySpecificConfiguration,
    };

    this.applyActiveStrategy(enabledElement, operationData);

    triggerAnnotationRenderForViewportIds;
  };

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
  ): boolean {
    const renderStatus = false;
    if (!this._hoverData) {
      return;
    }

    const { viewport } = enabledElement;
    const { element } = viewport;

    const viewportIdsToRender = this._hoverData.viewportIdsToRender;

    if (!viewportIdsToRender.includes(viewport.id)) {
      return;
    }

    let annotations = getAnnotations(this.getToolName(), viewport.element);

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    // const brushCursor = this._hoverData.brushCursor;

    // if (brushCursor.data.invalidated === true) {
    //   const { centerCanvas } = this._hoverData;
    //   // This can be set true when changing the brush size programmatically
    //   // whilst the cursor is being rendered.
    //   this._calculateBrushLocation(viewport, centerCanvas);
    // }

    const segmentColor = this._hoverData.segmentColor;
    const annotationUID = 'brushCursorUID';
    let counter = 0;
    annotations.forEach((toolData) => {
      const data = toolData.data;
      const { points: pointsList } = data.handles;

      pointsList.map((points) => {
        const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

        const bottom = canvasCoordinates[0];
        const top = canvasCoordinates[1];

        const center = [
          Math.floor((bottom[0] + top[0]) / 2),
          Math.floor((bottom[1] + top[1]) / 2),
        ];

        const radius = Math.abs(
          bottom[1] - Math.floor((bottom[1] + top[1]) / 2)
        );

        const color = `rgb(${segmentColor.slice(0, 3)})`;

        // If rendering engine has been destroyed while rendering
        if (!viewport.getRenderingEngine()) {
          console.warn('Rendering Engine has been destroyed');
          return;
        }

        const circleUID = '0';
        drawCircleSvg(
          svgDrawingHelper,
          `${annotationUID}-${counter++}`,
          circleUID,
          center as Types.Point2,
          radius,
          {
            color,
            lineWidth: 1,
            strokeOpacity: 0.5,
          }
        );
      });
    });
  }
}

BrushTool.toolName = 'Brush';
export default BrushTool;
