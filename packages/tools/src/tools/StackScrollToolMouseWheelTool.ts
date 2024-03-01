import { getEnabledElement } from '@cornerstonejs/core';
import { BaseTool } from './base';
import { MouseWheelEventType } from '../types/EventTypes';
import scroll from '../utilities/scroll';

/**
 * The StackScrollMouseWheelTool is a tool that allows the user to scroll through a
 * stack of images using the mouse wheel
 */
class StackScrollMouseWheelTool extends BaseTool {
  static toolName;

  _configuration: any;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
        debounceIfNotLoaded: true,
        loop: false,
        scrollSlabs: false,
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

    const targetId = this.getTargetId(viewport);
    const volumeId = targetId.split(/volumeId:|\?/)[1];

    scroll(viewport, {
      delta,
      debounceLoading: this.configuration.debounceIfNotLoaded,
      loop: this.configuration.loop,
      volumeId,
      scrollSlabs: this.configuration.scrollSlabs,
    });
  }
}

StackScrollMouseWheelTool.toolName = 'StackScrollMouseWheel';
export default StackScrollMouseWheelTool;
