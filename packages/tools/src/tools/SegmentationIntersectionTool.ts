import { getRenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';
import { drawPolyline } from '../drawingSvg';
import { getToolGroup } from '../store/ToolGroupManager';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { Annotation } from '../types';
import { getPolyDataPoints } from './displayTools/utils/polyDataManipulation';
import { pointToString } from './displayTools/utils/pointFunctions';

export interface SegmentationIntersectionAnnotation extends Annotation {
  data: {
    actorsWorldPointsMap: Map<string, Map<string, object>>;
  };
}

class SegmentationIntersectionTool extends AnnotationDisplayTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {}
  ) {
    super(toolProps, defaultToolProps);

    // this._throttledCalculateCachedStats = throttle(
    //   this._calculateCachedStats,
    //   100,
    //   { trailing: true }
    // );
  }

  _init = (): void => {
    const viewportsInfo = getToolGroup(this.toolGroupId).viewportsInfo;

    if (!viewportsInfo?.length) {
      console.warn(this.getToolName() + 'Tool: No viewports found');
      return;
    }

    const viewport = getRenderingEngine(
      viewportsInfo[0].renderingEngineId
    )?.getViewport(viewportsInfo[0].viewportId);

    if (!viewport) {
      return;
    }
    const frameOfReferenceUID = viewport.getFrameOfReferenceUID();
    const annotations = getAnnotations(this.getToolName(), frameOfReferenceUID);
    if (!annotations?.length) {
      const actorsWorldPointsMap = new Map();
      calculateSurfaceSegmentationIntersections(
        actorsWorldPointsMap,
        viewportsInfo
      );
      const newAnnotation: SegmentationIntersectionAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          toolName: this.getToolName(),
          FrameOfReferenceUID: frameOfReferenceUID,
          referencedImageId: null,
        },
        data: {
          actorsWorldPointsMap,
        },
      };

      addAnnotation(newAnnotation, frameOfReferenceUID);
    }

    triggerAnnotationRenderForViewportIds(
      getRenderingEngine(viewportsInfo[0].renderingEngineId),
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
  };

  onSetToolEnabled = (): void => {
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
    const { viewport, FrameOfReferenceUID } = enabledElement;

    let renderStatus = false;

    const annotations = getAnnotations(this.getToolName(), FrameOfReferenceUID);
    if (!annotations?.length) {
      return renderStatus;
    }
    const annotation = annotations[0];
    const { annotationUID } = annotation;
    const actorsWorldPointsMap = annotation.data.actorsWorldPointsMap;

    calculateSurfaceSegmentationIntersectionsForViewport(
      actorsWorldPointsMap,
      viewport
    );
    const actorEntries = viewport.getActors();
    const { focalPoint } = viewport.getCamera();
    const focalPointString = pointToString(focalPoint);
    actorEntries.forEach((actorEntry) => {
      if (!actorEntry?.clippingFilter) {
        return;
      }
      const actorWorldPointMap = actorsWorldPointsMap.get(actorEntry.uid);
      if (!actorWorldPointMap) {
        return;
      }
      if (!actorWorldPointMap.get(focalPointString)) {
        return;
      }
      const { worldPoints, color } = actorWorldPointMap.get(focalPointString);
      const canvasPoints = worldPoints.map((point) =>
        viewport.worldToCanvas(point)
      );

      const options = {
        color,
        fillColor: color,
        fillOpacity: 0.5,
        connectLastToFirst: true,
      };

      const polyLineUID = actorEntry.uid;
      drawPolyline(
        svgDrawingHelper,
        annotationUID,
        polyLineUID,
        canvasPoints,
        options
      );
    });

    renderStatus = true;
    return renderStatus;
  };
}

/**
 * Calculates surface intersections points for all surface actors in a viewport
 * @param actorWorldPointsMap
 * @param viewport
 */
function calculateSurfaceSegmentationIntersectionsForViewport(
  actorsWorldPointsMap,
  viewport
) {
  const actorEntries = viewport.getActors();
  const { focalPoint } = viewport.getCamera();
  const focalPointString = pointToString(focalPoint);
  actorEntries.forEach((actorEntry) => {
    if (actorEntry?.clippingFilter) {
      let actorWorldPointsMap = actorsWorldPointsMap.get(actorEntry.uid);
      if (!actorWorldPointsMap) {
        actorWorldPointsMap = new Map();
        actorsWorldPointsMap.set(actorEntry.uid, actorWorldPointsMap);
      }
      if (!actorWorldPointsMap.get(focalPointString)) {
        const polyData = actorEntry.clippingFilter.getOutputData();
        const worldPoints = getPolyDataPoints(polyData);
        const colorArray = actorEntry.actor.getProperty().getColor();
        const color =
          '#' +
          Math.floor(colorArray[0] * 255).toString(16) +
          Math.floor(colorArray[1] * 255).toString(16) +
          Math.floor(colorArray[2] * 255).toString(16);

        if (worldPoints?.length > 10) {
          actorWorldPointsMap.set(focalPointString, { worldPoints, color });
        }
      }
    }
  });
}

/**
 * Calculates surface intersections points for all surface actors in a list of viewports
 * @param actorWorldPointsMap
 * @param viewportsInfo
 */
function calculateSurfaceSegmentationIntersections(
  actorsWorldPointsMap,
  viewportsInfo
) {
  viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
    const viewport =
      getRenderingEngine(renderingEngineId)?.getViewport(viewportId);
    calculateSurfaceSegmentationIntersectionsForViewport(
      actorsWorldPointsMap,
      viewport
    );
  });
}

SegmentationIntersectionTool.toolName = 'SegmentationIntersection';
export default SegmentationIntersectionTool;
