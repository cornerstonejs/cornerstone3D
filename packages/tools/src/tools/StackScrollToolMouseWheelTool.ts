import { BaseTool } from './base';
import { scrollThroughStack } from '../utilities/stackScrollTool';
import { MouseWheelEventType } from '../types/EventTypes';
import { getEnabledElement, VolumeViewport } from '@cornerstonejs/core';

/**
 * The StackScrollMouseWheelTool is a tool that allows the user to scroll through a
 * stack of images using the mouse wheel
 */
export default class StackScrollMouseWheelTool extends BaseTool {
  static toolName = 'StackScrollMouseWheel';

  _configuration: any;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      invert: false,
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  mouseWheelCallback(evt: MouseWheelEventType): void {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const targetId = this.getTargetId(viewport);

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = targetId.split('volumeId:')[1];
    }

    scrollThroughStack(viewport, { direction, invert, volumeId });
  }
}
