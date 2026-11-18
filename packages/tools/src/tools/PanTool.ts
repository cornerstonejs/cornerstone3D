import { BaseTool } from './base';
import { getEnabledElement } from '@cornerstonejs/core';

import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import { panViewportByCanvasDelta } from '../utilities/viewportPresentation';

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
        //put ignore in false
        ignoreX: false,
        ignoreY: false,
        ignoreZ: false,
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
    // Block X-axis movement if ignoreX is enabled
    if (this.configuration.ignoreX) {
      deltaPointsWorld[0] = 0;
    }
    // Block Y-axis movement if ignoreY is enabled
    if (this.configuration.ignoreY) {
      deltaPointsWorld[1] = 0;
    }

    // Block Z-axis movement if ignoreZ is enabled
    if (this.configuration.ignoreZ) {
      deltaPointsWorld[2] = 0;
    }
    const viewport = enabledElement.viewport;

    if (panViewportByCanvasDelta(viewport, deltaPointsCanvas)) {
      viewport.render();
    }
  }
}

PanTool.toolName = 'Pan';
export default PanTool;
