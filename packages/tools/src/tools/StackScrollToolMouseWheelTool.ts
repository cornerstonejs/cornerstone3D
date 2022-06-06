import {
  getEnabledElement,
  VolumeViewport,
  StackViewport,
} from '@cornerstonejs/core';
import { BaseTool } from './base';
import { MouseWheelEventType } from '../types/EventTypes';
import { scrollVolume } from '../utilities/scroll';

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
      configuration: {
        invert: false,
        debounceIfNotLoaded: true,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  mouseWheelCallback(evt: MouseWheelEventType): void {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const delta = direction * (invert ? -1 : 1);

    if (viewport instanceof StackViewport) {
      viewport.scroll(delta, this.configuration.debounceIfNotLoaded);
    } else if (viewport instanceof VolumeViewport) {
      const targetId = this.getTargetId(viewport);
      const volumeId = targetId.split('volumeId:')[1];
      scrollVolume(viewport, volumeId, delta);
    } else {
      throw new Error('StackScrollMouseWheelTool: Unsupported viewport type');
    }
  }
}
