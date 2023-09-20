import { vec3 } from 'gl-matrix';
import {
  metaData,
  getRenderingEngines,
  CONSTANTS,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { addAnnotation } from '../stateManagement/annotation/annotationState';

import { drawLine as drawLineSvg } from '../drawingSvg';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import { StyleSpecifier } from '../types/AnnotationStyle';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { Annotation } from '../types';
import { render } from 'react-dom';

const { EPSILON } = CONSTANTS;

/**
 * Get the largest axis of a normal vector. We assume that indicates the image
 * orientation ( AXIAL = 2, CORONAL = 1, SAGITTAL = 0)
 * @param normalVector
 * @returns
 */
function getNormalLargestAxis(normalVector) {
  let largestAxis = 0;
  for (let i = 1; i < normalVector.length; i++) {
    if (Math.abs(normalVector[i]) > Math.abs(normalVector[largestAxis])) {
      largestAxis = i;
    }
  }
  return largestAxis;
}

/**
 * Get the largest normal axis of the a viewport first imageId
 * @param viewport
 * @returns
 */
function getViewportImageIdNormalAxis(viewport) {
  const imageIds = viewport.getImageIds();
  const { rowCosines, columnCosines } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );
  const scanAxisNormal = vec3.cross(vec3.create(), rowCosines, columnCosines);
  return getNormalLargestAxis(scanAxisNormal);
}

export interface OverlayGridAnnotation extends Annotation {
  data: {
    sourceViewport;
  };
}

/**
 * @public
 */
class OverlayGridTool extends AnnotationDisplayTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    renderingEngine: any;
    annotations: any;
  } | null = {} as any;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourceViewportIds: [],
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _init = (): void => {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    // Todo: handle this case where it is too soon to get the rendering engine
    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());

    // const sourceViewport = renderingEngine.getViewport(
    //   this.configuration.sourceViewportId
    // ) as Types.IVolumeViewport;

    this.configuration.sourceViewportIds.forEach((viewportId) => {
      const sourceViewport = renderingEngine.getViewport(viewportId);
      if (sourceViewport || sourceViewport.getImageData()) {
        const { element } = sourceViewport;
        const { viewUp, viewPlaneNormal } = sourceViewport.getCamera();

        const FrameOfReferenceUID = sourceViewport.getFrameOfReferenceUID();
        if (!this.editData?.annotations) {
          this.editData.annotations = {};
        }

        let annotation = this.editData.annotations[viewportId];

        if (!annotation) {
          const newAnnotation: OverlayGridAnnotation = {
            highlighted: true,
            invalidated: true,
            metadata: {
              toolName: this.getToolName(),
              viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
              viewUp: <Types.Point3>[...viewUp],
              FrameOfReferenceUID,
              referencedImageId: null,
            },
            data: {
              sourceViewport,
            },
          };

          addAnnotation(newAnnotation, element);
          annotation = newAnnotation;
        }

        this.editData.annotations[viewportId] = annotation;
        this.editData.renderingEngine = renderingEngine;
      }
    });

    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      viewports.map((viewport) => viewport.id)
    );
  };

  onSetToolEnabled = (): void => {
    this._init();
  };

  onSetToolActive = (): void => {
    this._init();
  };

  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    // If the camera is modified, we need to update the reference lines
    // we really don't care which viewport triggered the
    // camera modification, since we want to update all of them
    // with respect to the targetViewport
    this._init();
  };

  /**
   * Calculates the point sets based on the image corners relative to an imageId
   * @param imageId
   * @returns
   */
  calculateImageIdPointSets = (imageId: string) => {
    const {
      imagePositionPatient,
      rows,
      columns,
      rowCosines,
      columnCosines,
      rowPixelSpacing,
      columnPixelSpacing,
    } = metaData.get('imagePlaneModule', imageId);

    // top left world, top right world, bottom right world, bottom left world
    const topLeft = [...imagePositionPatient];
    const topRight = [...imagePositionPatient];
    const bottomLeft = [...imagePositionPatient];
    const bottomRight = [...imagePositionPatient];

    vec3.scaleAndAdd(
      topRight,
      imagePositionPatient,
      columnCosines,
      columns * columnPixelSpacing
    );
    vec3.scaleAndAdd(
      bottomLeft,
      imagePositionPatient,
      rowCosines,
      rows * rowPixelSpacing
    );

    vec3.scaleAndAdd(
      bottomRight,
      bottomLeft,
      columnCosines,
      columns * columnPixelSpacing
    );

    // check if the topLeft and bottomLeft line is parallel to the viewUp
    const pointSet1 = [topLeft, bottomLeft, topRight, bottomRight];
    const pointSet2 = [topLeft, topRight, bottomLeft, bottomRight];

    return { pointSet1, pointSet2 };
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
    const { viewport: targetViewport } = enabledElement;

    const targetImageIds = targetViewport.getImageIds();
    if (targetImageIds.length < 2) {
      return renderStatus;
    }

    const { annotations } = this.editData;
    if (!annotations) {
      return renderStatus;
    }

    [...Object.values(annotations)].forEach((annotation) => {
      const sourceViewport = annotation.data.sourceViewport;
      if (!sourceViewport) {
        return renderStatus;
      }

      if (sourceViewport.id === targetViewport.id) {
        // If the source viewport is the same as the current viewport, we don't need to render
        return renderStatus;
      }

      if (
        sourceViewport.getFrameOfReferenceUID() !==
        targetViewport.getFrameOfReferenceUID()
      ) {
        return renderStatus;
      }

      if (!annotation) {
        return renderStatus;
      }

      const styleSpecifier: StyleSpecifier = {
        toolGroupId: this.toolGroupId,
        toolName: this.getToolName(),
        viewportId: enabledElement.viewport.id,
      };

      const { focalPoint, viewPlaneNormal } = targetViewport.getCamera();
      const { viewPlaneNormal: sourceViewPlaneNormal } =
        sourceViewport.getCamera();

      if (this.isParallel(viewPlaneNormal, sourceViewPlaneNormal)) {
        // If the source and target viewports are parallel, we don't need to render
        return renderStatus;
      }

      const targetViewportPlane = csUtils.planar.planeEquation(
        viewPlaneNormal,
        focalPoint
      );

      const imageIds = sourceViewport.getImageIds();
      for (let i = 0; i < imageIds.length; i++) {
        const { pointSet1, pointSet2 } = this.calculateImageIdPointSets(
          imageIds[i]
        );

        let pointSetToUse = pointSet1;

        let topBottomVec = vec3.subtract(
          vec3.create(),
          pointSet1[0],
          pointSet1[1]
        );
        topBottomVec = vec3.normalize(
          vec3.create(),
          topBottomVec
        ) as Types.Point3;

        let topRightVec = vec3.subtract(
          vec3.create(),
          pointSet1[2],
          pointSet1[0]
        );
        topRightVec = vec3.normalize(vec3.create(), topRightVec);

        const newNormal = vec3.cross(
          vec3.create(),
          topBottomVec,
          topRightVec
        ) as Types.Point3;

        if (this.isParallel(newNormal, viewPlaneNormal)) {
          return renderStatus;
        }

        // check if it is perpendicular to the viewPlaneNormal which means
        // the line does not intersect the viewPlaneNormal
        if (this.isPerpendicular(topBottomVec, viewPlaneNormal)) {
          // 'use pointSet2';
          pointSetToUse = pointSet2;
        }

        const lineStartWorld = csUtils.planar.linePlaneIntersection(
          pointSetToUse[0],
          pointSetToUse[1],
          targetViewportPlane
        );

        const lineEndWorld = csUtils.planar.linePlaneIntersection(
          pointSetToUse[2],
          pointSetToUse[3],
          targetViewportPlane
        );
        const { annotationUID } = annotation;

        styleSpecifier.annotationUID = annotationUID;
        const lineWidth = this.getStyle(
          'lineWidth',
          styleSpecifier,
          annotation
        );
        const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
        const color = this.getStyle('color', styleSpecifier, annotation);
        const shadow = this.getStyle('shadow', styleSpecifier, annotation);

        const canvasCoordinates = [lineStartWorld, lineEndWorld].map((world) =>
          targetViewport.worldToCanvas(world)
        );

        const dataId = `${annotationUID}-line`;
        const lineUID = `${i}`;
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
      }
    });

    renderStatus = true;

    return renderStatus;
  };

  isPerpendicular = (vec1: Types.Point3, vec2: Types.Point3): boolean => {
    const dot = vec3.dot(vec1, vec2);
    return Math.abs(dot) < EPSILON;
  };

  isParallel(vec1: Types.Point3, vec2: Types.Point3): boolean {
    return Math.abs(vec3.dot(vec1, vec2)) > 1 - EPSILON;
  }
}

OverlayGridTool.toolName = 'OverlayGrid';
export default OverlayGridTool;
