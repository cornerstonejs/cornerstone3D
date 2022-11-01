import { AnnotationTool } from './base';
import {
  getEnabledElement,
  metaData,
  StackViewport,
  VolumeViewport,
  utilities,
  Enums,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import { drawCircle as drawCircleSvg, drawLine } from '../drawingSvg';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
  Annotations,
} from '../types';
import { CursorCrosshairSync } from '../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../types/AnnotationStyle';
import { vec3 } from 'gl-matrix';

/**
 * CursorCrosshairSyncTool is a tool that will show your cursors position in all other elements in the toolGroup if they have a matching FrameOfReference relative to its position in world space.
 * Also when positionSync is enabled, it will try to sync viewports so that the cursor can be displayed in the correct position in all viewports.
 */
class CursorCrosshairSyncTool extends AnnotationTool {
  static toolName;
  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  isDrawing = false;
  isHandleOutsideImage = false;
  _mouseOverElement: null | HTMLDivElement = null;
  _currentMouseWorldPosition: null | Types.Point3 = null;
  _currentCanvasPosition: null | Types.Point2 = null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        displayThreshold: 5,
        positionSync: true,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Overwritten mouseMoveCallback since we want to keep track of the current mouse position and redraw on mouseMove
   * @virtual Event handler for Cornerstone MOUSE_MOVE event.
   *
   *
   * @param evt - The normalized mouse event
   * @param filteredAnnotations - The annotations to check for hover interactions
   * @returns True if the annotation needs to be re-drawn by the annotationRenderingEngine.
   */
  mouseMoveCallback = (evt: EventTypes.MouseMoveEventType): boolean => {
    const { detail } = evt;
    const { element, currentPoints } = detail;
    this.setMouseOverElement(element);
    this._currentMouseWorldPosition = currentPoints.world;
    //also need canvas postion for recalculating world position on stack change
    this._currentCanvasPosition = currentPoints.canvas;

    const annotation = this.getActiveAnnotation(element);
    if (annotation === null) {
      this.addNewAnnotation(evt);
      return false;
    }
    this.updateAnnotationPosition(element, annotation);
    return false;
  };

  //image change event seems to fire before image is rendered, so in order to get correct world position we need to wait for next render event
  handleImageChange = (
    evt:
      | Types.EventTypes.StackViewportScrollEvent
      | Types.EventTypes.VolumeNewImageEvent
  ): void => {
    const element = evt.target as HTMLDivElement;
    element.addEventListener(
      Enums.Events.IMAGE_RENDERED,
      () => {
        if (!this) return;
        const viewport = getEnabledElement(element)?.viewport;
        if (!viewport) return;
        const renderingEngine = viewport.getRenderingEngine();
        if (!renderingEngine) return;

        //calculate new world position from chached canvas position
        const activeAnnotation = this.getActiveAnnotation(element);

        if (!this._currentCanvasPosition || !activeAnnotation) return;
        const worldPos = viewport.canvasToWorld(this._currentCanvasPosition);
        this._currentMouseWorldPosition = worldPos;

        this.updateAnnotationPosition(element, activeAnnotation);
      },
      {
        once: true,
      }
    );
  };

  //when the mouse is moved over a div, attach an event listener to this div to update the world position of the annotation when stack is scrolled
  setMouseOverElement(element: HTMLDivElement | null): void {
    if (element === this._mouseOverElement) return;
    const previousElement = this._mouseOverElement;
    this._mouseOverElement = element;
    if (previousElement) {
      previousElement.removeEventListener(
        Enums.Events.VOLUME_NEW_IMAGE,
        this.handleImageChange as EventListener
      );
      previousElement.removeEventListener(
        Enums.Events.STACK_VIEWPORT_SCROLL,
        this.handleImageChange as EventListener
      );
    }
    if (element) {
      this._mouseOverElement = element;
      element.addEventListener(
        Enums.Events.VOLUME_NEW_IMAGE,
        this.handleImageChange as EventListener
      );
      element.addEventListener(
        Enums.Events.STACK_VIEWPORT_SCROLL,
        this.handleImageChange as EventListener
      );
    }
  }

  getActiveAnnotation(element: HTMLDivElement): null | Annotation {
    const annotations = getAnnotations(element, this.getToolName());
    if (annotations === undefined || annotations.length === 0) {
      return null;
    }
    const targetAnnotation = annotations[0];
    if (annotations.length > 1) {
      const wrongAnnotations = annotations.slice(1);
      wrongAnnotations.forEach((annotation) => {
        if (annotation.annotationUID)
          removeAnnotation(annotation.annotationUID, element);
      });
    }
    return targetAnnotation;
  }

  //updates the position of the annotation to match the currently set world position
  updateAnnotationPosition(
    element: HTMLDivElement,
    annotation: Annotation
  ): void {
    const worldPos = this._currentMouseWorldPosition;
    if (!worldPos) return;
    if (!annotation.data?.handles?.points) return;
    annotation.data.handles.points = [[...worldPos]];
    annotation.invalidated = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false
    );
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) return;
    const { renderingEngine } = enabledElement;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }

  /**
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseMoveEventType
  ): CursorCrosshairSync => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    if (!enabledElement) throw new Error('No enabled element found');
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;
    if (!viewPlaneNormal || !viewUp) throw new Error('Camera not found');

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
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        label: '',
        handles: {
          points: [[...worldPos]] as [Types.Point3],
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
      },
    };

    addAnnotation(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false
    );

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  isPointNearTool = (): boolean => {
    //not reevant for tool
    return false;
  };

  handleSelectedCallback = (): void => {
    return;
  };

  toolSelectedCallback = (): void => {
    return;
  };

  cancel = (): void => {
    return;
  };

  //display annotation if current viewing plane has a max distance of "displayThreshold" from the annotation
  filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations {
    //calculate distance of current viewport to annotation
    if (!(annotations instanceof Array) || annotations.length === 0) return [];
    const annotation = annotations[0];
    const viewport = getEnabledElement(element)?.viewport;
    if (!viewport) return [];
    const camera = viewport.getCamera();
    const { viewPlaneNormal, focalPoint } = camera;
    if (!viewPlaneNormal || !focalPoint) return [];
    const points = annotation.data?.handles?.points;
    if (!(points instanceof Array) || points.length !== 1) return [];
    const worldPos = points[0];
    const plane = utilities.planar.planeEquation(viewPlaneNormal, focalPoint);
    const distance = planeDistanceToPoint(plane, worldPos);
    return distance < this.configuration.displayThreshold ? [annotation] : [];
  }

  /**
   * Simply draws a circle at the current mouse position if element is is not the one being hovered over
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

    if (
      this.configuration.positionSync &&
      this._mouseOverElement !== viewport.element
    ) {
      this.updateStackPosition(viewport);
    }

    const { element } = viewport;
    if (element === this._mouseOverElement) {
      return false;
    }
    let annotations = getAnnotations(element, this.getToolName());

    if (!annotations?.length) {
      return renderStatus;
    }

    //the viewport change from updateStackPosition might not be applied yet, so sometimes the annotation might not be immediately visible
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    ) as Annotations;

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as CursorCrosshairSync;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points } = handles;

      if (!annotationUID) return renderStatus;
      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      if (points[0].some((e) => isNaN(e))) return renderStatus;
      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2];

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      const crosshairUIDs = {
        upper: 'upper',
        right: 'right',
        lower: 'lower',
        left: 'left',
      };
      const [x, y] = canvasCoordinates[0];
      const centerSpace = 7;
      const lineLength = 7;
      drawLine(
        svgDrawingHelper,
        annotationUID,
        crosshairUIDs.upper,
        [x, y - (centerSpace / 2 + lineLength)],
        [x, y - centerSpace / 2],
        { color, lineDash, lineWidth }
      );
      drawLine(
        svgDrawingHelper,
        annotationUID,
        crosshairUIDs.lower,
        [x, y + (centerSpace / 2 + lineLength)],
        [x, y + centerSpace / 2],
        { color, lineDash, lineWidth }
      );
      drawLine(
        svgDrawingHelper,
        annotationUID,
        crosshairUIDs.right,
        [x + (centerSpace / 2 + lineLength), y],
        [x + centerSpace / 2, y],
        { color, lineDash, lineWidth }
      );
      drawLine(
        svgDrawingHelper,
        annotationUID,
        crosshairUIDs.left,
        [x - (centerSpace / 2 + lineLength), y],
        [x - centerSpace / 2, y],
        { color, lineDash, lineWidth }
      );
      renderStatus = true;
    }

    return renderStatus;
  };

  updateStackPosition(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): void {
    const currentMousePosition = this._currentMouseWorldPosition;

    if (!currentMousePosition || currentMousePosition.some((e) => isNaN(e)))
      return;
    if (viewport instanceof StackViewport) {
      const closestState = calculateMinimalDistanceForStackViewport(
        currentMousePosition,
        viewport
      );

      if (!closestState) return;
      const { index } = closestState;
      if (index !== viewport.getCurrentImageIdIndex())
        viewport.setImageIdIndex(index);
    } else if (viewport instanceof VolumeViewport) {
      const { focalPoint, viewPlaneNormal } = viewport.getCamera();
      if (!focalPoint || !viewPlaneNormal) return;
      const plane = utilities.planar.planeEquation(viewPlaneNormal, focalPoint);
      const currentDistance = planeDistanceToPoint(
        plane,
        currentMousePosition,
        true
      );

      if (Math.abs(currentDistance) < 0.5) return;
      const normalizedViewPlane = vec3.normalize(
        vec3.create(),
        vec3.fromValues(...viewPlaneNormal)
      );
      const scaledPlaneNormal = vec3.scale(
        vec3.create(),
        normalizedViewPlane,
        currentDistance
      );
      const newFocalPoint = vec3.add(
        vec3.create(),
        vec3.fromValues(...focalPoint),
        scaledPlaneNormal
      ) as Types.Point3;
      //TODO: make check if new focal point is within bounds of volume
      const isInBounds = true;
      if (isInBounds) {
        viewport.setCamera({ focalPoint: newFocalPoint });
        const renderingeEngine = viewport.getRenderingEngine();
        if (renderingeEngine) renderingeEngine.renderViewport(viewport.id);
      }
    }
  }
}

CursorCrosshairSyncTool.toolName = 'CursorCrosshairSync';
export default CursorCrosshairSyncTool;

//assumes that imageIds are sorted by slice location
function calculateMinimalDistanceForStackViewport(
  point: Types.Point3,
  viewport: Types.IStackViewport
): { distance: number; index: number } | null {
  const imageIds = viewport.getImageIds();
  const currentImageIdIndex = viewport.getCurrentImageIdIndex();

  if (imageIds.length === 0) return null;

  const getDistance = (imageId: string): null | number => {
    const planeMetadata = getPlaneMetadata(imageId);
    if (!planeMetadata) return null;
    const plane = utilities.planar.planeEquation(
      planeMetadata.planeNormal,
      planeMetadata.imagePositionPatient
    );
    const distance = planeDistanceToPoint(plane, point);
    return distance;
  };

  const closestStack = {
    distance: getDistance(imageIds[currentImageIdIndex]) ?? Infinity,
    index: currentImageIdIndex,
  };

  //check higher indices
  const higherImageIds = imageIds.slice(currentImageIdIndex + 1);

  for (let i = 0; i < higherImageIds.length; i++) {
    const id = higherImageIds[i];
    const distance = getDistance(id);
    if (distance === null) continue;
    if (distance <= closestStack.distance) {
      closestStack.distance = distance;
      closestStack.index = i + currentImageIdIndex + 1;
    } else break;
  }
  //check lower indices
  const lowerImageIds = imageIds.slice(0, currentImageIdIndex);
  for (let i = lowerImageIds.length - 1; i >= 0; i--) {
    const id = lowerImageIds[i];
    const distance = getDistance(id);
    if (distance === null || distance === closestStack.distance) continue;
    if (distance < closestStack.distance) {
      closestStack.distance = distance;
      closestStack.index = i;
    } else break;
  }
  return closestStack.distance === Infinity ? null : closestStack;
}

function getPlaneMetadata(imageId: string): null | {
  rowCosines: Types.Point3;
  columnCosines: Types.Point3;
  imagePositionPatient: Types.Point3;
  planeNormal: Types.Point3;
} {
  const targetImagePlane = metaData.get('imagePlaneModule', imageId);

  if (
    !targetImagePlane ||
    !(
      targetImagePlane.rowCosines instanceof Array &&
      targetImagePlane.rowCosines.length === 3
    ) ||
    !(
      targetImagePlane.columnCosines instanceof Array &&
      targetImagePlane.columnCosines.length === 3
    ) ||
    !(
      targetImagePlane.imagePositionPatient instanceof Array &&
      targetImagePlane.imagePositionPatient.length === 3
    )
  ) {
    return null;
  }
  const {
    rowCosines,
    columnCosines,
    imagePositionPatient,
  }: {
    rowCosines: Types.Point3;
    columnCosines: Types.Point3;
    imagePositionPatient: Types.Point3;
  } = targetImagePlane;

  const rowVec = vec3.set(vec3.create(), ...rowCosines);
  const colVec = vec3.set(vec3.create(), ...columnCosines);
  const planeNormal = vec3.cross(vec3.create(), rowVec, colVec) as Types.Point3;

  return { rowCosines, columnCosines, imagePositionPatient, planeNormal };
}

// assumes plane in A+B+C=D
function planeDistanceToPoint(
  plane: Types.Plane,
  point: Types.Point3,
  signed = false
) {
  const [A, B, C, D] = plane;
  const [x, y, z] = point;
  const distance =
    Math.abs(A * x + B * y + C * z - D) / Math.sqrt(A * A + B * B + C * C);
  const sign = signed ? Math.sign(A * x + B * y + C * z - D) : 1;
  return sign * distance;
}
