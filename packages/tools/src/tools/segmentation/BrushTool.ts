import { cache, getEnabledElement, StackViewport } from '@cornerstonejs/core';

import type { Types } from '@cornerstonejs/core';
import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { BaseTool } from '../base';
import { fillInsideSphere } from './strategies/fillSphere';
import { eraseInsideSphere } from './strategies/eraseSphere';
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

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  config as segmentationConfig,
  segmentLocking,
  segmentIndex as segmentIndexController,
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import { LabelmapSegmentationData } from '../../types/LabelmapTypes';

/**
 * @public
 */
class BrushTool extends BaseTool {
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

  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventData = evt.detail;
    const { element } = eventData;

    const enabledElement = getEnabledElement(element);
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

    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportIdsToRender
    );

    return true;
  };

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this.mode === ToolModes.Active) {
      this.updateCursor(evt);
    }
  };

  private updateCursor(evt: EventTypes.InteractionEventType) {
    const eventData = evt.detail;
    const { element } = eventData;
    const { currentPoints } = eventData;
    const centerCanvas = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

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

    this._hoverData = {
      brushCursor,
      centerCanvas,
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
      viewportIdsToRender,
    };

    this._calculateCursor(element, centerCanvas);

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportIdsToRender
    );
  }

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const { imageVolume, segmentation, segmentsLocked } = this._editData;

    this.updateCursor(evt);

    const {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      brushCursor,
      viewportIdsToRender,
    } = this._hoverData;

    const { data } = brushCursor;
    const { viewPlaneNormal, viewUp } = brushCursor.metadata;

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportIdsToRender
    );

    const operationData = {
      points: data.handles.points,
      volume: segmentation, // todo: just pass the segmentationId instead
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
  };

  private _calculateCursor(element, centerCanvas) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvasToWorld } = viewport;
    const { brushSize } = this.configuration;
    // Center of circle in canvas Coordinates

    const radius = brushSize;

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

    const { brushCursor } = this._hoverData;
    const { data } = brushCursor;

    if (data.handles === undefined) {
      data.handles = {};
    }

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ];

    data.invalidated = false;
  }

  private _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { imageVolume, segmentation, segmentsLocked } = this._editData;
    const {
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      brushCursor,
    } = this._hoverData;

    const { data } = brushCursor;
    const { viewPlaneNormal, viewUp } = brushCursor.metadata;

    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this._editData = null;
    this.updateCursor(evt);

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet');
    }

    const operationData = {
      points: data.handles.points,
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
  }
}

BrushTool.toolName = 'Brush';
export default BrushTool;
