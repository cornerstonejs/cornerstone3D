import { Events, ChangeTypes } from '../../../enums';
import {
  getEnabledElement,
  utilities as csUtils,
  utilities,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../../base';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../../stateManagement/annotation/annotationVisibility';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../../stateManagement/annotation/helpers/state';
import * as lineSegment from '../../../utilities/math/line';

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawFan as drawFanSvg,
} from '../../../drawingSvg';
import { state } from '../../../store/state';
import { getViewportIdsWithToolToRender } from '../../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';

import type {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../../types';
import type { UltrasoundAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../../types/AnnotationStyle';
import {
  calculateInnerFanPercentage,
  clipInterval,
  intervalFromPoints,
  mergeIntervals,
  type FanPair,
  type FanPairs,
} from '../../../utilities/math/fan/fanUtils';
import { calculateFanGeometry } from './utils/fanExtraction';
const { transformIndexToWorld } = csUtils;

/**
 * UltrasoundAnnotationTool facilitates the creation and manipulation of specialized annotations
 * for ultrasound imaging. Each annotation comprises a line segment and an associated fan-shaped
 * region, designed to highlight or measure features like B-lines or pleural abnormalities.
 *
 * Interactively, users draw a line by defining two points. A fan is then automatically
 * rendered based on these points and the tool's configuration parameters, such as
 * `fanCenter`, `innerRadius`, `outerRadius`. The visual appearance, including distinct
 * colors for different ultrasound findings (e.g., `bLineColor`, `pleuraColor`),
 * is customizable through the tool's configuration.
 *
 * Annotations are managed by the standard annotation state system, ensuring they
 * are persisted and can be programmatically accessed. These annotations exist in
 * 3D world space and are consistently displayed across multiple viewports
 * sharing the same frame of reference.
 *
 * @example
 * ```javascript
 * // Import necessary modules from Cornerstone Tools
 * import { UltrasoundAnnotationTool, ToolGroupManager, Enums, addTool } from '@cornerstonejs/tools';
import { canvasCoordinates } from '../../utilities/math/circle/_types';
import { getUnknownVolumeLoaderSchema } from '../../../../core/src/loaders/volumeLoader';
import { deriveFanGeometry } from './utils/deriveFanGeometry';
import { Point3 } from '../../../../../../.nx/cache/6836589865368719691/packages/core/dist/esm/types/Point3';
 *
 * // Register the tool with the ToolGroupManager (or globally if preferred)
 * addTool(UltrasoundAnnotationTool);
 *
 * // Create a new tool group or get an existing one
 * const toolGroupId = 'myUltrasoundToolGroup';
 * const toolGroup = ToolGroupManager.getToolGroup(toolGroupId) || ToolGroupManager.createToolGroup(toolGroupId);
 *
 * // Add the UltrasoundAnnotationTool's name to the tool group
 * toolGroup.addTool(UltrasoundAnnotationTool.toolName);
 *
 * // Associate a viewport with the tool group
 * toolGroup.addViewport('myViewportId', 'myRenderingEngineId');
 *
 * // Activate the tool for interaction
 * toolGroup.setToolActive(UltrasoundAnnotationTool.toolName, {
 *   bindings: [
 *     {
 *       mouseButton: Enums.MouseBindings.Primary, // e.g., Left mouse button
 *     },
 *   ],
 * });
 *
 * // Optionally, customize the tool's behavior and appearance
 * toolGroup.setToolConfiguration(UltrasoundAnnotationTool.toolName, {
 *   fanCenter: [128, 128, 0], // Center of the fan in image voxel coordinates (IJK)
 *   innerRadius: 10,          // Inner radius of the fan in image voxel units
 *   outerRadius: 50,          // Outer radius of the fan in image voxel units
 *   bLineColor: 'rgba(0, 255, 0, 0.7)', // Color for B-Line type annotations
 *   pleuraColor: 'rgba(89, 0, 255, 0.7)', // Color for Pleura type annotations
 *   // Note: startAngle and endAngle are typically derived from the drawn line points.
 * });
 * ```
 * If the user do not give the fan shape geometry parameters it will be derived
 * via US image segmentation. The method gives a good rough estimate of the US fan shape
 * and should not be considered as the best parameters.
 *
 * For comprehensive details on API, configuration options, and advanced usage patterns,
 * refer to the official CornerstoneJS documentation.
 */
class UltrasoundAnnotationTool extends AnnotationTool {
  static toolName = 'UltrasoundAnnotation';

  /**
   * Enum for ultrasound annotation types
   */
  static USAnnotationType = {
    BLINE: 'bLine',
    PLEURA: 'pleura',
  } as const;

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  activeAnnotationType: string;
  pleuraAnnotations: UltrasoundAnnotation[] = [];
  bLineAnnotations: UltrasoundAnnotation[] = [];

  /**
   * constructor for the UltrasoundAnnotationTool
   * @param toolProps - public tool props
   * @param defaultToolProps - default tool props
   */
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        getTextLines: defaultGetTextLines,
        fanCenter: null as Types.Point3,
        innerRadius: null,
        outerRadius: null,
        startAngle: null,
        endAngle: null,
        bLineColor: 'rgb(0, 255, 0)',
        pleuraColor: 'rgb(0, 4, 255)',
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
    this.activeAnnotationType = UltrasoundAnnotationTool.USAnnotationType.BLINE;
  }

  /**
   * Sets the active annotation type (bLine or pleura)
   * @param type - annotation type from UltrasoundAnnotationTool.USAnnotationType
   */
  public setActiveAnnotationType(type: string) {
    this.activeAnnotationType = type;
  }

  /**
   * Gets the active annotation type
   * @returns {string} the active annotation type
   */
  public getActiveAnnotationType(): string {
    return this.activeAnnotationType;
  }

  /**
   * Deletes the last pleura annotation
   * @returns {void}
   */
  public deleteLastAnnotationType(type: string) {
    let annotationList;
    if (type === UltrasoundAnnotationTool.USAnnotationType.PLEURA) {
      annotationList = this.pleuraAnnotations;
    } else {
      annotationList = this.bLineAnnotations;
    }
    if (annotationList.length > 0) {
      const annotation = annotationList.pop();
      removeAnnotation(annotation.annotationUID);
    }
  }
  /**
   * Deletes all annotations
   * @returns {void}
   */
  public deleteAllAnnotations() {
    this.pleuraAnnotations.forEach((annotation) => {
      removeAnnotation(annotation.annotationUID);
    });
    this.bLineAnnotations.forEach((annotation) => {
      removeAnnotation(annotation.annotationUID);
    });
    this.pleuraAnnotations = [];
    this.bLineAnnotations = [];
  }

  // needs revision
  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: UltrasoundAnnotationTool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): UltrasoundAnnotation => {
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
    } = this.hydrateBase<UltrasoundAnnotationTool>(
      UltrasoundAnnotationTool,
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
  ): UltrasoundAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    hideElementCursor(element);
    this.isDrawing = true;

    const {
      viewPlaneNormal,
      viewUp,
      position: cameraPosition,
    } = viewport.getCamera();
    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        ...viewport.getViewReference({ points: [worldPos] }),
        toolName: this.getToolName(),
        referencedImageId,
        viewUp,
        cameraPosition,
      },
      data: {
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
        },
        annotationType: this.getActiveAnnotationType(),
        label: '',
      },
    };

    addAnnotation(annotation, element);
    if (
      this.activeAnnotationType ===
      UltrasoundAnnotationTool.USAnnotationType.PLEURA
    ) {
      this.pleuraAnnotations.push(annotation as UltrasoundAnnotation);
    } else {
      this.bLineAnnotations.push(annotation as UltrasoundAnnotation);
    }

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
    };
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation as UltrasoundAnnotation;
  };

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
    annotation: UltrasoundAnnotation,
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

  /**
   * Callback that is called when the tool is selected
   * @param evt - event
   * @param annotation - annotation
   * @returns {void}
   */
  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: UltrasoundAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
    };

    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  /**
   * Callback that is called when a handle is selected
   * @param evt - event
   * @param annotation - annotation
   * @param handle - handle
   * @returns {void}
   */
  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: UltrasoundAnnotation,
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
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  }

  /**
   * Callback that is called when the tool is done editing
   * @param evt - event
   * @returns {void}
   */
  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return;
    }

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

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

    this.editData = null;
    this.isDrawing = false;
  };

  /**
   * Callback that is called when the tool is dragged
   * @param evt - event
   * @returns {void}
   */
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
    } = this.editData;
    const { data } = annotation;

    this.createMemo(element, annotation, { newAnnotation });

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [...worldPos];
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (annotation.invalidated) {
      triggerAnnotationModified(
        annotation,
        element,
        ChangeTypes.HandlesUpdated
      );
    }
  };

  /**
   * Cancels the drawing of the annotation
   * @param element - element
   * @returns {string} annotationUID
   */
  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  /**
   * Activates the modify mode
   * @param element - element
   * @returns {void}
   */
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

  /**
   * Deactivates the modify mode
   * @param element - element
   * @returns {void}
   */
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

  /**
   * Activates the draw mode
   * @param element - element
   * @returns {void}
   */
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

  /**
   * Deactivates the draw mode
   * @param element - element
   * @returns {void}
   */
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
  };

  /**
   * Derive the fan shape geometry parameters via US image segmentation, if the
   * parameters were not defined
   * @param viewport
   */
  deriveFanGeometryFromViewport(viewport) {
    const imageId = viewport.getCurrentImageId();
    const fanGeometry = calculateFanGeometry(imageId);
    this.configuration.fanCenter = [
      fanGeometry.center[0],
      fanGeometry.center[1],
      0,
    ];
    this.configuration.innerRadius = fanGeometry.innerRadius;
    this.configuration.outerRadius = fanGeometry.outerRadius;
    this.configuration.startAngle = (fanGeometry.startAngle * 180) / Math.PI;
    this.configuration.endAngle = (fanGeometry.endAngle * 180) / Math.PI;
  }

  /**
   * Check fan shape geometry parameters
   * @returns
   */
  checkFanShapeGeometryParameters(): boolean {
    return (
      this.configuration.fanCenter &&
      this.configuration.innerRadius > 0 &&
      this.configuration.outerRadius &&
      this.configuration.startAngle > 0 &&
      this.configuration.startAngle < 360 &&
      this.configuration.endAngle > 0 &&
      this.configuration.endAngle < 360
    );
  }
  /**
   * Calculates the percentage of bLine inside the pleura
   * @param viewport - viewport
   * @returns {number} percentage of bLine inside the pleura
   */
  calculateBLinePleuraPercentage(viewport): number {
    if (!this.checkFanShapeGeometryParameters()) {
      this.deriveFanGeometryFromViewport(viewport);
    }
    // if no valid parameters, then leave
    if (!this.checkFanShapeGeometryParameters()) {
      return;
    }
    const { imageData } = viewport.getImageData();
    const fanCenter = viewport.worldToCanvas(
      imageData.indexToWorld(this.configuration.fanCenter)
    );

    const pleuraIntervals = this.pleuraAnnotations.map((annotation) => {
      const canvasCoordinates = annotation.data.handles.points.map((p) =>
        viewport.worldToCanvas(p)
      );

      return canvasCoordinates;
    });
    const bLineIntervals = this.bLineAnnotations.map((annotation) => {
      const canvasCoordinates = annotation.data.handles.points.map((p) =>
        viewport.worldToCanvas(p)
      );

      return canvasCoordinates;
    });
    return calculateInnerFanPercentage(
      fanCenter,
      pleuraIntervals as FanPairs,
      bLineIntervals as FanPairs
    );
  }
  /**
   * Gets the color for the line type
   * @param annotation - annotation
   * @returns {string} color for the line type
   */
  getColorForLineType(annotation: UltrasoundAnnotation) {
    const { annotationType } = annotation.data;
    const { bLineColor, pleuraColor } = this.configuration;

    if (annotationType === UltrasoundAnnotationTool.USAnnotationType.BLINE) {
      return bLineColor;
    }

    if (annotationType === UltrasoundAnnotationTool.USAnnotationType.PLEURA) {
      return pleuraColor;
    }

    return bLineColor;
  }
  getIndexToCanvasRatio(viewport): number {
    const { imageData } = viewport.getImageData();
    const v1 = viewport.worldToCanvas(imageData.indexToWorld([1, 0, 0]));
    const v2 = viewport.worldToCanvas(imageData.indexToWorld([2, 0, 0]));
    const diffVector = [v2[0] - v1[0], v2[1] - v1[1]];
    const vectorSize = Math.sqrt(
      diffVector[0] * diffVector[0] + diffVector[1] * diffVector[1]
    );
    return vectorSize;
  }
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

    if (!this.checkFanShapeGeometryParameters()) {
      this.deriveFanGeometryFromViewport(viewport);
    }
    // if no valid parameters, then leave
    if (!this.checkFanShapeGeometryParameters()) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const { imageData } = viewport.getImageData();
    const fanCenter = viewport.worldToCanvas(
      transformIndexToWorld(imageData, this.configuration.fanCenter)
    );

    const indexToCanvasRatio = this.getIndexToCanvasRatio(viewport);
    const innerRadius = this.configuration.innerRadius * indexToCanvasRatio;
    const outerRadius = this.configuration.outerRadius * indexToCanvasRatio;

    // get all pleura intervals
    const unMergedIntervals = this.pleuraAnnotations.map((annotation) => {
      const canvasCoordinates = annotation.data.handles.points.map((p) =>
        viewport.worldToCanvas(p)
      );

      const interval = intervalFromPoints(
        fanCenter,
        canvasCoordinates as FanPair
      );
      return interval;
    });
    const mergedIntervals = mergeIntervals(unMergedIntervals);
    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as UltrasoundAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash, shadow } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      let activeHandleCanvasCoords;

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotationUID) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        );
      }

      const dataId = `${annotationUID}-line`;
      const lineUID = '1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          width: lineWidth,
          lineDash,
          shadow,
        },
        dataId
      );

      // drawFan
      const bLineInterval = intervalFromPoints(
        fanCenter,
        canvasCoordinates as FanPair
      );
      const clippedIntervals = clipInterval(bLineInterval, mergedIntervals);
      clippedIntervals.forEach((clippedInterval, index) => {
        const fanDataId = `${annotationUID}-fan-${index}`;
        const fanUID = `2-${index}`;
        drawFanSvg(
          svgDrawingHelper,
          annotationUID,
          fanUID,
          fanCenter,
          innerRadius,
          outerRadius,
          clippedInterval[0],
          clippedInterval[1],
          {
            color: this.getColorForLineType(annotation),
            fill: this.getColorForLineType(annotation),
            fillOpacity: 0.2,
            width: lineWidth,
            lineDash,
            shadow,
          },
          fanDataId
        );
      });
      renderStatus = true;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }
    }

    return renderStatus;
  };

  _isInsideVolume(index1, index2, dimensions) {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  }
}

function defaultGetTextLines(data, targetId): string[] {
  return [''];
}

export default UltrasoundAnnotationTool;
