import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3, vec2 } from 'gl-matrix';

import type {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import {
  fillInsideSphere,
  thresholdInsideSphere,
  thresholdInsideSphereIsland,
} from './strategies/fillSphere';
import { eraseInsideSphere } from './strategies/eraseSphere';
import {
  thresholdInsideCircle,
  fillInsideCircle,
} from './strategies/fillCircle';
import { eraseInsideCircle } from './strategies/eraseCircle';
import { Events, ToolModes, StrategyCallbacks } from '../../enums';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportIds';
import LabelmapBaseTool from './LabelmapBaseTool';

/**
 * @public
 */
class BrushTool extends LabelmapBaseTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          /** Perform fill of the active segment index inside a (2d) circle */
          FILL_INSIDE_CIRCLE: fillInsideCircle,
          /** Erase (to 0) inside a circle */
          ERASE_INSIDE_CIRCLE: eraseInsideCircle,
          /** Fill a 3d sphere with the active segment index */
          FILL_INSIDE_SPHERE: fillInsideSphere,
          /** Erase inside a 3d sphere, clearing any segment index (to 0) */
          ERASE_INSIDE_SPHERE: eraseInsideSphere,
          /**
           * Threshold inside a circle, either with a dynamic threshold value
           * based on the voxels in a 2d plane around the center click.
           * Performs island removal.
           */
          THRESHOLD_INSIDE_CIRCLE: thresholdInsideCircle,
          /**
           * Threshold inside a sphere, either dynamic or pre-configured.
           * For dynamic, base the threshold on a 2d CIRCLE around the center click.
           * Do not perform island removal (this may be slow)
           * Users may see delays dragging the sphere for large radius values and
           * for complex mixtures of texture.
           */
          THRESHOLD_INSIDE_SPHERE: thresholdInsideSphere,
          /**
           * Threshold inside a sphere, but also include island removal.
           * The current implementation of this is fairly fast now, but users may
           * see delays when island removal occurs on large sections of the volume.
           */
          THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL:
            thresholdInsideSphereIsland,
        },

        strategySpecificConfiguration: {
          THRESHOLD: {
            threshold: [-150, -70], // E.g. CT Fat // Only used during threshold strategies.
          },
        },
        defaultStrategy: 'FILL_INSIDE_CIRCLE',
        activeStrategy: 'FILL_INSIDE_CIRCLE',
        thresholdVolumeId: null,
        brushSize: 25,
        preview: {
          // Have to enable the preview to use this
          enabled: false,
          previewColors: {},
          // The time before showing a preview
          previewTimeMs: 250,
          // The distance to move to show a preview before preview time expired
          previewMoveDistance: 8,
          // The distance to drag before being considered a drag rather than click
          dragMoveDistance: 4,
          // The time to consider a mouse click a drag when moved less than dragMoveDistance
          dragTimeMs: 500,
        },
        actions: {
          [StrategyCallbacks.AcceptPreview]: {
            method: StrategyCallbacks.AcceptPreview,
            bindings: [
              {
                key: 'Enter',
              },
            ],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  onSetToolPassive = (evt) => {
    this.disableCursor();
  };

  onSetToolEnabled = () => {
    this.disableCursor();
  };

  onSetToolDisabled = (evt) => {
    this.disableCursor();
  };

  private disableCursor() {
    this._hoverData = undefined;
    this.rejectPreview();
  }

  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);

    // @ts-expect-error
    this._editData = this.createEditData(element);
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    // This might be a mouse down
    this._previewData.isDrag = false;
    this._previewData.timerStart = Date.now();

    const hoverData = this._hoverData || this.createHoverData(element);

    triggerAnnotationRenderForViewportUIDs(hoverData.viewportIdsToRender);

    const operationData = this.getOperationData(element);

    this.applyActiveStrategyCallback(
      enabledElement,
      operationData,
      StrategyCallbacks.OnInteractionStart
    );

    return true;
  };

  /**
   * This call will be made when the mouse moves and the tool is active, but
   * not actually drawing at the moment.
   * The behavior is:
   *    1. Update the cursor
   *    2. Call the active strategy event 'preview' and 'rejectPreview'
   *       on the mouse cursor position on a periodic basis to create a preview
   *       when configured to do so.
   *
   * The preview will be shown after the mouse has been stationary for 250 ms.
   * Any preview will be cancelled (immediately) after moving outside the center
   * distance.
   * As well, if the mouse moves but stays inside the center area for 250 ms,
   * then the cancel will happen with a new preview being added.
   *
   * See mouse up details for how the preview gets accepted.
   *
   * The preview also needs to be cancelled on changing tools.
   */
  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this.mode === ToolModes.Active) {
      this.updateCursor(evt);
      if (!this.configuration.preview.enabled) {
        return;
      }
      const { previewTimeMs, previewMoveDistance, dragMoveDistance } =
        this.configuration.preview;
      const { currentPoints, element } = evt.detail;
      const { canvas } = currentPoints;

      const { preview, startPoint, timer, timerStart, isDrag } =
        this._previewData;
      const delta = vec2.distance(canvas, startPoint);
      const time = Date.now() - timerStart;
      if (
        delta > previewMoveDistance ||
        (time > previewTimeMs && delta > dragMoveDistance)
      ) {
        if (timer) {
          window.clearTimeout(timer);
          this._previewData.timer = null;
        }
        if (preview && !isDrag) {
          this.rejectPreview(element);
        }
      }
      if (!this._previewData.timer) {
        const timer = window.setTimeout(this.previewCallback, 250);
        Object.assign(this._previewData, {
          timerStart: Date.now(),
          timer,
          startPoint: canvas,
          element,
        });
      }
    }
  };

  previewCallback = () => {
    this._previewData.timer = null;
    if (this._previewData.preview) {
      return;
    }
    this._previewData.preview = this.applyActiveStrategyCallback(
      getEnabledElement(this._previewData.element),
      this.getOperationData(this._previewData.element),
      StrategyCallbacks.Preview
    );
  };

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

    if (!this._hoverData) {
      return;
    }

    triggerAnnotationRenderForViewportUIDs(this._hoverData.viewportIdsToRender);
  }

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;
    const enabledElement = getEnabledElement(element);

    this.updateCursor(evt);

    const { viewportIdsToRender } = this._hoverData;

    triggerAnnotationRenderForViewportUIDs(viewportIdsToRender);

    const delta = vec2.distance(
      currentPoints.canvas,
      this._previewData.startPoint
    );
    const { dragTimeMs, dragMoveDistance } = this.configuration.preview;
    if (
      !this._previewData.isDrag &&
      this._previewData.preview &&
      Date.now() - this._previewData.timerStart < dragTimeMs &&
      delta < dragMoveDistance
    ) {
      // If we are showing a preview, then don't start dragging quite immediately
      // so that click up can accept the preview.
      return;
    }

    this._previewData.preview = this.applyActiveStrategy(
      enabledElement,
      this.getOperationData(element)
    );
    this._previewData.element = element;
    // Add a bit of time to the timer start so small accidental movements dont
    // cause issues on clicking
    this._previewData.timerStart = Date.now() + dragTimeMs;
    this._previewData.isDrag = true;
    this._previewData.startPoint = currentPoints.canvas;
  };

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

    if (!this._hoverData) {
      return;
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

    const activeStrategy = this.configuration.activeStrategy;
    const strategy = this.configuration.strategies[activeStrategy];

    // Note: i don't think this is the best way to implement this
    // but don't think we have a better way to do it for now
    if (typeof strategy?.computeInnerCircleRadius === 'function') {
      strategy.computeInnerCircleRadius({
        configuration: this.configuration,
        viewport,
      });
    }

    data.invalidated = false;
  }

  /**
   * The end callback call is made when the mouse is released.  This will
   * perform another active strategy render event to render the final position.
   * As well, the finish strategy callback will be made during this time.
   */
  private _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);

    const operationData = this.getOperationData(element);
    // Don't re-fill when the preview is showing and the user clicks again
    // otherwise the new area of hover may get filled, which is unexpected
    if (!this._previewData.preview && !this._previewData.isDrag) {
      this.applyActiveStrategy(enabledElement, operationData);
    }

    this.doneEditMemo();
    this._deactivateDraw(element);

    resetElementCursor(element);

    this.updateCursor(evt);

    this._editData = null;

    this.applyActiveStrategyCallback(
      enabledElement,
      operationData,
      StrategyCallbacks.OnInteractionEnd
    );

    if (!this._previewData.isDrag) {
      this.acceptPreview(element);
    }
  };

  public getStatistics(element, segmentIndices?) {
    if (!element) {
      return;
    }
    const enabledElement = getEnabledElement(element);
    const stats = this.applyActiveStrategyCallback(
      enabledElement,
      this.getOperationData(element),
      StrategyCallbacks.GetStatistics,
      segmentIndices
    );

    return stats;
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
    if (this._hoverData === undefined) {
      return;
    }
    const { data } = this._hoverData.brushCursor;
    const { viewport } = this._hoverData;

    data.invalidated = true;

    // Todo: figure out if other brush metadata (other than segment color) should get updated
    // during the brush cursor invalidation
    const { segmentColor } = this.getActiveSegmentationData(viewport) || {};
    this._hoverData.brushCursor.metadata.segmentColor = segmentColor;
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
    if (!toolMetadata) {
      return;
    }

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

    const color = `rgb(${toolMetadata.segmentColor?.slice(0, 3) || [0, 0, 0]})`;

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

    const activeStrategy = this.configuration.activeStrategy;
    const { dynamicRadiusInCanvas } = this.configuration
      .strategySpecificConfiguration[activeStrategy] || {
      dynamicRadiusInCanvas: 0,
    };

    if (dynamicRadiusInCanvas) {
      const circleUID1 = '1';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID1,
        center as Types.Point2,
        dynamicRadiusInCanvas,
        {
          color,
        }
      );
    }
  }
}

BrushTool.toolName = 'Brush';
export default BrushTool;
