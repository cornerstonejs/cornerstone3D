import { getEnabledElementByIds, VolumeViewport } from '@cornerstonejs/core';
import { BaseTool } from './base';
import { scroll } from '../utilities';
import { PublicToolProps, ToolProps, EventTypes } from '../types';

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
export default class StackScrollTool extends BaseTool {
  static toolName = 'StackScroll';
  previousDirection: number;
  touchDragCallback: () => void;
  mouseDragCallback: () => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.previousDirection = 1;

    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  _dragCallback(evt: EventTypes.MouseDragEventType) {
    const { deltaPoints, viewportId, renderingEngineId } = evt.detail;
    const deltaFrames = deltaPoints.canvas[1];
    const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);
    const targetId = this.getTargetId(viewport);
    const { invert } = this.configuration;

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = targetId.split('volumeId:')[1];
    }

    // We need this check since the deltaFrames can be 0 when the user is
    // scrolling very slowly so in that case we use the previous direction
    let direction;
    if (deltaFrames === 0) {
      direction = this.previousDirection;
    } else {
      direction = deltaFrames > 0 ? 1 : -1;
      this.previousDirection = direction;
    }

    const delta = direction * (invert ? -1 : 1);

    // Todo: debounce the scroll similar to stackScrollToolMouseWheelTool
    scroll(viewport, { delta, volumeId });
  }
}
