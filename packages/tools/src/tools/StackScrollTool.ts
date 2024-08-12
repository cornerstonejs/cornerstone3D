import {
  getEnabledElementByIds,
  getEnabledElement,
  VolumeViewport,
} from '@cornerstonejs/core';
import { BaseTool } from './base';
import { scroll } from '../utilities';
import { PublicToolProps, ToolProps, EventTypes } from '../types';

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
class StackScrollTool extends BaseTool {
  static toolName = 'StackScroll';

  deltaY: number;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
        debounceIfNotLoaded: true,
        loop: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.deltaY = 1;
  }

  /**
   * Allows binding to the mouse wheel for performing stack scrolling.
   */
  mouseWheelCallback(evt: EventTypes.MouseWheelEventType): void {
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

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }
  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { deltaPoints, viewportId, renderingEngineId } = evt.detail;
    const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);
    const { debounceIfNotLoaded, invert, loop } = this.configuration;
    const deltaPointY = deltaPoints.canvas[1];

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = this.getTargetVolumeId(viewport);
    }

    const pixelsPerImage = this._getPixelPerImage(viewport);
    const deltaY = deltaPointY + this.deltaY;

    if (!pixelsPerImage) {
      return;
    }

    if (Math.abs(deltaY) >= pixelsPerImage) {
      const imageIdIndexOffset = Math.round(deltaY / pixelsPerImage);

      scroll(viewport, {
        delta: invert ? -imageIdIndexOffset : imageIdIndexOffset,
        volumeId,
        debounceLoading: debounceIfNotLoaded,
        loop: loop,
      });

      this.deltaY = deltaY % pixelsPerImage;
    } else {
      this.deltaY = deltaY;
    }
  }

  _getPixelPerImage(viewport) {
    const { element } = viewport;
    const numberOfSlices = viewport.getNumberOfSlices();

    // The Math.max here makes it easier to mouseDrag-scroll small or really large image stacks
    return Math.max(2, element.offsetHeight / Math.max(numberOfSlices, 8));
  }
}

export default StackScrollTool;
