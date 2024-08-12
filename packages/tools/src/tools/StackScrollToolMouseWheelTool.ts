import { getEnabledElement, utilities } from '@cornerstonejs/core';
import { BaseTool } from './base';
import { MouseWheelEventType } from '../types/EventTypes';
import scroll from '../utilities/scroll';

/**
 * The StackScrollMouseWheelTool is a tool that allows the user to scroll through a
 * stack of images using the mouse wheel
 *
 * @deprecated - this tool is going away in favour of bindign StackScrollTool directly.
 */
class StackScrollMouseWheelTool extends BaseTool {
  public static toolName = 'StackScrollMouseWheel';

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

    const volumeId = this.getTargetVolumeId(viewport);

    scroll(viewport, {
      delta,
      debounceLoading: this.configuration.debounceIfNotLoaded,
      loop: this.configuration.loop,
      volumeId,
      scrollSlabs: this.configuration.scrollSlabs,
    });
  }
}

export default StackScrollMouseWheelTool;
