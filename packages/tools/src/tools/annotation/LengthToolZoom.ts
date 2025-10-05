import { Events, ChangeTypes } from '../../enums';
import {
  getEnabledElement,
  utilities as csUtils,
  utilities,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { getCalibratedLengthUnitsAndScale } from '../../utilities/getCalibratedUnits';
import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import {
  deselectAnnotation,
  isAnnotationSelected,
} from '../../stateManagement/annotation/annotationSelection';
import * as lineSegment from '../../utilities/math/line';

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store/state';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import { MouseCursor } from '../../cursors';

import type {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  Annotations,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../types';
import type { LengthAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { getStyleProperty } from '../../stateManagement/annotation/config/helpers';

const { transformWorldToIndex } = csUtils;

const pointerCursor = MouseCursor.getDefinedCursor('pointer');

if (pointerCursor) {
  MouseCursor.setDefinedCursor('LengthZoom', pointerCursor);
}

const HANDLE_RADIUS = 8;
const HANDLE_COLOR = '#1284FF';
const HANDLE_FILL = '#ffffff';
const HANDLE_LINE_WIDTH = 2;
const ACTIVE_HANDLE_RADIUS = 12;
const MOVEMENT_EPSILON = 1e-3;
const HANDLE_MOVE_LINGER_FRAMES = 20;
const HANDLE_GLOW_RADIUS = 26;
const HANDLE_GLOW_COLOR_30 = 'rgba(18, 132, 255, 0.3)';
const HANDLE_GLOW_COLOR_50 = 'rgba(18, 132, 255, 0.5)';
const CROSSBAR_HALF_LENGTH = 8;
const HIGHLIGHT_LAYER_CLASS = 'lengthtool-zoom__highlight-layer';
const MAIN_LAYER_CLASS = 'lengthtool-zoom__main-layer';
const HANDLE_LAYER_CLASS = 'lengthtool-zoom__handle-layer';
const TEXTBOX_HORIZONTAL_OFFSET = HANDLE_RADIUS + 10;
const TEXTBOX_VERTICAL_OFFSET = ACTIVE_HANDLE_RADIUS + 16;
const TEXTBOX_PADDING = 12; // Must stay in sync with TEXTBOX_FIXED_STYLE padding
const TEXTBOX_BACKGROUND_PADDING = 4;
const MOVING_BACKGROUND_PADDING = 6;
const LENGTH_COLOR = 'rgb(var(--ui-2, 236, 102, 2))';
const LINK_LINE_DASH = '8,8';
const TEXTBOX_FIXED_STYLE = {
  color: 'var(--text-white, #FFF)',
  textShadow:
    '0 0 2px #000, 0 0 4px #000, -1px -1px 4px #000, 1px 1px 4px #000',
  borderColor: LENGTH_COLOR,
  borderWidth: 2,
  borderRadius: 3,
  padding: TEXTBOX_PADDING,
  backgroundPadding: TEXTBOX_BACKGROUND_PADDING,
};

type CreationStage = 'placingFirst' | 'placingSecond' | 'waitingSecond';
type LengthZoomMetadata = LengthAnnotation['metadata'] & {
  creationStage?: CreationStage;
};

/**
 * LengthToolZoom let you draw annotations that measures the length of two drawing
 * points on a slice. You can use the LengthToolZoom in all imaging planes even in oblique
 * reconstructed planes. Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(LengthToolZoom)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(LengthToolZoom.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(LengthToolZoom.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.

 */

class LengthToolZoom extends AnnotationTool {
  static toolName = 'LengthZoom';

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    stage?: 'placingFirst' | 'placingSecond';
    isHandleMoving?: boolean;
    handleMoveLinger?: number;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  private pendingAnnotation: LengthAnnotation | null;
  private _handleMoveAnimationFrame: number | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        getTextLines: defaultGetTextLines,
        actions: {
          // TODO - bind globally - but here is actually pretty good as it
          // is almost always active.
          undo: {
            method: 'undo',
            bindings: [{ key: 'z' }],
          },
          redo: {
            method: 'redo',
            bindings: [{ key: 'y' }],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );

    this.pendingAnnotation = null;
    this._handleMoveAnimationFrame = null;

    if (!toolProps.configuration?.getTextLines) {
      this.configuration.getTextLines = this._getTextLinesWithLabel;
    }
  }

  private _baseMouseMoveCallback = this.mouseMoveCallback;

  public mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredAnnotations?: Annotations
  ): boolean => {
    if (this.editData) {
      return this._baseMouseMoveCallback(evt, filteredAnnotations);
    }
    return false;
  };

  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: LengthToolZoom;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): LengthAnnotation => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      return;
    }
    const {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal,
      instance,
      viewport,
    } = this.hydrateBase<LengthToolZoom>(
      LengthToolZoom,
      enabledElement,
      points,
      options
    );

    // Exclude toolInstance from the options passed into the metadata
    const { toolInstance, ...serializableOptions } = options || {};

    const annotation = {
      annotationUID: options?.annotationUID || utilities.uuidv4(),
      data: {
        handles: {
          points,
        },
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        toolName: instance.getToolName(),
        viewPlaneNormal,
        FrameOfReferenceUID,
        referencedImageId,
        ...serializableOptions,
      },
    };
    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);
  };

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): LengthAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;

    if (
      this.pendingAnnotation &&
      (this.pendingAnnotation.metadata as LengthZoomMetadata)?.creationStage ===
        'waitingSecond'
    ) {
      return this._beginSecondPointPlacement(evt, this.pendingAnnotation);
    }

    const worldPos = currentPoints.world;

    hideElementCursor(element);
    this.isDrawing = true;

    const annotation = <LengthAnnotation>(
      this.createAnnotation(evt, [
        <Types.Point3>[...worldPos],
        <Types.Point3>[...worldPos],
      ])
    );

    (annotation.metadata as LengthZoomMetadata).creationStage = 'placingFirst';
    annotation.data.handles.activeHandleIndex = 0;

    this._assignAnnotationLabel(annotation, element);
    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 0,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
      stage: 'placingFirst',
      isHandleMoving: false,
      handleMoveLinger: 0,
    };
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    this.pendingAnnotation = annotation;

    return annotation;
  };

  public postMouseDownCallback = (
    evt: EventTypes.MouseDownEventType
  ): boolean => {
    if (
      this.pendingAnnotation &&
      (this.pendingAnnotation.metadata as LengthZoomMetadata)?.creationStage ===
        'waitingSecond'
    ) {
      return false;
    }

    if (this.editData?.stage === 'placingFirst' || this.isDrawing) {
      return false;
    }

    const { element } = evt.detail;
    const annotations = getAnnotations(this.getToolName(), element) ?? [];

    const shouldDeselect = annotations.some((annotation) => {
      const isSelected = isAnnotationSelected(annotation.annotationUID);
      const hasActiveHandle =
        annotation.data?.handles?.activeHandleIndex !== null &&
        annotation.data?.handles?.activeHandleIndex !== undefined;

      return isSelected || annotation.highlighted || hasActiveHandle;
    });

    if (!shouldDeselect) {
      return false;
    }

    const changed = this._deselectAllLengthAnnotations(element);

    if (changed) {
      const viewportIdsToRender = getViewportIdsWithToolToRender(
        element,
        this.getToolName()
      );
      triggerAnnotationRenderForViewportIds(viewportIdsToRender);
    }

    evt.preventDefault();

    return true;
  };

  private _beginSecondPointPlacement(
    evt: EventTypes.InteractionEventType,
    annotation: LengthAnnotation
  ): LengthAnnotation {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    hideElementCursor(element);
    this.isDrawing = true;

    const points = annotation.data.handles.points;
    points[1] = <Types.Point3>[...worldPos];
    (annotation.metadata as LengthZoomMetadata).creationStage = 'placingSecond';
    annotation.data.handles.activeHandleIndex = 1;
    annotation.highlighted = true;
    annotation.invalidated = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
      stage: 'placingSecond',
      isHandleMoving: false,
      handleMoveLinger: 0,
    };

    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    this.pendingAnnotation = annotation;

    return annotation;
  }

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: LengthAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;
    const [point1, point2] = data.handles.points;
    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);

    const line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    const distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: LengthAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;
    annotation.data.handles.activeHandleIndex = null;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
      isHandleMoving: false,
      handleMoveLinger: 0,
    };

    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: LengthAnnotation,
    handle: ToolHandle
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    if (movingTextBox || handleIndex === undefined || handleIndex === -1) {
      data.handles.activeHandleIndex = null;
    } else {
      data.handles.activeHandleIndex = handleIndex;
    }

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
      isHandleMoving: false,
      handleMoveLinger: 0,
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  }

  public getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const selected = isAnnotationSelected(annotation.annotationUID);

    if (!this.editData && !selected) {
      const enabledElement = getEnabledElement(element);
      const { viewport } = enabledElement;
      const { textBox } = annotation.data.handles;
      const worldBoundingBox = textBox?.worldBoundingBox;

      if (textBox && worldBoundingBox) {
        const canvasBoundingBox = {
          topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
          topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
          bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
          bottomRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
        };

        const withinBounds =
          canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
          canvasCoords[0] <= canvasBoundingBox.bottomRight[0] &&
          canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
          canvasCoords[1] <= canvasBoundingBox.bottomRight[1];

        if (withinBounds) {
          annotation.data.handles.activeHandleIndex = null;
          return textBox as ToolHandle;
        }
      }

      return;
    }

    return super.getHandleNearImagePoint(
      element,
      annotation,
      canvasCoords,
      proximity
    );
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    if (!this.editData) {
      return;
    }

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved, stage } =
      this.editData;
    const { data } = annotation;

    if (data?.handles?.textBox) {
      data.handles.textBox.isMoving = false;
    }

    if (stage === 'placingFirst') {
      (annotation.metadata as LengthZoomMetadata).creationStage =
        'waitingSecond';
      data.handles.activeHandleIndex = null;

      this._deactivateModify(element);
      this._deactivateDraw(element);
      resetElementCursor(element);

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);
      this.doneEditMemo();

      this.editData = null;
      this.isDrawing = false;

      return;
    }

    if (stage !== 'placingSecond' && newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return;
    }

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);
    this._cancelHandleMoveLingerTick();

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
    this.doneEditMemo();

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }

    if (newAnnotation) {
      annotation.highlighted = false;
      deselectAnnotation(annotation.annotationUID);
    }

    this.editData = null;
    this.isDrawing = false;
    delete (annotation.metadata as LengthZoomMetadata).creationStage;
    this.pendingAnnotation = null;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
      newAnnotation,
      stage,
    } = this.editData;
    const { data } = annotation;

    this.createMemo(element, annotation, { newAnnotation });

    const deltaPointsWorld = (
      eventDetail as { deltaPoints?: { world?: Types.Point3 } }
    ).deltaPoints?.world as Types.Point3 | undefined;

    const movedByWorld = Boolean(
      deltaPointsWorld &&
        (Math.abs(deltaPointsWorld[0]) > MOVEMENT_EPSILON ||
          Math.abs(deltaPointsWorld[1]) > MOVEMENT_EPSILON ||
          Math.abs(deltaPointsWorld[2]) > MOVEMENT_EPSILON)
    );

    let movedThisFrame = false;

    const mouseEvent = eventDetail.event as MouseEvent;
    const buttons =
      (eventDetail as unknown as { buttons?: number }).buttons ??
      (mouseEvent instanceof MouseEvent ? mouseEvent.buttons : undefined);

    if (stage && typeof buttons === 'number' && buttons === 0) {
      return;
    }

    if (stage === 'placingFirst') {
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;
      const previousPoint = data.handles.points[0];
      const moved =
        movedByWorld || this._hasPointChanged(previousPoint, worldPos);

      data.handles.points[0] = <Types.Point3>[...worldPos];
      data.handles.points[1] = <Types.Point3>[...worldPos];
      annotation.invalidated = true;

      movedThisFrame = moved;
      if (moved) {
        this.editData.handleMoveLinger = HANDLE_MOVE_LINGER_FRAMES;
        this.editData.isHandleMoving = true;
        this._scheduleHandleMoveLingerTick();
      }
      this.editData.hasMoved = this.editData.hasMoved || moved;

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      return;
    }

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      data.handles.activeHandleIndex = null;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.isMoving = true;
      textBox.hasMoved = true;
      movedThisFrame = movedByWorld;
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      if (!['placingFirst', 'placingSecond'].includes(stage)) {
        data.handles.activeHandleIndex = null;
      }

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = annotation.invalidated || movedByWorld;
      movedThisFrame = movedByWorld;
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;
      const previousPoint = data.handles.points[handleIndex];
      const moved =
        movedByWorld || this._hasPointChanged(previousPoint, worldPos);

      if (moved) {
        data.handles.points[handleIndex] = [...worldPos];
        annotation.invalidated = true;
      }

      movedThisFrame = moved;
    }

    if (movedThisFrame && !movingTextBox) {
      this.editData.handleMoveLinger = HANDLE_MOVE_LINGER_FRAMES;
      this.editData.isHandleMoving = true;
      this._scheduleHandleMoveLingerTick();
    }
    this.editData.hasMoved = this.editData.hasMoved || movedThisFrame;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (annotation.invalidated) {
      triggerAnnotationModified(
        annotation,
        element,
        ChangeTypes.HandlesUpdated
      );
    }
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);
      this._cancelHandleMoveLingerTick();

      const { annotation, viewportIdsToRender, newAnnotation, stage } =
        this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      if (data?.handles?.textBox) {
        data.handles.textBox.isMoving = false;
      }

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      if (stage === 'placingFirst') {
        removeAnnotation(annotation.annotationUID);
      } else if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      delete (annotation.metadata as LengthZoomMetadata).creationStage;
      this.pendingAnnotation = null;
      return annotation.annotationUID;
    }

    if (
      this.pendingAnnotation &&
      (this.pendingAnnotation.metadata as LengthZoomMetadata)?.creationStage ===
        'waitingSecond'
    ) {
      const annotation = this.pendingAnnotation;
      removeAnnotation(annotation.annotationUID);
      triggerAnnotationRenderForViewportIds(
        getViewportIdsWithToolToRender(element, this.getToolName())
      );
      delete (annotation.metadata as LengthZoomMetadata).creationStage;
      this.pendingAnnotation = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

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

    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

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

    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );

    this._cancelHandleMoveLingerTick();
  };

  /**
   * it is used to draw the length annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

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

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };
    const highlightLayer = this._getOrCreateLayer(
      svgDrawingHelper,
      HIGHLIGHT_LAYER_CLASS
    );
    const mainLayer = this._getOrCreateLayer(
      svgDrawingHelper,
      MAIN_LAYER_CLASS
    );
    const handleLayer = this._getOrCreateLayer(
      svgDrawingHelper,
      HANDLE_LAYER_CLASS
    );

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as LengthAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash, shadow } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      const editDataForAnnotation =
        this.editData && this.editData.annotation === annotation
          ? this.editData
          : null;

      const creationStage = (annotation.metadata as LengthZoomMetadata)
        ?.creationStage;

      if (
        creationStage === 'placingFirst' ||
        creationStage === 'waitingSecond'
      ) {
        const handleGroupUID = 'preview';
        const annotationIsSelected = isAnnotationSelected(annotationUID);
        const isFirstHandleGrabbed =
          creationStage === 'placingFirst' && annotationIsSelected;
        const isDraggingFirstHandle =
          isFirstHandleGrabbed &&
          Boolean(editDataForAnnotation?.isHandleMoving);
        const previewHandleStyle = isFirstHandleGrabbed
          ? {
              color: HANDLE_FILL,
              lineWidth: HANDLE_LINE_WIDTH,
              handleRadius: `${ACTIVE_HANDLE_RADIUS}`,
              fill: HANDLE_COLOR,
            }
          : {
              color: HANDLE_COLOR,
              lineWidth: HANDLE_LINE_WIDTH,
              handleRadius: `${HANDLE_RADIUS}`,
              fill: HANDLE_FILL,
            };

        this._withLayer(svgDrawingHelper, handleLayer, () => {
          if (isDraggingFirstHandle) {
            const previewGlowUID = 'preview-glow';
            drawHandlesSvg(
              svgDrawingHelper,
              annotationUID,
              previewGlowUID,
              [canvasCoordinates[0]],
              {
                color: HANDLE_GLOW_COLOR_30,
                lineDash: undefined,
                lineWidth: 0,
                handleRadius: `${HANDLE_GLOW_RADIUS}`,
                fill: HANDLE_GLOW_COLOR_30,
              }
            );
          }

          drawHandlesSvg(
            svgDrawingHelper,
            annotationUID,
            handleGroupUID,
            [canvasCoordinates[0]],
            previewHandleStyle
          );
        });

        renderStatus = true;
        continue;
      }

      const isPreviewingSecondPoint = creationStage === 'placingSecond';

      // If cachedStats does not exist, or the unit is missing (as part of import/hydration etc.),
      // force to recalculate the stats from the points
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].unit == null
      ) {
        data.cachedStats[targetId] = {
          length: null,
          unit: null,
        };

        this._calculateCachedStats(annotation, renderingEngine, enabledElement);
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement
        );
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      const annotationIsSelected =
        Boolean(editDataForAnnotation) || isAnnotationSelected(annotationUID);

      const showHandlesAlways = Boolean(
        getStyleProperty('showHandlesAlways', {} as StyleSpecifier)
      );
      const dragHandleIndex =
        editDataForAnnotation &&
        typeof editDataForAnnotation.handleIndex === 'number' &&
        !editDataForAnnotation.movingTextBox
          ? editDataForAnnotation.handleIndex
          : null;

      const shouldDrawHandles =
        isPreviewingSecondPoint ||
        annotationIsSelected ||
        showHandlesAlways ||
        dragHandleIndex !== null;

      const [startPoint, endPoint] = canvasCoordinates;
      const dx = endPoint[0] - startPoint[0];
      const dy = endPoint[1] - startPoint[1];
      const length = Math.sqrt(dx * dx + dy * dy);

      if (annotationIsSelected) {
        this._withLayer(svgDrawingHelper, highlightLayer, () => {
          const highlightLineUID = 'selected-highlight';
          drawLineSvg(
            svgDrawingHelper,
            annotationUID,
            highlightLineUID,
            canvasCoordinates[0],
            canvasCoordinates[1],
            {
              color: 'rgba(18, 132, 255, 0.5)',
              width: 16,
              lineDash: undefined,
              shadow: false,
              lineCap: 'round',
            },
            `${annotationUID}-selected-highlight`
          );
        });
      }

      this._withLayer(svgDrawingHelper, mainLayer, () => {
        const dataId = `${annotationUID}-line`;
        const lineUID = '1';
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates[0],
          canvasCoordinates[1],
          {
            color: LENGTH_COLOR,
            width: 2,
            lineDash,
            shadow: {
              color: 'rgba(0, 0, 0, 0.8)',
              offsetX: 0,
              offsetY: 1,
              blur: 1,
            },
          },
          dataId
        );

        const crossbarStyle = {
          color: LENGTH_COLOR,
          width: 2,
          lineDash: undefined,
          shadow: {
            color: 'rgba(0, 0, 0, 0.8)',
            offsetX: 0,
            offsetY: 1,
            blur: 1,
          },
        };

        if (length > 0.0001) {
          const invLength = 1 / length;
          const perpX = -dy * invLength * CROSSBAR_HALF_LENGTH;
          const perpY = dx * invLength * CROSSBAR_HALF_LENGTH;

          const startCrossStart: Types.Point2 = [
            startPoint[0] - perpX,
            startPoint[1] - perpY,
          ];
          const startCrossEnd: Types.Point2 = [
            startPoint[0] + perpX,
            startPoint[1] + perpY,
          ];

          const endCrossStart: Types.Point2 = [
            endPoint[0] - perpX,
            endPoint[1] - perpY,
          ];
          const endCrossEnd: Types.Point2 = [
            endPoint[0] + perpX,
            endPoint[1] + perpY,
          ];

          drawLineSvg(
            svgDrawingHelper,
            annotationUID,
            'start-crossbar',
            startCrossStart,
            startCrossEnd,
            crossbarStyle,
            `${annotationUID}-start-crossbar`
          );

          drawLineSvg(
            svgDrawingHelper,
            annotationUID,
            'end-crossbar',
            endCrossStart,
            endCrossEnd,
            crossbarStyle,
            `${annotationUID}-end-crossbar`
          );
        }
      });

      this._withLayer(svgDrawingHelper, handleLayer, () => {
        if (!shouldDrawHandles) {
          return;
        }

        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color: HANDLE_COLOR,
            lineDash,
            lineWidth: HANDLE_LINE_WIDTH,
            handleRadius: `${HANDLE_RADIUS}`,
            fill: HANDLE_FILL,
          }
        );

        const highlightHandleIndex = dragHandleIndex;
        const highlightIsMoving = Boolean(
          editDataForAnnotation?.isHandleMoving
        );

        if (
          highlightHandleIndex !== null &&
          highlightHandleIndex >= 0 &&
          highlightHandleIndex < canvasCoordinates.length
        ) {
          const activeHandleGroupUID = 'active';
          const highlightStroke = HANDLE_FILL;
          const highlightFill = HANDLE_COLOR;

          if (highlightIsMoving) {
            const glowGroupUID = 'active-glow';
            drawHandlesSvg(
              svgDrawingHelper,
              annotationUID,
              glowGroupUID,
              [canvasCoordinates[highlightHandleIndex]],
              {
                color: HANDLE_GLOW_COLOR_30,
                lineDash: undefined,
                lineWidth: 0,
                handleRadius: `${HANDLE_GLOW_RADIUS}`,
                fill: HANDLE_GLOW_COLOR_30,
              }
            );
          }

          drawHandlesSvg(
            svgDrawingHelper,
            annotationUID,
            activeHandleGroupUID,
            [canvasCoordinates[highlightHandleIndex]],
            {
              color: highlightStroke,
              lineDash,
              lineWidth: HANDLE_LINE_WIDTH,
              handleRadius: `${ACTIVE_HANDLE_RADIUS}`,
              fill: highlightFill,
            }
          );
        }
      });

      renderStatus = true;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);

      if (!options.visibility) {
        data.handles.textBox = {
          hasMoved: false,
          isMoving: false,
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        };
        continue;
      }

      const textLines = this.configuration.getTextLines(data, targetId);

      data.handles.textBox.isMoving ??= false;

      // Need to update to sync with annotation while unlinked/not moved
      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords =
          this._getAnchoredTextBoxCanvasCoords(canvasCoordinates);

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = '1';
      const hasDetachedTextBox = Boolean(data.handles.textBox.hasMoved);
      const textBoxStyleOverrides = data.handles.textBox.isMoving
        ? {
            borderColor: '',
            borderWidth: 0,
            borderRadius: 6,
            background: HANDLE_GLOW_COLOR_50,
            backgroundPadding: MOVING_BACKGROUND_PADDING,
          }
        : {
            borderColor: TEXTBOX_FIXED_STYLE.borderColor,
            borderWidth: TEXTBOX_FIXED_STYLE.borderWidth,
            borderRadius: TEXTBOX_FIXED_STYLE.borderRadius,
            background: '',
            backgroundPadding: TEXTBOX_FIXED_STYLE.backgroundPadding,
          };

      const textBoxOptions = {
        ...options,
        ...TEXTBOX_FIXED_STYLE,
        linkColor: LENGTH_COLOR,
        lineDash: LINK_LINE_DASH,
        lineWidth: 2,
        ...textBoxStyleOverrides,
        ...(hasDetachedTextBox ? { drawLink: false } : {}),
      };

      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        textBoxOptions
      );

      const { x: left, y: top, width, height } = boundingBox;

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      };

      if (hasDetachedTextBox) {
        const labelTextLines = this._getLabelOnlyTextLines(annotation.data);

        if (labelTextLines?.length) {
          const anchoredCanvasCoords =
            this._getAnchoredTextBoxCanvasCoords(canvasCoordinates);

          const labelTextBoxOptions = {
            ...options,
            ...TEXTBOX_FIXED_STYLE,
            linkColor: LENGTH_COLOR,
            lineDash: LINK_LINE_DASH,
            lineWidth: 2,
            drawLink: false,
          };

          drawLinkedTextBoxSvg(
            svgDrawingHelper,
            annotationUID,
            'label',
            labelTextLines,
            anchoredCanvasCoords,
            canvasCoordinates,
            {},
            labelTextBoxOptions
          );
        }
      }
    }

    return renderStatus;
  };

  private _assignAnnotationLabel(
    annotation: LengthAnnotation,
    element: HTMLDivElement
  ): void {
    const existingAnnotations =
      getAnnotations(this.getToolName(), element) ?? [];

    const existingMaxIndex = existingAnnotations.reduce((maxIndex, ann) => {
      if (ann === annotation) {
        return maxIndex;
      }

      const label = (ann as LengthAnnotation)?.data?.label;
      const match = label && /^d(\d+)$/i.exec(label);

      if (!match) {
        return maxIndex;
      }

      const index = Number(match[1]);

      return Number.isFinite(index) && index > maxIndex ? index : maxIndex;
    }, 0);

    const currentLabel = annotation.data?.label;

    if (currentLabel && /^d\d+$/i.test(currentLabel)) {
      return;
    }

    annotation.data.label = `d${existingMaxIndex + 1}`;
  }

  private _getTextLinesWithLabel(data, targetId): string[] | undefined {
    const cachedStats = data?.cachedStats?.[targetId];

    if (!cachedStats) {
      return;
    }

    const { length, unit } = cachedStats;

    if (length === undefined || length === null || isNaN(length)) {
      return;
    }
    const hasMillimeterUnit =
      typeof unit === 'string' && unit.toLowerCase().startsWith('mm');

    const convertedLength = hasMillimeterUnit ? length / 10 : length;
    const convertedUnit = hasMillimeterUnit
      ? unit.replace(/mm/i, 'cm')
      : (unit ?? '');

    const lengthText = `${convertedLength.toFixed(1)} ${convertedUnit}`;
    const label = data?.label;

    return [label ? `${label}: ${lengthText}` : lengthText];
  }

  private _getLabelOnlyTextLines(
    data: LengthAnnotation['data'] | undefined
  ): string[] | undefined {
    const label = data?.label;

    if (!label) {
      return;
    }

    return [label];
  }

  private _scheduleHandleMoveLingerTick(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this._handleMoveAnimationFrame !== null) {
      return;
    }

    const tick = () => {
      this._handleMoveAnimationFrame = null;

      const editData = this.editData;

      if (!editData) {
        return;
      }

      const linger = editData.handleMoveLinger ?? 0;

      if (linger <= 0) {
        editData.handleMoveLinger = 0;
        editData.isHandleMoving = false;

        const viewportIds = editData.viewportIdsToRender?.length
          ? editData.viewportIdsToRender
          : [];

        if (viewportIds.length) {
          triggerAnnotationRenderForViewportIds(viewportIds);
        }

        return;
      }

      editData.handleMoveLinger = linger - 1;
      editData.isHandleMoving = editData.handleMoveLinger > 0;

      const viewportIds = editData.viewportIdsToRender?.length
        ? editData.viewportIdsToRender
        : [];

      if (viewportIds.length) {
        triggerAnnotationRenderForViewportIds(viewportIds);
      }

      if (editData.handleMoveLinger > 0) {
        this._handleMoveAnimationFrame = window.requestAnimationFrame(tick);
      } else {
        editData.isHandleMoving = false;
      }
    };

    this._handleMoveAnimationFrame = window.requestAnimationFrame(tick);
  }

  private _cancelHandleMoveLingerTick(): void {
    if (
      typeof window !== 'undefined' &&
      this._handleMoveAnimationFrame !== null
    ) {
      window.cancelAnimationFrame(this._handleMoveAnimationFrame);
      this._handleMoveAnimationFrame = null;
    }
  }

  private _getOrCreateLayer(
    svgDrawingHelper: SVGDrawingHelper,
    className: string
  ): SVGGElement {
    const root = svgDrawingHelper.svgLayerElement as unknown as SVGGElement;
    let layer = root.querySelector(`:scope > g.${className}`) as SVGGElement;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.classList.add(className);
      if (!layer.id) {
        const baseId = root.id ? `${root.id}-${className}` : className;
        layer.id = baseId;
      }
      root.appendChild(layer);
    }
    return layer;
  }

  private _withLayer(
    svgDrawingHelper: SVGDrawingHelper,
    layer: SVGGElement,
    drawFn: () => void
  ): void {
    const originalLayer = svgDrawingHelper.svgLayerElement;
    svgDrawingHelper.svgLayerElement = layer;
    try {
      drawFn();
    } finally {
      svgDrawingHelper.svgLayerElement = originalLayer;
    }
  }

  private _deselectAllLengthAnnotations(element: HTMLDivElement): boolean {
    let changed = false;
    const annotations = getAnnotations(this.getToolName(), element) ?? [];

    annotations.forEach((annotation) => {
      if (annotation.highlighted) {
        annotation.highlighted = false;
        changed = true;
      }

      const handles = annotation.data?.handles;

      if (handles && handles.activeHandleIndex !== null) {
        handles.activeHandleIndex = null;
        changed = true;
      }

      if (isAnnotationSelected(annotation.annotationUID)) {
        deselectAnnotation(annotation.annotationUID);
        changed = true;
      }
    });

    if (changed && this.editData) {
      this._deactivateModify(element);
      this._deactivateDraw(element);
      resetElementCursor(element);
      this._cancelHandleMoveLingerTick();
      this.editData = null;
      this.isDrawing = false;
      this.doneEditMemo();
    }

    this.pendingAnnotation = null;

    return changed;
  }

  private _getAnchoredTextBoxCanvasCoords(
    canvasCoordinates: Array<Types.Point2>
  ): Types.Point2 {
    const [firstPoint, secondPoint] = canvasCoordinates;

    if (!firstPoint || !secondPoint) {
      return getTextBoxCoordsCanvas(canvasCoordinates);
    }

    const isSecondAboveFirst = secondPoint[1] < firstPoint[1];
    const verticalOffset = isSecondAboveFirst
      ? TEXTBOX_VERTICAL_OFFSET
      : -TEXTBOX_VERTICAL_OFFSET;

    const anchorPaddingCorrection =
      TEXTBOX_PADDING * 2 + TEXTBOX_BACKGROUND_PADDING;

    return <Types.Point2>[
      firstPoint[0] + TEXTBOX_HORIZONTAL_OFFSET - anchorPaddingCorrection,
      firstPoint[1] + verticalOffset - anchorPaddingCorrection,
    ];
  }

  private _hasPointChanged(
    previous: Types.Point3,
    current: Types.Point3
  ): boolean {
    return (
      Math.abs(previous[0] - current[0]) > MOVEMENT_EPSILON ||
      Math.abs(previous[1] - current[1]) > MOVEMENT_EPSILON ||
      Math.abs(previous[2] - current[2]) > MOVEMENT_EPSILON
    );
  }

  _calculateLength(pos1, pos2) {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data;
    const { element } = enabledElement.viewport;

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];
    const { cachedStats } = data;
    const targetIds = Object.keys(cachedStats);

    // TODO clean up, this doesn't need a length per volume, it has no stats derived from volumes.

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const image = this.getTargetImageData(targetId);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { imageData, dimensions } = image;

      const index1 = transformWorldToIndex(imageData, worldPos1);
      const index2 = transformWorldToIndex(imageData, worldPos2);
      const handles = [index1, index2];
      const { scale, unit } = getCalibratedLengthUnitsAndScale(image, handles);

      const length = this._calculateLength(worldPos1, worldPos2) / scale;

      if (this._isInsideVolume(index1, index2, dimensions)) {
        this.isHandleOutsideImage = false;
      } else {
        this.isHandleOutsideImage = true;
      }

      // TODO -> Do we instead want to clip to the bounds of the volume and only include that portion?
      // Seems like a lot of work for an unrealistic case. At the moment bail out of stat calculation if either
      // corner is off the canvas.

      // todo: add insideVolume calculation, for removing tool if outside
      cachedStats[targetId] = {
        length,
        unit,
      };
    }

    const invalidated = annotation.invalidated;
    annotation.invalidated = false;

    // Dispatching annotation modified only if it was invalidated
    if (invalidated) {
      triggerAnnotationModified(annotation, element, ChangeTypes.StatsUpdated);
    }

    return cachedStats;
  }

  _isInsideVolume(index1, index2, dimensions) {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  }
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { length, unit } = cachedVolumeStats;

  // Can be null on load
  if (length === undefined || length === null || isNaN(length)) {
    return;
  }

  const textLines = [`${csUtils.roundNumber(length)} ${unit}`];

  return textLines;
}

export default LengthToolZoom;
