import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  utilities,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  addAnnotation,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import { drawLine } from '../drawingSvg';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
  Annotations,
} from '../types';
import { ReferenceCursor } from '../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../types/AnnotationStyle';
import { vec3 } from 'gl-matrix';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import { getToolGroup } from '../store/ToolGroupManager';

/**
 * ReferenceCursors is a tool that will show your cursors position in all other elements in the toolGroup if they have a matching FrameOfReference relative to its position in world space.
 * Also when positionSync is enabled, it will try to sync viewports so that the cursor can be displayed in the correct position in all viewports.
 *
 * Configuration:
 * - positionSync: boolean, if true, it will try to sync viewports so that the cursor can be displayed in the correct position in all viewports.
 * - disableCursor: boolean, if true, it will hide the cursor in all viewports. You need to disable and reactivate the tool for this to apply.
 * - displayThreshold: number, if the distance of the cursor in a viewport is bigger than this threshold the cursor will not be displayed.
 *
 * Only uses Active and Disabled state
 */
class ReferenceCursors extends AnnotationDisplayTool {
  static toolName;
  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  isDrawing = false;
  isHandleOutsideImage = false;
  _elementWithCursor: null | HTMLDivElement = null;
  _currentCursorWorldPosition: null | Types.Point3 = null;
  _currentCanvasPosition: null | Types.Point2 = null;
  //need to keep track if this was enabled when tool was enabled because we need to know if we should reset cursors
  _disableCursorEnabled = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        displayThreshold: 5,
        positionSync: true,
        disableCursor: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this._disableCursorEnabled = this.configuration.disableCursor;
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
  mouseMoveCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const { detail } = evt;
    const { element, currentPoints } = detail;

    //save current positions and current element the curser is hovering over
    this._currentCursorWorldPosition = currentPoints.world;
    this._currentCanvasPosition = currentPoints.canvas;
    this._elementWithCursor = element;

    const annotation = this.getActiveAnnotation(element);
    if (annotation === null) {
      this.createInitialAnnotation(currentPoints.world, element);
      return false;
    }
    this.updateAnnotationPosition(element, annotation);
    return false;
  };

  onSetToolActive(): void {
    this._disableCursorEnabled = this.configuration.disableCursor;
    if (!this._disableCursorEnabled) return;
    const viewportIds = getToolGroup(this.toolGroupId).viewportsInfo;
    if (!viewportIds) return;
    const enabledElements = viewportIds.map((e) =>
      getEnabledElementByIds(e.viewportId, e.renderingEngineId)
    );

    enabledElements.forEach((element) => {
      if (element) hideElementCursor(element.viewport.element);
    });
  }
  onSetToolDisabled(): void {
    if (!this._disableCursorEnabled) return;
    const viewportIds = getToolGroup(this.toolGroupId).viewportsInfo;
    if (!viewportIds) return;
    const enabledElements = viewportIds.map((e) =>
      getEnabledElementByIds(e.viewportId, e.renderingEngineId)
    );
    enabledElements.forEach((element) => {
      if (element) resetElementCursor(element.viewport.element);
    });
  }

  createInitialAnnotation = (
    worldPos: Types.Point3,
    element: HTMLDivElement
  ): void => {
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

    const annotationId = this._addAnnotation(element, annotation);

    if (annotationId === null) return;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      false
    );

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  //custom addAnnotations to make sure there is never more than one cursor Annotation
  _addAnnotation(
    element: HTMLDivElement,
    annotation: Annotation
  ): string | null {
    const annotations = getAnnotations(element, this.getToolName());
    if (annotations instanceof Array && annotations.length > 0) return null;
    return addAnnotation(element, annotation);
  }

  getActiveAnnotation(element: HTMLDivElement): null | Annotation {
    const annotations = getAnnotations(element, this.getToolName());
    if (annotations === undefined || annotations.length === 0) {
      return null;
    }
    const targetAnnotation = annotations[0];
    return targetAnnotation;
  }

  /**
   * updates the position of the annotation to match the currently set world position
   */
  updateAnnotationPosition(
    element: HTMLDivElement,
    annotation: Annotation
  ): void {
    const worldPos = this._currentCursorWorldPosition;
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

  //checks if we need to update the annotation position due to camera changes
  onCameraModified = (evt: any): void => {
    const eventDetail = evt.detail;
    const { element, previousCamera, camera } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport as
      | Types.IVolumeViewport
      | Types.IStackViewport;

    //only react to changes for element with cursor, otherwise would cause infinite loop
    if (element !== this._elementWithCursor) return;
    //check if camera moved along its normal
    const oldFocalPoint = previousCamera.focalPoint;
    const cameraNormal = camera.viewPlaneNormal;
    const newFocalPoint = camera.focalPoint;

    const deltaCameraFocalPoint: Types.Point3 = [0, 0, 0];
    vtkMath.subtract(newFocalPoint, oldFocalPoint, deltaCameraFocalPoint);
    //check if focal point changed
    if (deltaCameraFocalPoint.reduce((a, b) => a + b, 0) === 0) return;
    //if nomrmal is perpendicular to focal point change, then we are not moving along the normal
    const dotProduct = vtkMath.dot(deltaCameraFocalPoint, cameraNormal);
    //dot product is 0 -> perpendicular
    if (Math.abs(dotProduct) < 1e-2) return;

    //need to update the position of the annotation since camera changed
    if (!this._currentCanvasPosition) return;

    const newWorldPos = viewport.canvasToWorld(this._currentCanvasPosition);
    this._currentCursorWorldPosition = newWorldPos;
    this.updateAnnotationPosition(element, this.getActiveAnnotation(element));
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
    const distance = utilities.planar.planeDistanceToPoint(plane, worldPos);
    return distance < this.configuration.displayThreshold ? [annotation] : [];
  }

  /**
   * Draws the cursor representation on the enabledElement
   * Checks if a stack change has happened and updates annotation in that case
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

    const isElementWithCursor = this._elementWithCursor === viewport.element;

    //update stack position if position sync is enabled
    if (this.configuration.positionSync && !isElementWithCursor) {
      this.updateViewportImage(viewport);
    }

    const { element } = viewport;

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
      const annotation = annotations[i] as ReferenceCursor;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points } = handles;

      if (!annotationUID) return renderStatus;
      styleSpecifier.annotationUID = annotationUID;

      const lineWidthBase = parseFloat(
        this.getStyle('lineWidth', styleSpecifier, annotation) as string
      );

      const lineWidth =
        typeof lineWidthBase === 'number' && isElementWithCursor
          ? lineWidthBase
          : lineWidthBase;
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
      const centerSpace = isElementWithCursor ? 20 : 7;
      const lineLength = isElementWithCursor ? 5 : 7;
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

  updateViewportImage(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): void {
    const currentMousePosition = this._currentCursorWorldPosition;

    if (!currentMousePosition || currentMousePosition.some((e) => isNaN(e)))
      return;

    if (viewport instanceof StackViewport) {
      const closestIndex = utilities.getClosestStackImageIndexForPoint(
        currentMousePosition,
        viewport
      );

      if (closestIndex === null) return;
      if (closestIndex !== viewport.getCurrentImageIdIndex())
        viewport.setImageIdIndex(closestIndex);
    } else if (viewport instanceof VolumeViewport) {
      const { focalPoint, viewPlaneNormal } = viewport.getCamera();
      if (!focalPoint || !viewPlaneNormal) return;
      const plane = utilities.planar.planeEquation(viewPlaneNormal, focalPoint);
      const currentDistance = utilities.planar.planeDistanceToPoint(
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
        const renderingEngine = viewport.getRenderingEngine();
        if (renderingEngine) renderingEngine.renderViewport(viewport.id);
      }
    }
  }
}

ReferenceCursors.toolName = 'ReferenceCursors';
export default ReferenceCursors;
