import {
  getEnabledElementByIds,
  getEnabledElement,
  VolumeViewport,
  BaseVolumeViewport,
  utilities,
} from '@cornerstonejs/core';
import { BaseTool } from './base';
import type { PublicToolProps, ToolProps, EventTypes } from '../types';

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
class StackScrollTool extends BaseTool {
  static toolName;
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

  mouseWheelCallback(evt: EventTypes.MouseWheelEventType) {
    // based on configuration, we decide if we want to scroll or rotate
    this._scroll(evt);
  }

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }
  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  _dragCallback(evt: EventTypes.InteractionEventType) {
    this._scrollDrag(evt);
  }

  _scrollDrag(evt: EventTypes.InteractionEventType) {
    const { deltaPoints, viewportId, renderingEngineId } = evt.detail;
    const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);
    const { debounceIfNotLoaded, invert, loop } = this.configuration;
    const deltaPointY = deltaPoints.canvas[1];

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = viewport.getVolumeId();
    }

    const pixelsPerImage = this._getPixelPerImage(viewport);
    const deltaY = deltaPointY + this.deltaY;

    if (!pixelsPerImage) {
      return;
    }

    if (Math.abs(deltaY) >= pixelsPerImage) {
      const imageIdIndexOffset = Math.round(deltaY / pixelsPerImage);

      utilities.scroll(viewport, {
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

  /**
   * Allows binding to the mouse wheel for performing stack scrolling.
   */
  _scroll(evt: EventTypes.MouseWheelEventType): void {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const delta = direction * (invert ? -1 : 1);

    utilities.scroll(viewport, {
      delta,
      debounceLoading: this.configuration.debounceIfNotLoaded,
      loop: this.configuration.loop,
      volumeId:
        viewport instanceof BaseVolumeViewport
          ? viewport.getVolumeId()
          : undefined,
      scrollSlabs: this.configuration.scrollSlabs,
    });
  }

  _getPixelPerImage(viewport) {
    const { element } = viewport;
    const numberOfSlices = viewport.getNumberOfSlices();

    // The Math.max here makes it easier to mouseDrag-scroll small or really large image stacks
    return Math.max(2, element.offsetHeight / Math.max(numberOfSlices, 8));
  }
}

StackScrollTool.toolName = 'StackScroll';
export default StackScrollTool;
