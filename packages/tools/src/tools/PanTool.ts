import { BaseTool } from './base';
import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  Enums,
} from '@cornerstonejs/core';
const { Events } = Enums;
import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import type { Types } from '@cornerstonejs/core';

/**
 * Tool that pans the camera in the plane defined by the viewPlaneNormal and the viewUp.
 */
class PanTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
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

  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    const deltaPointsWorld = deltaPoints.world;
    // This occurs when the mouse event is fired but the mouse hasn't moved a full pixel yet (high resolution mice)
    if (
      deltaPointsWorld[0] === 0 &&
      deltaPointsWorld[1] === 0 &&
      deltaPointsWorld[2] === 0
    ) {
      return;
    }
    const camera = enabledElement.viewport.getCamera();
    const { focalPoint, position } = camera;

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

    enabledElement.viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    triggerEvent(eventTarget, Events.CAMERA_MODIFIED, {
      viewport: enabledElement.viewport,
    });
    enabledElement.viewport.render();
  }
}

PanTool.toolName = 'Pan';
export default PanTool;
