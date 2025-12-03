import { BaseTool } from './base';
import { getEnabledElement, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import type { EventTypes, PublicToolProps, ToolProps } from '../types';

/**
 * Tool that pans the camera in the plane defined by the viewPlaneNormal and the viewUp.
 */
class PanTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        limitToViewport: false,
        ignoreX: false,
        ignoreY: false,
        ignoreZ: false
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  _checkImageInViewport(viewport, deltaPointsCanvas: Types.Point2) {
    const { canvas } = viewport;
    const ratio = window.devicePixelRatio;

    const viewportLeft = 0;
    const viewportRight = canvas.width / ratio;
    const viewportTop = 0;
    const viewportBottom = canvas.height / ratio;

    const defaultActor = viewport.getDefaultActor();
    const renderer = viewport.getRenderer();

    let bounds;
    if (defaultActor && csUtils.isImageActor(defaultActor)) {
      // Use the default actor's bounds
      const imageData = defaultActor.actor.getMapper().getInputData();
      bounds = imageData.getBounds();
    } else {
      // Fallback to all actors if no default image actor is found
      bounds = renderer.computeVisiblePropBounds();
    }

    const [imageLeft, imageTop] = viewport.worldToCanvas([
      bounds[0],
      bounds[2],
      bounds[4],
    ]);
    const [imageRight, imageBottom] = viewport.worldToCanvas([
      bounds[1],
      bounds[3],
      bounds[5],
    ]);

    const zoom = viewport.getZoom();

    // Check image bounds against viewport bounds
    if (zoom <= 1) {
      if (
        (imageLeft + deltaPointsCanvas[0] < viewportLeft &&
          deltaPointsCanvas[0] < 0) ||
        (imageRight + deltaPointsCanvas[0] > viewportRight &&
          deltaPointsCanvas[0] > 0) ||
        (imageTop + deltaPointsCanvas[1] < viewportTop &&
          deltaPointsCanvas[1] < 0) ||
        (imageBottom + deltaPointsCanvas[1] > viewportBottom &&
          deltaPointsCanvas[1] > 0)
      ) {
        return false;
      }
    } else {
      if (
        (imageLeft + deltaPointsCanvas[0] > viewportLeft &&
          deltaPointsCanvas[0] > 0) ||
        (imageRight + deltaPointsCanvas[0] < viewportRight &&
          deltaPointsCanvas[0] < 0) ||
        (imageTop + deltaPointsCanvas[1] > viewportTop &&
          deltaPointsCanvas[1] > 0) ||
        (imageBottom + deltaPointsCanvas[1] < viewportBottom &&
          deltaPointsCanvas[1] < 0)
      ) {
        return false;
      }
    }

    return true;
  }

  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    const deltaPointsWorld = deltaPoints.world;
    const deltaPointsCanvas = deltaPoints.canvas;



    // This occurs when the mouse event is fired but the mouse hasn't moved a full pixel yet (high resolution mice)
    if (
      deltaPointsWorld[0] === 0 &&
      deltaPointsWorld[1] === 0 &&
      deltaPointsWorld[2] === 0
    ) {
      return;
    }

    if(this.configuration.ignoreX){
      deltaPointsWorld[0] =  0
    }
        if(this.configuration.ignoreY){
      deltaPointsWorld[1] =  0
    }
        if(this.configuration.ignoreZ){
      deltaPointsWorld[2] =  0
    }
    const viewport = enabledElement.viewport;
    const camera = viewport.getCamera();
    const { focalPoint, position } = camera;

    if (
      this.configuration.limitToViewport &&
      !this._checkImageInViewport(viewport, deltaPointsCanvas)
    ) {
      return;
    }

    const updatedPosition = <Types.Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ];

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ];

    viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    viewport.render();
  }
}

PanTool.toolName = 'Pan';
export default PanTool;
