import { Events, ChangeTypes } from '../../../enums';
import {
  getEnabledElement,
  utilities,
  metaData,
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
import type { UltrasoundPleuraBLineAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../../types/AnnotationStyle';
import {
  angleFromCenter,
  calculateInnerFanPercentage,
  clipInterval,
  intervalFromPoints,
  mergeIntervals,
  subtractIntervals,
  type FanPair,
  type FanPairs,
} from '../../../utilities/math/fan/fanUtils';
import { calculateFanGeometry } from './utils/fanExtraction';
import type { FanGeometry } from './utils/types';
const { transformIndexToWorld } = utilities;

type FilterFunction = (imageId: string) => boolean;
/**
 * UltrasoundPleuraBLineAnnotationTool facilitates the creation and manipulation of specialized annotations
 * for ultrasound imaging. Each annotation comprises a line segment and an associated fan-shaped
 * region, designed to highlight or measure features like B-lines or pleural abnormalities.
 *
 * Interactively, users draw a line by defining two points. A fan is then automatically
 * rendered based on these points and the tool's configuration parameters, such as
 * `center`, `innerRadius`, `outerRadius`. The visual appearance, including distinct
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
 * import { UltrasoundPleuraBLineAnnotationTool, ToolGroupManager, Enums, addTool } from '@cornerstonejs/tools';
import { canvasCoordinates } from '../../utilities/math/circle/_types';
import { getUnknownVolumeLoaderSchema } from '../../../../core/src/loaders/volumeLoader';
import { deriveFanGeometry } from './utils/deriveFanGeometry';
import { Point3 } from '../../../../../../.nx/cache/6836589865368719691/packages/core/dist/esm/types/Point3';
import { FanGeometry } from '../../../../../../.nx/cache/283231214975993815/packages/tools/dist/esm/tools/annotation/UltrasoundPleuraBLineAnnotationTool/utils/types';
import { subtractIntervals } from '../../../utilities/math/fan/fanUtils';
 *
 * // Register the tool with the ToolGroupManager (or globally if preferred)
 * addTool(UltrasoundPleuraBLineAnnotationTool);
 *
 * // Create a new tool group or get an existing one
 * const toolGroupId = 'myUltrasoundToolGroup';
 * const toolGroup = ToolGroupManager.getToolGroup(toolGroupId) || ToolGroupManager.createToolGroup(toolGroupId);
 *
 * // Add the UltrasoundPleuraBLineAnnotationTool's name to the tool group
 * toolGroup.addTool(UltrasoundPleuraBLineAnnotationTool.toolName);
 *
 * // Associate a viewport with the tool group
 * toolGroup.addViewport('myViewportId', 'myRenderingEngineId');
 *
 * // Activate the tool for interaction
 * toolGroup.setToolActive(UltrasoundPleuraBLineAnnotationTool.toolName, {
 *   bindings: [
 *     {
 *       mouseButton: Enums.MouseBindings.Primary, // e.g., Left mouse button
 *     },
 *   ],
 * });
 *
 * // Optionally, customize the tool's behavior and appearance
 * toolGroup.setToolConfiguration(UltrasoundPleuraBLineAnnotationTool.toolName, {
 *   center: [128, 128, 0], // Center of the fan in image voxel coordinates (IJK)
 *   innerRadius: 10,          // Inner radius of the fan in image voxel units
 *   outerRadius: 50,          // Outer radius of the fan in image voxel units
 *   bLineColor: 'rgba(0, 255, 0, 0.7)', // Color for B-Line type annotations
 *   pleuraColor: 'rgba(89, 0, 255, 0.7)', // Color for Pleura type annotations
 *   // Note: startAngle and endAngle are typically derived from the drawn line points.
 * });
 * ```
 * If the user do not give the fan shape geometry parameters it will be derived
 * via US image segmentation. The method gives a good rough estimate of the US fan shape
 * if the US is completely enclosed by a black background and should not be
 * considered as the best parameters.
 *
 * For comprehensive details on API, configuration options, and advanced usage patterns,
 * refer to the official CornerstoneJS documentation.
 */
class UltrasoundPleuraBLineTool extends AnnotationTool {
  static toolName = 'UltrasoundPleuraBLineTool';

  /**
   * Enum for ultrasound annotation types
   */
  static USPleuraBLineAnnotationType = {
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
  pleuraAnnotations: UltrasoundPleuraBLineAnnotation[] = [];
  bLineAnnotations: UltrasoundPleuraBLineAnnotation[] = [];

  /**
   * constructor for the UltrasoundPleuraBLineTool
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
        center: null as Types.Point3,
        innerRadius: null,
        outerRadius: null,
        startAngle: null,
        endAngle: null,
        bLineColor: 'rgb(60, 255, 60)',
        pleuraColor: 'rgb(0, 4, 255)',
        drawDepthGuide: true,
        depth_ratio: 0.5,
        depthGuideColor: 'rgb(0, 255, 255)',
        depthGuideThickness: 4,
        depthGuideDashLength: 20,
        depthGuideDashGap: 16,
        depthGuideOpacity: 0.2,
        fanOpacity: 0.1,
        showFanAnnotations: true,
        updatePercentageCallback: null,
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
    this.activeAnnotationType =
      UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE;
  }

  /**
   * Filters annotations based on a provided filter function.
   * @param {HTMLDivElement} element - The HTML element containing the annotations.
   * @param {FilterFunction} filterFunction - A function that takes an imageId and returns a boolean.
   * If not provided, all annotations will be returned.
   * @returns {UltrasoundPleuraBLineAnnotation[]} An array of filtered ultrasound annotations.
   */
  public static filterAnnotations(
    element: HTMLDivElement,
    filterFunction: FilterFunction = () => true
  ): UltrasoundPleuraBLineAnnotation[] {
    const annotations = getAnnotations(
      UltrasoundPleuraBLineTool.toolName,
      element
    );
    if (!annotations?.length) {
      return [];
    }
    const filteredAnnotations = annotations.filter((annotation) => {
      const currentImageId = annotation.metadata.referencedImageId;
      return filterFunction(currentImageId);
    });
    return filteredAnnotations as UltrasoundPleuraBLineAnnotation[];
  }

  /**
   * Counts the number of annotations per image ID.
   * @param {HTMLDivElement} element - The HTML element.
   * @param {FilterFunction} filterFunction - A function that takes an imageId and returns a boolean to filter annotations.
   * If not provided, all annotations will be counted.
   * @returns {Map<string, {frame:number, bLine: number, pleura: number}>} A map of image IDs to annotation counts.
   */
  public static countAnnotations(
    element: HTMLDivElement,
    filterFunction: FilterFunction = () => true
  ) {
    const annotations = getAnnotations(
      UltrasoundPleuraBLineTool.toolName,
      element
    );
    const { viewport } = getEnabledElement(element);
    const imageIds = viewport.getImageIds();

    const getImageIdIndex = (imageId: string) => {
      const index = imageIds.findIndex((id) => id === imageId);
      if (index === -1) {
        return 0;
      }
      return index;
    };

    if (!annotations?.length) {
      return;
    }
    const annotationMapping = new Map();
    annotations.forEach((annotation) => {
      const currentImageId = annotation.metadata.referencedImageId;
      if (!filterFunction(currentImageId)) {
        return;
      }
      const { annotationType } = annotation.data;
      let counts;
      if (annotationMapping.has(currentImageId)) {
        counts = annotationMapping.get(currentImageId);
      } else {
        counts = {
          frame: getImageIdIndex(currentImageId),
          bLine: 0,
          pleura: 0,
        };
      }
      if (
        annotationType ===
        UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA
      ) {
        counts.pleura++;
      } else if (
        annotationType ===
        UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE
      ) {
        counts.bLine++;
      }
      annotationMapping.set(currentImageId, counts);
    });
    return annotationMapping;
  }

  /**
   * Deletes annotations based on a provided filter function.
   * @param {HTMLDivElement} element - The HTML element.
   * @param {FilterFunction} filterFunction - A function that takes an imageId and returns a boolean to filter annotations for deletion.
   * If not provided or returns false for all annotations, no annotations will be deleted.
   * @returns {void}
   */
  public static deleteAnnotations(
    element: HTMLDivElement,
    filterFunction: FilterFunction = () => false
  ) {
    const annotations = getAnnotations(
      UltrasoundPleuraBLineTool.toolName,
      element
    );

    if (!annotations?.length) {
      return;
    }
    annotations.forEach((annotation) => {
      if (!filterFunction(annotation.metadata.referencedImageId)) {
        return;
      }
      removeAnnotation(annotation.annotationUID);
    });
  }

  /**
   * Sets the active annotation type (bLine or pleura)
   * @param type - annotation type from UltrasoundPleuraBLineAnnotationTool.USAnnotationType
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
   * Deletes the last annotation of a specific type.
   * @param {HTMLDivElement} element - The HTML element containing the annotations.
   * @param {string} type - The annotation type to delete (UltrasoundPleuraBLineAnnotationTool.USAnnotationType.PLEURA or UltrasoundPleuraBLineAnnotationTool.USAnnotationType.BLINE).
   * @returns {void}
   */
  public deleteLastAnnotationType(element: HTMLDivElement, type: string) {
    let annotationList;
    const annotations = getAnnotations(
      UltrasoundPleuraBLineTool.toolName,
      element
    );
    if (type === UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA) {
      annotationList = annotations.filter(
        (annotation) =>
          annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA
      );
    } else if (
      type === UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE
    ) {
      annotationList = annotations.filter(
        (annotation) =>
          annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE
      );
    }
    if (annotationList?.length > 0) {
      const annotation = annotationList.pop();
      removeAnnotation(annotation.annotationUID);
    }
  }

  /**
   * Hydrates an UltrasoundPleuraBLineAnnotation from a set of points and options.
   * @param {string} viewportId - The ID of the viewport.
   * @param {Types.Point3[]} points - The points to hydrate from.
   * @param {object} options - The options to hydrate with.
   * @param {string} options.annotationUID - The annotation UID.
   * @param {UltrasoundPleuraBLineAnnotationTool} options.toolInstance - The tool instance.
   * @param {string} options.referencedImageId - The referenced image ID.
   * @param {Types.Point3} options.viewplaneNormal - The viewplane normal.
   * @param {Types.Point3} options.viewUp - The view up.
   * @returns {UltrasoundPleuraBLineAnnotation} The hydrated annotation.
   */
  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: UltrasoundPleuraBLineTool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): UltrasoundPleuraBLineAnnotation => {
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
    } = this.hydrateBase<UltrasoundPleuraBLineTool>(
      UltrasoundPleuraBLineTool,
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
   * Adds a new annotation based on the current mouse position and image ID.
   * @param {EventTypes.InteractionEventType} evt - The event.
   * @returns {UltrasoundPleuraBLineAnnotation} The new annotation object.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): UltrasoundPleuraBLineAnnotation => {
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

    return annotation as UltrasoundPleuraBLineAnnotation;
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
    annotation: UltrasoundPleuraBLineAnnotation,
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
    annotation: UltrasoundPleuraBLineAnnotation
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
    annotation: UltrasoundPleuraBLineAnnotation,
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
   * Checks if a point is inside the fan shape defined by the tool's configuration
   * @param viewport - The viewport to check against
   * @param point - The 3D point to check
   * @returns {boolean} True if the point is inside the fan shape, false otherwise
   */
  isInsideFanShape(viewport, point: Types.Point3) {
    if (!this.getFanShapeGeometryParameters(viewport)) {
      return false;
    }
    const { imageData } = viewport.getImageData() || {};
    if (imageData) {
      const fanCenter = viewport.worldToCanvas(
        imageData.indexToWorld(this.configuration.center)
      );

      const canvasCoordinates = viewport.worldToCanvas(point);
      const angle = angleFromCenter(fanCenter, canvasCoordinates);
      return (
        angle >= this.configuration.startAngle &&
        angle <= this.configuration.endAngle
      );
    }
  }
  /**
   * Callback that is called when the tool is dragged
   * @param evt - event
   * @returns {void}
   */
  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { viewport } = getEnabledElement(element) || {};
    if (!viewport) {
      return;
    }

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

      // Check if all points + worldPosDelta are inside the shape
      const allPointsInsideShape = points.every((point) => {
        const newPoint = [
          point[0] + worldPosDelta[0],
          point[1] + worldPosDelta[1],
          point[2] + worldPosDelta[2],
        ] as Types.Point3;
        return this.isInsideFanShape(viewport, newPoint);
      });

      // Only modify points if all are inside the shape
      if (allPointsInsideShape) {
        points.forEach((point) => {
          point[0] += worldPosDelta[0];
          point[1] += worldPosDelta[1];
          point[2] += worldPosDelta[2];
        });
        annotation.invalidated = true;
      }
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      if (this.isInsideFanShape(viewport, worldPos)) {
        data.handles.points[handleIndex] = [...worldPos];
        annotation.invalidated = true;
      }
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
   * Updates the fan geometry configuration with the provided parameters
   * @param fanGeometry - The fan geometry parameters to update the configuration with
   * @returns {void}
   */
  updateFanGeometryConfiguration(fanGeometry: FanGeometry) {
    if (!fanGeometry) {
      return;
    }
    if (this.isFanShapeGeometryParametersValid(fanGeometry)) {
      this.configuration.center = [
        fanGeometry.center[0],
        fanGeometry.center[1],
        0,
      ];
    }
    this.configuration.innerRadius = fanGeometry.innerRadius;
    this.configuration.outerRadius = fanGeometry.outerRadius;
    this.configuration.startAngle = fanGeometry.startAngle;
    this.configuration.endAngle = fanGeometry.endAngle;
  }
  /**
   * Derive the fan shape geometry parameters via US image segmentation, if the
   * parameters were not defined
   * @param viewport - The viewport to derive fan geometry from
   * @returns {void}
   */
  deriveFanGeometryFromViewport(viewport) {
    const imageId = viewport.getCurrentImageId();
    const { fanGeometry } = calculateFanGeometry(imageId) || {};
    if (fanGeometry) {
      this.updateFanGeometryConfiguration(fanGeometry);
    }
  }

  /**
   * Check fan shape geometry parameters
   * @param fanGeometry - Optional fan geometry to check, if not provided uses the tool's configuration
   * @returns {boolean} True if the fan geometry parameters are valid, false otherwise
   */
  isFanShapeGeometryParametersValid(fanGeometry?: FanGeometry): boolean {
    if (!fanGeometry) {
      fanGeometry = this.configuration as FanGeometry;
    }
    return (
      fanGeometry?.center &&
      fanGeometry?.innerRadius > 0 &&
      fanGeometry?.outerRadius &&
      fanGeometry?.startAngle > 0 &&
      fanGeometry?.startAngle < 360 &&
      fanGeometry?.endAngle > 0 &&
      fanGeometry?.endAngle < 360
    );
  }

  /**
   * Gets the fan shape geometry parameters, attempting to derive them if they are invalid
   * @param viewport - The viewport to get or derive fan geometry from
   * @returns {boolean} True if valid fan geometry parameters are available, false otherwise
   */
  getFanShapeGeometryParameters(viewport): boolean {
    if (this.isFanShapeGeometryParametersValid()) {
      return true;
    }
    if (!this.isFanShapeGeometryParametersValid()) {
      const imageId = viewport.getCurrentImageId();
      const fanGeometry = metaData.get(
        'ultrasoundFanShapeGeometry',
        imageId
      ) as FanGeometry;
      this.updateFanGeometryConfiguration(fanGeometry);
    }
    if (!this.isFanShapeGeometryParametersValid()) {
      this.deriveFanGeometryFromViewport(viewport);
    }
    return this.isFanShapeGeometryParametersValid();
  }

  /**
   * Calculates the percentage of bLine inside the pleura for the current image
   * @param viewport - viewport
   * @returns {number} percentage of bLine inside the pleura for the current image
   */
  calculateBLinePleuraPercentage(viewport): number {
    if (!this.getFanShapeGeometryParameters(viewport)) {
      return;
    }
    const { imageData } = viewport.getImageData() || {};
    if (!imageData) {
      return;
    }
    const { element } = viewport;
    const fanCenter = viewport.worldToCanvas(
      imageData.indexToWorld(this.configuration.center)
    );

    const currentImageId = viewport.getCurrentImageId();

    // Get all annotations from the annotation state
    const annotations = getAnnotations(this.getToolName(), element) || [];

    // Filter and map pleura annotations
    const pleuraIntervals = annotations
      .filter(
        (annotation) =>
          annotation.data.annotationType ===
            UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA &&
          annotation.metadata.referencedImageId === currentImageId
      )
      .map((annotation) => {
        const canvasCoordinates = annotation.data.handles.points.map((p) =>
          viewport.worldToCanvas(p)
        );

        return canvasCoordinates;
      });

    // Filter and map bLine annotations
    const bLineIntervals = annotations
      .filter(
        (annotation) =>
          annotation.data.annotationType ===
            UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE &&
          annotation.metadata.referencedImageId === currentImageId
      )
      .map((annotation) => {
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
  getColorForLineType(annotation: UltrasoundPleuraBLineAnnotation) {
    const { annotationType } = annotation.data;
    const { bLineColor, pleuraColor } = this.configuration;

    if (
      annotationType ===
      UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE
    ) {
      return bLineColor;
    }

    if (
      annotationType ===
      UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA
    ) {
      return pleuraColor;
    }

    return bLineColor;
  }
  /**
   * Calculates the ratio between index coordinates and canvas coordinates
   * @param viewport - The viewport to calculate the ratio for
   * @returns {number} The ratio between index and canvas coordinates
   */
  getIndexToCanvasRatio(viewport): number {
    const { imageData } = viewport.getImageData() || {};
    const v1 = viewport.worldToCanvas(imageData.indexToWorld([1, 0, 0]));
    const v2 = viewport.worldToCanvas(imageData.indexToWorld([2, 0, 0]));
    const diffVector = [v2[0] - v1[0], v2[1] - v1[1]];
    const vectorSize = Math.sqrt(
      diffVector[0] * diffVector[0] + diffVector[1] * diffVector[1]
    );
    return vectorSize;
  }

  /**
   * Draws the depth guide lines on the ultrasound fan
   * @param svgDrawingHelper - The SVG drawing helper
   * @param viewport - The viewport to draw on
   * @returns {void}
   */
  drawDepthGuide(svgDrawingHelper: SVGDrawingHelper, viewport) {
    if (!this.getFanShapeGeometryParameters(viewport)) {
      return;
    }

    const { imageData } = viewport.getImageData() || {};
    if (!imageData) {
      return;
    }

    const radToDegree = (rad) => (rad * 180) / Math.PI;
    const degreeToRad = (degree) => (degree * Math.PI) / 180;
    const indexToCanvas = (point: Types.Point3): Types.Point2 => {
      return viewport.worldToCanvas(transformIndexToWorld(imageData, point));
    };

    const depth_radius =
      this.configuration.innerRadius +
      this.configuration.depth_ratio *
        (this.configuration.outerRadius - this.configuration.innerRadius);

    const theta_start = this.configuration.startAngle;
    const theta_end = this.configuration.endAngle;
    const theta_range = theta_end - theta_start;
    const arc_length = degreeToRad(theta_range) * depth_radius;
    let num_dashes = Math.round(
      arc_length /
        (this.configuration.depthGuideDashLength +
          this.configuration.depthGuideDashGap)
    );
    if (num_dashes <= 0) {
      num_dashes = Math.max(15, Math.round(theta_range / 5));
    }
    const theta_step = theta_range / num_dashes;
    for (let i = 0; i < num_dashes; i++) {
      const theta1 = degreeToRad(theta_start + i * theta_step);
      const theta2 = degreeToRad(
        theta_start +
          i * theta_step +
          radToDegree(this.configuration.depthGuideDashLength) / depth_radius
      );

      const start_point = [
        this.configuration.center[0] + depth_radius * Math.cos(theta1),
        this.configuration.center[1] + depth_radius * Math.sin(theta1),
        0,
      ] as Types.Point3;
      const end_point = [
        this.configuration.center[0] + depth_radius * Math.cos(theta2),
        this.configuration.center[1] + depth_radius * Math.sin(theta2),
        0,
      ] as Types.Point3;
      drawLineSvg(
        svgDrawingHelper,
        viewport.id,
        `depthGuide-${i}`,
        indexToCanvas(start_point),
        indexToCanvas(end_point),
        {
          color: this.configuration.depthGuideColor,
          lineWidth: this.configuration.depthGuideThickness,
          strokeOpacity: this.configuration.depthGuideOpacity,
        }
      );
    }
  }
  /**
   * It is used to draw the length annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it. Only annotations from the current image
   * are rendered.
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

    if (!this.getFanShapeGeometryParameters(viewport)) {
      return;
    }
    const { imageData } = viewport.getImageData() || {};
    if (!imageData) {
      return renderStatus;
    }

    if (this.configuration.drawDepthGuide) {
      this.drawDepthGuide(svgDrawingHelper, viewport);
    }
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

    const fanCenter = viewport.worldToCanvas(
      transformIndexToWorld(imageData, this.configuration.center)
    );

    const indexToCanvasRatio = this.getIndexToCanvasRatio(viewport);
    const innerRadius = this.configuration.innerRadius * indexToCanvasRatio;
    const outerRadius = this.configuration.outerRadius * indexToCanvasRatio;
    const currentImageId = viewport.getCurrentImageId();

    // Get all pleura intervals from current imageId and merge them
    const unMergedPleuraIntervals = annotations
      .filter(
        (annotation) =>
          annotation.data.annotationType ===
            UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA &&
          annotation.metadata.referencedImageId === currentImageId
      )
      .map((annotation) => {
        const canvasCoordinates = annotation.data.handles.points.map((p) =>
          viewport.worldToCanvas(p)
        );

        const interval = intervalFromPoints(
          fanCenter,
          canvasCoordinates as FanPair
        );
        return interval;
      });
    const mergedPleuraIntervals = mergeIntervals(unMergedPleuraIntervals);

    const pleuraIntervalsDisplayed = [];
    const bLineIntervalsDisplayed = [];
    // Draw SVG function
    const drawAnnotation = (annotation: UltrasoundPleuraBLineAnnotation) => {
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
        return;
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
            color: this.getColorForLineType(annotation),
            fill: this.getColorForLineType(annotation),
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
          color: this.getColorForLineType(annotation),
          width: lineWidth,
          lineDash,
          shadow,
        },
        dataId
      );

      if (this.configuration.showFanAnnotations) {
        // drawFan
        const lineInterval = intervalFromPoints(
          fanCenter,
          canvasCoordinates as FanPair
        );

        let fanNumber = 0;
        if (
          annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE
        ) {
          const uncoveredIntervals = subtractIntervals(
            bLineIntervalsDisplayed,
            lineInterval
          );
          uncoveredIntervals.forEach((interval) => {
            const clippedIntervals = clipInterval(
              interval,
              mergedPleuraIntervals
            );
            clippedIntervals.forEach((clippedInterval) => {
              fanNumber++;
              const fanIndex = fanNumber;
              const fanDataId = `${annotationUID}-fan-${fanIndex}`;
              const fanUID = `2-${fanIndex}`;
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
                  color: 'transparent',
                  fill: this.getColorForLineType(annotation),
                  fillOpacity: this.configuration.fanOpacity,
                  width: lineWidth,
                  lineDash,
                  shadow,
                },
                fanDataId,
                10 // Higher z-index for bline annotations to appear on top
              );
              bLineIntervalsDisplayed.push(clippedInterval);
            });
          });
        } else if (
          annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA
        ) {
          const uncoveredIntervals = subtractIntervals(
            pleuraIntervalsDisplayed,
            lineInterval
          );
          uncoveredIntervals.forEach((interval, index) => {
            fanNumber++;
            const fanIndex = fanNumber;
            const fanDataId = `${annotationUID}-fan-${fanIndex}`;
            const fanUID = `2-${fanIndex}`;
            drawFanSvg(
              svgDrawingHelper,
              annotationUID,
              fanUID,
              fanCenter,
              innerRadius,
              outerRadius,
              interval[0],
              interval[1],
              {
                color: 'transparent',
                fill: this.getColorForLineType(annotation),
                fillOpacity: this.configuration.fanOpacity,
                width: lineWidth,
                lineDash,
                shadow,
              },
              fanDataId,
              5 // Lower z-index for pleura annotations to appear below bline annotations
            );
            pleuraIntervalsDisplayed.push(interval);
          });
        }
      }
    };

    // Draw pleura annotations
    const pleuraAnnotationsToDraw = annotations.filter(
      (annotation) =>
        annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.PLEURA &&
        annotation.metadata.referencedImageId === currentImageId
    );
    pleuraAnnotationsToDraw.forEach((annotation) => {
      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }
      drawAnnotation(annotation as UltrasoundPleuraBLineAnnotation);
    });

    // Draw BLine annotations
    const bLineAnnotationsToDraw = annotations.filter(
      (annotation) =>
        annotation.data.annotationType ===
          UltrasoundPleuraBLineTool.USPleuraBLineAnnotationType.BLINE &&
        annotation.metadata.referencedImageId === currentImageId
    );
    bLineAnnotationsToDraw.forEach((annotation) => {
      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }
      drawAnnotation(annotation as UltrasoundPleuraBLineAnnotation);
    });
    renderStatus = true;

    if (this.configuration.updatePercentageCallback && viewport) {
      this.configuration.updatePercentageCallback(
        this.calculateBLinePleuraPercentage(viewport)
      );
    }
    return renderStatus;
  };

  /**
   * Checks if the given indices are inside the volume dimensions
   * @param index1 - First index to check
   * @param index2 - Second index to check
   * @param dimensions - The dimensions of the volume
   * @returns {boolean} True if both indices are inside the volume, false otherwise
   */
  _isInsideVolume(index1, index2, dimensions) {
    return (
      utilities.indexWithinDimensions(index1, dimensions) &&
      utilities.indexWithinDimensions(index2, dimensions)
    );
  }
}

function defaultGetTextLines(data, targetId): string[] {
  return [''];
}

export default UltrasoundPleuraBLineTool;
