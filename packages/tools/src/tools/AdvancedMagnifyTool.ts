import { AnnotationTool } from './base';

import {
  getEnabledElement,
  utilities as csUtils,
  eventTarget,
  Enums,
  getRenderingEngine,
  CONSTANTS,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAllAnnotations,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import { triggerAnnotationCompleted } from '../stateManagement/annotation/helpers/state';
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
} from '../drawingSvg';
import { state } from '../store/state';
import {
  Events,
  MouseBindings,
  KeyboardBindings,
  Events as cstEvents,
  SegmentationRepresentations,
  ToolModes,
} from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import type {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
  IToolGroup,
} from '../types';
import type { AdvancedMagnifyAnnotation } from '../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import type { StyleSpecifier } from '../types/AnnotationStyle';
import { getCanvasCircleRadius } from '../utilities/math/circle';

import { vec2, vec3 } from 'gl-matrix';
import { getToolGroupForViewport } from '../store/ToolGroupManager';
import debounce from '../utilities/debounce';
import type {
  AnnotationRemovedEventType,
  ToolModeChangedEventType,
} from '../types/EventTypes';
import { distanceToPoint } from '../utilities/math/point';
import { addSegmentationRepresentations } from '../stateManagement/segmentation';

const MAGNIFY_CLASSNAME = 'advancedMagnifyTool';
const MAGNIFY_VIEWPORT_INITIAL_RADIUS = 125;
const { Events: csEvents } = Enums;

// TODO: find a better to identify segmentation actors
const isSegmentation = (actor) => actor.uid !== actor.referencedId;

export type AutoPanCallbackData = {
  points: {
    currentPosition: {
      canvas: Types.Point2;
      world: Types.Point3;
    };
    newPosition: {
      canvas: Types.Point2;
      world: Types.Point3;
    };
  };
  delta: {
    canvas: Types.Point2;
    world: Types.Point3;
  };
};

export type AutoPanCallback = (data: AutoPanCallbackData) => void;

enum AdvancedMagnifyToolActions {
  ShowZoomFactorsList = 'showZoomFactorsList',
}

// Defined the tool name internally instead of importing
// AdvancedMagnifyTool due to cyclic dependency
const ADVANCED_MAGNIFY_TOOL_NAME = 'AdvancedMagnify';

const PARALLEL_THRESHOLD = 1 - CONSTANTS.EPSILON;

export type MagnifyViewportInfo = {
  // Viewport id to be used or new v4 compliant GUID is used instead
  magnifyViewportId?: string;
  // Enabled element where the magnifying glass shall be added to
  sourceEnabledElement: Types.IEnabledElement;
  // Magnifying glass position (center)
  position: Types.Point2;
  // Magnifying glass radius (pixels)
  radius: number;
  // Amount of magnification applied to the magnifying glass image compared to the source viewport.
  zoomFactor: number;
  // Allow panning the viewport when moving an annotation point close to the border of the magnifying glass
  autoPan: {
    // Enable or disable auto pan
    enabled: boolean;
    // Minimum distance to the border before start auto panning
    padding: number;
    // Callback function responsible for updating the annotation (circle)
    // that contains the magnifying viewport
    callback: AutoPanCallback;
  };
};

type MagnifyViewportsMapEntry = {
  annotation: AdvancedMagnifyAnnotation;
  magnifyViewport: AdvancedMagnifyViewport;
  magnifyViewportInfo: MagnifyViewportInfo;
};

// New abstraction layer
interface MagnifyViewportManager {
  createViewport(
    annotation: AdvancedMagnifyAnnotation,
    viewportInfo: MagnifyViewportInfo
  ): AdvancedMagnifyViewport;
  getViewport(magnifyViewportId: string): AdvancedMagnifyViewport;
  destroyViewport(magnifyViewportId: string): void;
  dispose(): void;
}

class AdvancedMagnifyTool extends AnnotationTool {
  static toolName;
  static Actions = AdvancedMagnifyToolActions;

  magnifyViewportManager: MagnifyViewportManager;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        magnifyingGlass: {
          radius: 125, // px
          zoomFactor: 3,
          zoomFactorList: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
          autoPan: {
            enabled: true,
            padding: 10, // px
          },
        },
        actions: {
          showZoomFactorsList: {
            method: 'showZoomFactorsList',
            bindings: [
              {
                mouseButton: MouseBindings.Secondary,
                modifierKey: KeyboardBindings.Shift,
              },
            ],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.magnifyViewportManager = AdvancedMagnifyViewportManager.getInstance();
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): AdvancedMagnifyAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const { magnifyingGlass: config } = this.configuration;
    const { radius, zoomFactor, autoPan } = config;

    const canvasHandlePoints = this._getCanvasHandlePoints(
      canvasPos,
      radius
    ) as [Types.Point3, Types.Point3, Types.Point3, Types.Point3];

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotationUID = csUtils.uuidv4();
    const magnifyViewportId = csUtils.uuidv4();
    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation: AdvancedMagnifyAnnotation = {
      annotationUID,
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        sourceViewportId: viewport.id,
        magnifyViewportId,
        zoomFactor,
        // this means that the last coordinate for the points
        // is 0 and should not be used for calculations
        isCanvasAnnotation: true,
        handles: {
          points: canvasHandlePoints,
          activeHandleIndex: null,
        },
      },
    };

    this.magnifyViewportManager.createViewport(annotation, {
      magnifyViewportId,
      sourceEnabledElement: enabledElement,
      position: canvasPos,
      radius,
      zoomFactor,
      autoPan: {
        enabled: autoPan.enabled,
        padding: autoPan.padding,
        callback: (data: AutoPanCallbackData) => {
          const annotationPoints = annotation.data.handles.points;
          const { canvas: canvasDelta } = data.delta;

          for (let i = 0, len = annotationPoints.length; i < len; i++) {
            const point = annotationPoints[i];
            point[0] += canvasDelta[0];
            point[1] += canvasDelta[1];
            annotation.invalidated = true;
          }
        },
      },
    });

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    evt.preventDefault();
    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation;
  };

  onSetToolDisabled = () => {
    // reset
    this.magnifyViewportManager.dispose();
    // remove the annotations from the state for that toolGroup
    const annotations = getAllAnnotations();
    annotations.forEach((annotation) => {
      if (annotation.metadata.toolName === this.getToolName()) {
        removeAnnotation(annotation.annotationUID);
      }
    });
  };

  /**
   * It returns if the canvas point is near the provided annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  public isPointNearTool = (
    element: HTMLDivElement,
    annotation: AdvancedMagnifyAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const { data } = annotation;
    const { points } = data.handles;

    // For some reason Typescript doesn't understand this, so we need to be
    // more specific about the type
    const canvasCoordinates = points;

    const canvasTop = canvasCoordinates[0];
    const canvasBottom = canvasCoordinates[2];
    const canvasLeft = canvasCoordinates[3];
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const center = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ] as Types.Point2;
    const radiusPoint = getCanvasCircleRadius([center, canvasCoords]);

    if (Math.abs(radiusPoint - radius) < proximity * 2) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation
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
    };

    hideElementCursor(element);

    this._activateModify(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    const { points } = data.handles;
    const handleIndex = points.findIndex((p) => p === handle);

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);

    resetElementCursor(element);

    this.editData = null;
    this.isDrawing = false;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
  };

  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { deltaPoints } = eventDetail;
    const canvasDelta = deltaPoints?.canvas ?? [0, 0, 0];

    const { annotation, viewportIdsToRender } = this.editData;
    const { points } = annotation.data.handles;

    points.forEach((point) => {
      point[0] += canvasDelta[0];
      point[1] += canvasDelta[1];
    });

    annotation.invalidated = true;
    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventDetail;
      const canvasDelta = deltaPoints.canvas;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += canvasDelta[0];
        point[1] += canvasDelta[1];
      });
      annotation.invalidated = true;
    } else {
      this._dragHandle(evt);
      annotation.invalidated = true;
    }

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _dragHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;

    const { annotation } = this.editData;
    const { data } = annotation;
    const { points } = data.handles;

    const canvasCoordinates = points;
    const canvasTop = canvasCoordinates[0];
    const canvasBottom = canvasCoordinates[2];
    const canvasLeft = canvasCoordinates[3];
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const canvasCenter: Types.Point2 = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ];

    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;

    const newRadius = getCanvasCircleRadius([
      canvasCenter,
      currentCanvasPoints,
    ]);
    const newCanvasHandlePoints = this._getCanvasHandlePoints(
      canvasCenter,
      newRadius
    );

    // @ts-ignore
    points[0] = newCanvasHandlePoints[0];
    // @ts-ignore
    points[1] = newCanvasHandlePoints[1];
    // @ts-ignore
    points[2] = newCanvasHandlePoints[2];
    // @ts-ignore
    points[3] = newCanvasHandlePoints[3];
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (!this.isDrawing) {
      return;
    }

    this.isDrawing = false;
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
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the circleROI annotation in each
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

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = annotations?.filter(
      (annotation) =>
        (<AdvancedMagnifyAnnotation>annotation).data.sourceViewportId ===
        viewport.id
    );

    const filteredAnnotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!filteredAnnotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < filteredAnnotations.length; i++) {
      const annotation = filteredAnnotations[i] as AdvancedMagnifyAnnotation;
      const { annotationUID, data } = annotation;
      const { magnifyViewportId, zoomFactor, handles } = data;
      const { points, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points;
      const canvasTop = canvasCoordinates[0];
      const canvasBottom = canvasCoordinates[2];
      const canvasLeft = canvasCoordinates[3];
      const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
      const center = [
        canvasLeft[0] + radius,
        canvasTop[1] + radius,
      ] as Types.Point2;

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
          activeHandleCanvasCoords,
          {
            color,
          }
        );
      }

      const dataId = `${annotationUID}-advancedMagnify`;
      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        center,
        radius,
        {
          color,
          lineWidth: 5,
        },
        dataId
      );

      const magnifyViewport =
        this.magnifyViewportManager.getViewport(magnifyViewportId);

      magnifyViewport.position = center;
      magnifyViewport.radius = radius;
      magnifyViewport.zoomFactor = zoomFactor;
      magnifyViewport.update();

      renderStatus = true;
    }

    return renderStatus;
  };

  // Basic dropdown component that allows the user to select a different zoom factor.
  // configurations.actions may be changed to use a customized dropdown.
  public showZoomFactorsList(
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation
  ) {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvas: canvasPoint } = currentPoints;
    const viewportElement = element.querySelector(':scope .viewport-element');
    const currentZoomFactor = annotation.data.zoomFactor;
    const remove = () => dropdown.parentElement.removeChild(dropdown);

    const dropdown = this._getZoomFactorsListDropdown(
      currentZoomFactor,
      (newZoomFactor) => {
        if (newZoomFactor !== undefined) {
          annotation.data.zoomFactor = Number.parseFloat(newZoomFactor);
          annotation.invalidated = true;
        }

        remove();
        viewport.render();
      }
    );

    Object.assign(dropdown.style, {
      left: `${canvasPoint[0]}px`,
      top: `${canvasPoint[1]}px`,
    });

    viewportElement.appendChild(dropdown);
    dropdown.focus();
  }

  private _getZoomFactorsListDropdown(currentZoomFactor, onChangeCallback) {
    const { zoomFactorList } = this.configuration.magnifyingGlass;
    const dropdown = document.createElement('select');

    dropdown.size = 5;
    Object.assign(dropdown.style, {
      width: '50px',
      position: 'absolute',
    });

    ['mousedown', 'mouseup', 'mousemove', 'click'].forEach((eventName) => {
      dropdown.addEventListener(eventName, (evt) => evt.stopPropagation());
    });

    dropdown.addEventListener('change', (evt) => {
      evt.stopPropagation();
      onChangeCallback(dropdown.value);
    });

    dropdown.addEventListener('keydown', (evt) => {
      const shouldCancel =
        (evt.keyCode ?? evt.which === 27) ||
        evt.key?.toLowerCase() === 'escape';

      if (shouldCancel) {
        evt.stopPropagation();
        onChangeCallback();
      }
    });

    zoomFactorList.forEach((zoomFactor) => {
      const option = document.createElement('option');

      option.label = zoomFactor;
      option.title = `Zoom factor ${zoomFactor.toFixed(1)}`;
      option.value = zoomFactor;
      option.defaultSelected = zoomFactor === currentZoomFactor;

      dropdown.add(option);
    });

    return dropdown;
  }

  private _getCanvasHandlePoints = (canvasCenterPos, canvasRadius) => {
    return [
      [canvasCenterPos[0], canvasCenterPos[1] - canvasRadius, 0], // top
      [canvasCenterPos[0] + canvasRadius, canvasCenterPos[1], 0], // right
      [canvasCenterPos[0], canvasCenterPos[1] + canvasRadius, 0], // bottom
      [canvasCenterPos[0] - canvasRadius, canvasCenterPos[1], 0], // left
    ];
  };
}

/**
 * Manager responsible for creating, storing and destroying magnifying glass
 * viewports. There are no restrictions to create a new instance of it but it
 * should be accessed through getInstance() method.
 */
class AdvancedMagnifyViewportManager {
  private static _singleton: AdvancedMagnifyViewportManager;
  private _magnifyViewportsMap: Map<string, MagnifyViewportsMapEntry>;

  constructor() {
    this._magnifyViewportsMap = new Map();
    this._initialize();
  }

  /**
   * Creates a new magnifying glass viewport manager instance when this method is
   * called for the first time or return the instance previously created for
   * any subsequent call (singleton pattern).
   * @returns A magnifying viewport manager instance
   */
  public static getInstance(): AdvancedMagnifyViewportManager {
    AdvancedMagnifyViewportManager._singleton =
      AdvancedMagnifyViewportManager._singleton ??
      new AdvancedMagnifyViewportManager();

    return AdvancedMagnifyViewportManager._singleton;
  }

  /**
   * Creates a new magnifying glass viewport instance
   * @param viewportInfo - Viewport data used when creating a new magnifying glass viewport
   * @returns A magnifying glass viewport instance
   */
  public createViewport = (
    annotation: AdvancedMagnifyAnnotation,
    viewportInfo: MagnifyViewportInfo
  ): AdvancedMagnifyViewport => {
    const {
      magnifyViewportId,
      sourceEnabledElement,
      position,
      radius,
      zoomFactor,
      autoPan,
    } = viewportInfo;
    const { viewport: sourceViewport } = sourceEnabledElement;
    const { element: sourceElement } = sourceViewport;

    const magnifyViewport = new AdvancedMagnifyViewport({
      magnifyViewportId,
      sourceEnabledElement,
      radius,
      position,
      zoomFactor,
      autoPan,
    });

    this._addSourceElementEventListener(sourceElement);
    this._magnifyViewportsMap.set(magnifyViewport.viewportId, {
      annotation,
      magnifyViewport,
      magnifyViewportInfo: viewportInfo,
    });

    return magnifyViewport;
  };

  /**
   * Find and return a magnifying glass viewport based on its id
   * @param magnifyViewportId - Magnifying glass viewport id
   * @returns A magnifying glass viewport instance
   */
  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._magnifyViewportsMap.get(magnifyViewportId)?.magnifyViewport;
  }

  /**
   * Release all magnifying glass viewport instances and remove all event
   * listeners making all objects available to be garbage collected.
   */
  public dispose() {
    this._removeEventListeners();
    this._destroyViewports();
  }

  public destroyViewport(magnifyViewportId: string) {
    const magnifyViewportMapEntry =
      this._magnifyViewportsMap.get(magnifyViewportId);

    if (magnifyViewportMapEntry) {
      const { magnifyViewport } = magnifyViewportMapEntry;
      const { viewport: sourceViewport } = magnifyViewport.sourceEnabledElement;
      const { element: sourceElement } = sourceViewport;

      this._removeSourceElementEventListener(sourceElement);

      magnifyViewport.dispose();
      this._magnifyViewportsMap.delete(magnifyViewportId);
    }
  }

  private _destroyViewports() {
    const magnifyViewportIds = Array.from(this._magnifyViewportsMap.keys());

    magnifyViewportIds.forEach((magnifyViewportId) =>
      this.destroyViewport(magnifyViewportId)
    );
  }

  private _annotationRemovedCallback = (evt: AnnotationRemovedEventType) => {
    const { annotation } = evt.detail;

    if (annotation.metadata.toolName !== ADVANCED_MAGNIFY_TOOL_NAME) {
      return;
    }

    // @ts-ignore
    this.destroyViewport(annotation.data.magnifyViewportId);
  };

  private _getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId) {
    const magnifyViewportsMapEntries = Array.from(
      this._magnifyViewportsMap.values()
    );

    return magnifyViewportsMapEntries.filter(({ magnifyViewport }) => {
      const { viewport } = magnifyViewport.sourceEnabledElement;
      return viewport.id === sourceViewportId;
    });
  }

  private _newStackImageCallback = (
    evt: Types.EventTypes.StackNewImageEvent
  ) => {
    const { viewportId: sourceViewportId, imageId } = evt.detail;
    const magnifyViewportsMapEntries =
      this._getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId);

    const { viewport } = getEnabledElementByViewportId(sourceViewportId);

    // if the viewport was new in terms of image, we need to destroy the magnify
    // viewports and recreate them, the new image might have different dimensions
    // or orientation etc.
    if ((viewport as Types.IStackViewport).stackActorReInitialized) {
      // we should invalidate the viewport as well
      // this will trigger the magnify viewport to be updated
      this._reset(sourceViewportId);
    }

    magnifyViewportsMapEntries.forEach(({ annotation }) => {
      annotation.metadata.referencedImageId = imageId;
      annotation.invalidated = true;
    });
  };

  private _newVolumeImageCallback = (
    evt: Types.EventTypes.VolumeNewImageEvent
  ) => {
    const { renderingEngineId, viewportId: sourceViewportId } = evt.detail;
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const sourceViewport = renderingEngine.getViewport(sourceViewportId);
    const { viewPlaneNormal: currentViewPlaneNormal } =
      sourceViewport.getCamera();

    const magnifyViewportsMapEntries =
      this._getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId);

    magnifyViewportsMapEntries.forEach(({ annotation }) => {
      const { viewPlaneNormal } = annotation.metadata;

      // Compare the normal to make sure the volume is not rotate in 3D space
      const isParallel =
        Math.abs(vec3.dot(viewPlaneNormal, currentViewPlaneNormal)) >
        PARALLEL_THRESHOLD;

      if (!isParallel) {
        return;
      }

      const { handles } = annotation.data;
      const worldImagePlanePoint = sourceViewport.canvasToWorld([0, 0]);
      const vecHandleToImagePlane = vec3.sub(
        vec3.create(),
        worldImagePlanePoint,
        handles.points[0]
      );
      const worldDist = vec3.dot(vecHandleToImagePlane, currentViewPlaneNormal);
      const worldDelta = vec3.scale(
        vec3.create(),
        currentViewPlaneNormal,
        worldDist
      );

      // Move all handle points to the image plane to make the annotation visible
      for (let i = 0, len = handles.points.length; i < len; i++) {
        const point = handles.points[i];

        point[0] += worldDelta[0];
        point[1] += worldDelta[1];
        point[2] += worldDelta[2];
      }

      annotation.invalidated = true;
    });
  };

  private _reset(sourceViewportId: string) {
    const magnifyViewports =
      this._getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId);

    magnifyViewports.forEach(
      ({ magnifyViewport, annotation, magnifyViewportInfo }) => {
        this.destroyViewport(magnifyViewport.viewportId);

        // if it is new image we need to update the magnifyViewportInfo
        // since it might have new image dimensions etc.
        const newEnabledElement =
          getEnabledElementByViewportId(sourceViewportId);

        this.createViewport(annotation, {
          ...magnifyViewportInfo,
          sourceEnabledElement: {
            ...newEnabledElement,
          },
        });
      }
    );
  }

  private _addEventListeners() {
    eventTarget.addEventListener(
      cstEvents.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _removeEventListeners() {
    eventTarget.removeEventListener(
      cstEvents.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _addSourceElementEventListener(element) {
    element.addEventListener(
      csEvents.STACK_NEW_IMAGE,
      this._newStackImageCallback
    );

    const newStackHandler = (evt) => {
      const { viewportId: sourceViewportId } = evt.detail;
      this._reset(sourceViewportId);
    };

    element.addEventListener(csEvents.VIEWPORT_NEW_IMAGE_SET, newStackHandler);

    const newVolumeHandler = (evt) => {
      const { viewportId: sourceViewportId } = evt.detail;
      this._reset(sourceViewportId);
    };
    element.addEventListener(
      csEvents.VOLUME_VIEWPORT_NEW_VOLUME,
      newVolumeHandler
    );

    element.addEventListener(
      csEvents.VOLUME_NEW_IMAGE,
      this._newVolumeImageCallback
    );

    // Store the event handlers to remove later
    element.newStackHandler = newStackHandler;
    element.newVolumeHandler = newVolumeHandler;
  }

  private _removeSourceElementEventListener(element) {
    element.removeEventListener(
      csEvents.STACK_NEW_IMAGE,
      this._newStackImageCallback
    );

    element.removeEventListener(
      csEvents.VOLUME_NEW_IMAGE,
      this._newVolumeImageCallback
    );

    // Remove using the stored handlers
    element.removeEventListener(
      csEvents.VIEWPORT_NEW_IMAGE_SET,
      element.newStackHandler
    );
    element.removeEventListener(
      csEvents.VOLUME_VIEWPORT_NEW_VOLUME,
      element.newVolumeHandler
    );

    // Clean up references
    delete element.newStackHandler;
    delete element.newVolumeHandler;
  }

  private _initialize() {
    this._addEventListeners();
  }
}

class AdvancedMagnifyViewport {
  private _viewportId: string;
  private _sourceEnabledElement: Types.IEnabledElement;
  private _enabledElement: Types.IEnabledElement = null;
  private _sourceToolGroup: IToolGroup = null;
  private _magnifyToolGroup: IToolGroup = null;
  private _isViewportReady = false;
  private _radius = 0;
  private _resized = false;
  private _resizeViewportAsync: () => void;
  private _canAutoPan = false;
  private _autoPan: {
    enabled: boolean;
    padding: number;
    callback: AutoPanCallback;
  };
  public position: Types.Point2;
  public zoomFactor: number;
  public visible: boolean;

  constructor({
    magnifyViewportId,
    sourceEnabledElement,
    radius = MAGNIFY_VIEWPORT_INITIAL_RADIUS,
    position = [0, 0],
    zoomFactor,
    autoPan,
  }: {
    magnifyViewportId?: string;
    sourceEnabledElement: Types.IEnabledElement;
    radius?: number;
    position?: Types.Point2;
    zoomFactor: number;
    autoPan: {
      enabled: boolean;
      padding: number;
      callback: AutoPanCallback;
    };
  }) {
    // Private properties
    this._viewportId = magnifyViewportId ?? csUtils.uuidv4();
    this._sourceEnabledElement = sourceEnabledElement;
    this._autoPan = autoPan;

    // Public properties
    this.radius = radius;
    this.position = position;
    this.zoomFactor = zoomFactor;
    this.visible = true;

    this._browserMouseDownCallback = this._browserMouseDownCallback.bind(this);
    this._browserMouseUpCallback = this._browserMouseUpCallback.bind(this);
    this._handleToolModeChanged = this._handleToolModeChanged.bind(this);
    this._mouseDragCallback = this._mouseDragCallback.bind(this);
    this._resizeViewportAsync = <() => void>(
      debounce(this._resizeViewport.bind(this), 1)
    );

    this._initialize();
  }

  public get sourceEnabledElement() {
    return this._sourceEnabledElement;
  }

  public get viewportId() {
    return this._viewportId;
  }

  public get radius() {
    return this._radius;
  }

  public set radius(radius: number) {
    // Just moving the magnifying glass around may change its radius
    // by very small amount due to floating number precision
    if (Math.abs(this._radius - radius) > 0.00001) {
      this._radius = radius;
      this._resized = true;
    }
  }

  public update() {
    const { radius, position, visible } = this;
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const size = 2 * radius;
    const [x, y] = position;

    if (this._resized) {
      this._resizeViewportAsync();
      this._resized = false;
    }

    Object.assign(element.style, {
      display: visible ? 'block' : 'hidden',
      width: `${size}px`,
      height: `${size}px`,
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(${x}px, ${y}px)`,
    });

    if (this._isViewportReady) {
      this._syncViewports();
      viewport.render();
    }
  }

  public dispose() {
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const renderingEngine = viewport.getRenderingEngine();

    this._removeEventListeners(element);
    renderingEngine.disableElement(viewport.id);

    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  private _handleToolModeChanged(evt: ToolModeChangedEventType) {
    const { _magnifyToolGroup: magnifyToolGroup } = this;
    const { toolGroupId, toolName, mode, toolBindingsOptions } = evt.detail;

    if (this._sourceToolGroup?.id !== toolGroupId) {
      return;
    }

    switch (mode) {
      case ToolModes.Active:
        magnifyToolGroup.setToolActive(toolName, toolBindingsOptions);
        break;
      case ToolModes.Passive:
        magnifyToolGroup.setToolPassive(toolName);
        break;
      case ToolModes.Enabled:
        magnifyToolGroup.setToolEnabled(toolName);
        break;
      case ToolModes.Disabled:
        magnifyToolGroup.setToolDisabled(toolName);
        break;
      default:
        throw new Error(`Unknow tool mode (${mode})`);
    }
  }

  // Children elements need to inherit border-radius otherwise the canvas will
  // trigger events when moving/dragging/clicking on the corners outside of the
  // border (circle) region.
  private _inheritBorderRadius(magnifyElement) {
    const viewport = magnifyElement.querySelector('.viewport-element');
    const canvas = magnifyElement.querySelector('.cornerstone-canvas');

    viewport.style.borderRadius = 'inherit';
    canvas.style.borderRadius = 'inherit';
  }

  private _createViewportNode(): HTMLDivElement {
    const magnifyElement = document.createElement('div');
    const { radius } = this;
    const size = radius * 2;

    magnifyElement.classList.add(MAGNIFY_CLASSNAME);

    // Update the style and move the element out of the screen with "transforms"
    // to make it "invisible" and preserving its size because when "display" is
    // set to "none" both "offsetWidth" and "offsetHeight" returns zero. Another
    // way would be setting "visibility" to "hidden" but "transforms" is used
    // because it is already being updated when update() is called
    Object.assign(magnifyElement.style, {
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      position: 'absolute',
      overflow: 'hidden',
      borderRadius: '50%',
      boxSizing: 'border-box',
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(-1000px, -1000px)`,
    });

    return magnifyElement;
  }

  private _convertZoomFactorToParallelScale(
    viewport,
    magnifyViewport,
    zoomFactor
  ) {
    const { parallelScale } = viewport.getCamera();
    const canvasRatio =
      magnifyViewport.canvas.offsetWidth / viewport.canvas.offsetWidth;

    return parallelScale * (1 / zoomFactor) * canvasRatio;
  }

  private _isStackViewport(
    viewport: Types.IViewport
  ): viewport is Types.IStackViewport {
    return 'setStack' in viewport;
  }

  private _isVolumeViewport(
    viewport: Types.IViewport
  ): viewport is Types.IVolumeViewport {
    return 'addVolumes' in viewport;
  }

  private _cloneToolGroups(
    sourceViewport: Types.IViewport,
    magnifyViewport: Types.IViewport
  ) {
    const sourceActors = sourceViewport.getActors();
    const magnifyToolGroupId = `${magnifyViewport.id}-toolGroup`;
    const sourceToolGroup = getToolGroupForViewport(
      sourceViewport.id,
      sourceViewport.renderingEngineId
    );

    const magnifyToolGroup = sourceToolGroup.clone(
      magnifyToolGroupId,
      (toolName) => {
        const toolInstance = sourceToolGroup.getToolInstance(toolName);
        const isAnnotationTool =
          toolInstance instanceof AnnotationTool &&
          !(toolInstance instanceof AdvancedMagnifyTool);

        return isAnnotationTool;
      }
    );

    magnifyToolGroup.addViewport(
      magnifyViewport.id,
      magnifyViewport.renderingEngineId
    );

    sourceActors.filter(isSegmentation).forEach((actor) => {
      addSegmentationRepresentations(this.viewportId, [
        {
          segmentationId: actor.referencedId,
          type: SegmentationRepresentations.Labelmap,
        },
      ]);
    });

    return { sourceToolGroup, magnifyToolGroup };
  }

  private _cloneStack(
    sourceViewport: Types.IStackViewport,
    magnifyViewport: Types.IStackViewport
  ): void {
    const imageIds = sourceViewport.getImageIds();

    magnifyViewport.setStack(imageIds).then(() => {
      this._isViewportReady = true;
      this.update();
    });
  }

  private _cloneVolumes(
    sourceViewport: Types.IVolumeViewport,
    magnifyViewport: Types.IVolumeViewport
  ): Types.IVolumeViewport {
    const actors = sourceViewport.getActors();
    const volumeInputArray: Types.IVolumeInput[] = actors
      .filter((actor) => !isSegmentation(actor))
      .map((actor) => ({ volumeId: actor.uid }));

    magnifyViewport.setVolumes(volumeInputArray).then(() => {
      this._isViewportReady = true;
      this.update();
    });

    return magnifyViewport;
  }

  private _cloneViewport(sourceViewport, magnifyElement) {
    const { viewportId: magnifyViewportId } = this;
    const renderingEngine =
      sourceViewport.getRenderingEngine() as Types.IRenderingEngine;

    const { options: sourceViewportOptions } = sourceViewport;
    const viewportInput = {
      element: magnifyElement,
      viewportId: magnifyViewportId,
      type: sourceViewport.type,
      defaultOptions: { ...sourceViewportOptions },
    };

    renderingEngine.enableElement(viewportInput);

    const magnifyViewport = <Types.IViewport>(
      renderingEngine.getViewport(magnifyViewportId)
    );

    if (this._isStackViewport(sourceViewport)) {
      this._cloneStack(sourceViewport, magnifyViewport as Types.IStackViewport);
    } else if (this._isVolumeViewport(sourceViewport)) {
      this._cloneVolumes(
        sourceViewport,
        magnifyViewport as Types.IVolumeViewport
      );
    }

    // Prevent handling events outside of the magnifying glass because it has rounded border
    this._inheritBorderRadius(magnifyElement);

    const toolGroups = this._cloneToolGroups(sourceViewport, magnifyViewport);

    this._sourceToolGroup = toolGroups.sourceToolGroup;
    this._magnifyToolGroup = toolGroups.magnifyToolGroup;
  }

  private _cancelMouseEventCallback(evt): void {
    evt.stopPropagation();
    evt.preventDefault();
  }

  private _browserMouseUpCallback(evt) {
    const { element } = this._enabledElement.viewport;

    document.removeEventListener('mouseup', this._browserMouseUpCallback);

    // Restrict the scope of magnifying glass events again
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);
  }

  private _browserMouseDownCallback(evt) {
    const { element } = this._enabledElement.viewport;

    // Enable auto pan only when user clicks inside of the magnifying glass
    // viewport otherwise it can move when interacting with annotations outside
    // of the magnifying glass or when trying to move/resize it.
    this._canAutoPan = !!evt.target?.closest('.advancedMagnifyTool');

    // Wait for the mouseup event to restrict the scope of magnifying glass events again
    document.addEventListener('mouseup', this._browserMouseUpCallback);

    // Allow mouseup and mousemove events to make it possible to manipulate the
    // tool when passing the mouse over the magnifying glass (dragging a handle).
    // Just relying on state.isInteractingWithTool does not work because there
    // is a 400ms delay to handle double click (see mouseDownListener) which
    // makes the magnifying glass unresponsive for that amount of time.
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);
  }

  private _mouseDragCallback(evt: EventTypes.InteractionEventType) {
    if (!state.isInteractingWithTool) {
      return;
    }

    const { _autoPan: autoPan } = this;

    if (!autoPan.enabled || !this._canAutoPan) {
      return;
    }

    const { currentPoints } = evt.detail;
    const { viewport } = this._enabledElement;
    const { canvasToWorld } = viewport;
    const { canvas: canvasCurrent } = currentPoints;
    const { radius: magnifyRadius } = this;
    const canvasCenter: Types.Point2 = [magnifyRadius, magnifyRadius];
    const dist = distanceToPoint(canvasCenter, canvasCurrent);
    const maxDist = magnifyRadius - autoPan.padding;

    // No need to pan if it is not close to the border
    if (dist <= maxDist) {
      return;
    }

    const panDist = dist - maxDist;
    const canvasDeltaPos = vec2.sub(
      vec2.create(),
      canvasCurrent,
      canvasCenter
    ) as Types.Point2;

    vec2.normalize(canvasDeltaPos, canvasDeltaPos);
    vec2.scale(canvasDeltaPos, canvasDeltaPos, panDist);

    const newCanvasPosition = vec2.add(
      vec2.create(),
      this.position,
      canvasDeltaPos
    ) as Types.Point2;
    const currentWorldPos = canvasToWorld(this.position);
    const newWorldPos = canvasToWorld(newCanvasPosition);
    const worldDeltaPos = vec3.sub(
      vec3.create(),
      newWorldPos,
      currentWorldPos
    ) as Types.Point3;

    const autoPanCallbackData: AutoPanCallbackData = {
      points: {
        currentPosition: {
          canvas: this.position,
          world: currentWorldPos,
        },
        newPosition: {
          canvas: newCanvasPosition,
          world: newWorldPos,
        },
      },
      delta: {
        canvas: canvasDeltaPos,
        world: worldDeltaPos,
      },
    };

    autoPan.callback(autoPanCallbackData);
  }

  private _addBrowserEventListeners(element) {
    // mousedown on document is handled in the capture phase because the other
    // mousedown event listener added to the magnifying glass element does not
    // allow the event to buble up and reach the document.
    document.addEventListener(
      'mousedown',
      this._browserMouseDownCallback,
      true
    );

    // All mouse events should not buble up avoiding the source viewport from
    // handling those events resulting in unexpected behaviors.
    element.addEventListener('mousedown', this._cancelMouseEventCallback);
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);
    element.addEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _removeBrowserEventListeners(element) {
    document.removeEventListener(
      'mousedown',
      this._browserMouseDownCallback,
      true
    );
    document.removeEventListener('mouseup', this._browserMouseUpCallback);

    element.removeEventListener('mousedown', this._cancelMouseEventCallback);
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);
    element.removeEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _addEventListeners(element) {
    eventTarget.addEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    element.addEventListener(
      cstEvents.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );

    element.addEventListener(
      cstEvents.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );

    this._addBrowserEventListeners(element);
  }

  private _removeEventListeners(element) {
    eventTarget.removeEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    element.addEventListener(
      cstEvents.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );

    element.addEventListener(
      cstEvents.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );

    this._removeBrowserEventListeners(element);
  }

  private _initialize() {
    const { _sourceEnabledElement: sourceEnabledElement } = this;
    const { viewport: sourceViewport } = sourceEnabledElement;
    const { canvas: sourceCanvas } = sourceViewport;
    const magnifyElement = this._createViewportNode();

    sourceCanvas.parentNode.appendChild(magnifyElement);

    this._addEventListeners(magnifyElement);
    this._cloneViewport(sourceViewport, magnifyElement);
    this._enabledElement = getEnabledElement(magnifyElement);
  }

  private _syncViewportsCameras(sourceViewport, magnifyViewport) {
    const worldPos = sourceViewport.canvasToWorld(this.position);

    // Use the original viewport for the base for parallelScale
    const parallelScale = this._convertZoomFactorToParallelScale(
      sourceViewport,
      magnifyViewport,
      this.zoomFactor
    );

    const { focalPoint, position, viewPlaneNormal } =
      magnifyViewport.getCamera();

    const distance = Math.sqrt(
      Math.pow(focalPoint[0] - position[0], 2) +
        Math.pow(focalPoint[1] - position[1], 2) +
        Math.pow(focalPoint[2] - position[2], 2)
    );

    const updatedFocalPoint = <Types.Point3>[
      worldPos[0],
      worldPos[1],
      worldPos[2],
    ];

    const updatedPosition = <Types.Point3>[
      updatedFocalPoint[0] + distance * viewPlaneNormal[0],
      updatedFocalPoint[1] + distance * viewPlaneNormal[1],
      updatedFocalPoint[2] + distance * viewPlaneNormal[2],
    ];

    magnifyViewport.setCamera({
      parallelScale,
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
  }

  private _syncStackViewports(
    sourceViewport: Types.IStackViewport,
    magnifyViewport: Types.IStackViewport
  ) {
    magnifyViewport.setImageIdIndex(sourceViewport.getCurrentImageIdIndex());
  }

  private _syncViewports() {
    const { viewport: sourceViewport } = this._sourceEnabledElement;
    const { viewport: magnifyViewport } = this._enabledElement;
    const sourceProperties = sourceViewport.getProperties();
    const imageData = magnifyViewport.getImageData();

    if (!imageData) {
      return;
    }

    magnifyViewport.setProperties(sourceProperties);
    this._syncViewportsCameras(sourceViewport, magnifyViewport);

    if (this._isStackViewport(sourceViewport)) {
      this._syncStackViewports(
        sourceViewport as Types.IStackViewport,
        magnifyViewport as Types.IStackViewport
      );
    }

    this._syncViewportsCameras(sourceViewport, magnifyViewport);
    magnifyViewport.render();
  }

  private _resizeViewport() {
    const { viewport } = this._enabledElement;
    const renderingEngine = viewport.getRenderingEngine();

    renderingEngine.resize();
  }
}

AdvancedMagnifyTool.toolName = 'AdvancedMagnify';

export { AdvancedMagnifyTool as default };
