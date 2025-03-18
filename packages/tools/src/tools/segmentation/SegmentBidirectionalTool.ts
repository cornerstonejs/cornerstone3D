import {
  getEnabledElement,
  utilities as csUtils,
  getEnabledElementByViewportId,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAllAnnotations,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  drawLine as drawLineSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import { hideElementCursor } from '../../cursors/elementCursor';
import type {
  EventTypes,
  PublicToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../types';
import type {
  BidirectionalAnnotation,
  SegmentBidirectionalAnnotation,
} from '../../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import BidirectionalTool from '../annotation/BidirectionalTool';
import { getSegmentIndexColor } from '../../stateManagement/segmentation/config/segmentationColor';

// @ts-expect-error
class SegmentBidirectionalTool extends BidirectionalTool {
  static toolName = 'SegmentBidirectional';

  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  preventHandleOutsideImage: boolean;

  constructor(toolProps: PublicToolProps = {}) {
    super(toolProps);
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Bidirectional Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation(
    evt: EventTypes.InteractionEventType
  ): BidirectionalAnnotation {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation: BidirectionalAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
        ...viewport.getViewReference({ points: [worldPos] }),
      },
      data: {
        handles: {
          points: [
            // long
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            // short
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
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
          activeHandleIndex: null,
        },
        label: '',
        cachedStats: {},
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

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation;
  }

  static hydrate = (
    viewportId: string,
    axis: [[Types.Point3, Types.Point3], [Types.Point3, Types.Point3]],
    options?: {
      segmentIndex?: number;
      segmentationId?: string;
      annotationUID?: string;
      toolInstance?: SegmentBidirectionalTool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): SegmentBidirectionalAnnotation => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      return;
    }
    const { viewport } = enabledElement;

    // check if there is already an annotation for that segmentIndex in that
    // segmentation, if so remove it first
    const existingAnnotations = getAllAnnotations();
    const toolAnnotations = existingAnnotations.filter(
      (annotation) => annotation.metadata.toolName === 'SegmentBidirectional'
    ) as SegmentBidirectionalAnnotation[];

    const existingAnnotation = toolAnnotations.find((annotation) => {
      const { metadata } = annotation;

      if (
        metadata.segmentIndex === options?.segmentIndex &&
        metadata.segmentationId === options?.segmentationId
      ) {
        return true;
      }

      return false;
    });

    if (existingAnnotation) {
      removeAnnotation(existingAnnotation.annotationUID);
    }

    const {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal,
      instance,
    } = this.hydrateBase<SegmentBidirectionalTool>(
      SegmentBidirectionalTool,
      enabledElement,
      axis[0],
      options
    );

    const [majorAxis, minorAxis] = axis;
    const [major0, major1] = majorAxis;
    const [minor0, minor1] = minorAxis;
    const points = [major0, major1, minor0, minor1];

    const annotation = {
      annotationUID: options?.annotationUID || utilities.uuidv4(),
      data: {
        handles: {
          points,
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
        cachedStats: {},
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        segmentIndex: options?.segmentIndex,
        segmentationId: options?.segmentationId,
        toolName: instance.getToolName(),
        viewPlaneNormal,
        FrameOfReferenceUID,
        referencedImageId,
        ...options,
      },
    };
    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);

    return annotation as SegmentBidirectionalAnnotation;
  };

  /**
   * it is used to draw the bidirectional annotation in each
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
    let renderStatus = true;
    const { viewport } = enabledElement;
    const { element } = viewport;
    const viewportId = viewport.id;
    let annotations = getAnnotations(this.getToolName(), element);

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

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as SegmentBidirectionalAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const { segmentIndex, segmentationId } = annotation.metadata;

      const { lineWidth, lineDash, shadow } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });
      const colorArray = getSegmentIndexColor(
        viewportId,
        segmentationId,
        segmentIndex
      );

      const color = `rgb(${colorArray.slice(0, 3).join(',')})`;

      // If cachedStats does not exist, or the unit is missing (as part of import/hydration etc.),
      // force to recalculate the stats from the points
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].unit == null
      ) {
        data.cachedStats[targetId] = {
          length: null,
          width: null,
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

      const dataId1 = `${annotationUID}-line-1`;
      const dataId2 = `${annotationUID}-line-2`;

      const lineUID = '0';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          lineWidth,
          lineDash,
          shadow,
        },
        dataId1
      );

      const secondLineUID = '1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        secondLineUID,
        canvasCoordinates[2],
        canvasCoordinates[3],
        {
          color,
          lineWidth,
          lineDash,
          shadow,
        },
        dataId2
      );

      renderStatus = true;

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        data.handles.textBox = {
          hasMoved: false,
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

      options.color = color;

      const textLines = this.configuration.getTextLines(data, targetId);
      if (!textLines || textLines.length === 0) {
        continue;
      }

      let canvasTextBoxCoords;

      if (!data.handles.textBox.hasMoved) {
        canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = '1';
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        options
      );

      const { x: left, y: top, width, height } = boundingBox;

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      };
    }

    return renderStatus;
  };
}

export default SegmentBidirectionalTool;
