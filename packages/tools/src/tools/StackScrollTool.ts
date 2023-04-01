import {
  getEnabledElementByIds,
  VolumeViewport,
  StackViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { BaseTool } from './base';
import { scroll } from '../utilities';
import { PublicToolProps, ToolProps, EventTypes } from '../types';

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
class StackScrollTool extends BaseTool {
  static toolName;
  deltaY: number;
  deltaX: number;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
        leftRightMode: false,
        debounceIfNotLoaded: true,
        loop: false,
        stackScrollEnabled: true,
        mipMode: {
          enabled: true,
          invert: false,
          pixelsPerThickness: 5,
          minSlabThickness: 5e-2,
          maxSlabThickness: 30,
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.deltaY = 1;
    this.deltaX = 1;
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

    const targetId = this.getTargetId(viewport);
    const {
      debounceIfNotLoaded,
      invert,
      loop,
      leftRightMode,
      stackScrollEnabled,
    } = this.configuration;

    const deltaPointY = deltaPoints.canvas[1];
    const deltaPointX = deltaPoints.canvas[0];

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = targetId.split('volumeId:')[1];
    }

    const pixelsPerImage = this._getPixelPerImage(viewport);
    const deltaY = deltaPointY + this.deltaY;
    const deltaX = deltaPointX + this.deltaX;

    if (!pixelsPerImage) {
      return;
    }

    if (stackScrollEnabled && !leftRightMode) {
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

    if (stackScrollEnabled && leftRightMode) {
      if (Math.abs(deltaX) >= pixelsPerImage) {
        const imageIdIndexOffset = Math.round(deltaX / pixelsPerImage);

        scroll(viewport, {
          delta: invert ? -imageIdIndexOffset : imageIdIndexOffset,
          volumeId,
          debounceLoading: debounceIfNotLoaded,
          loop: loop,
        });

        this.deltaX = deltaX % pixelsPerImage;
      } else {
        this.deltaX = deltaX;
      }
    }

    const { mipMode } = this.configuration;
    if (!mipMode?.enabled) return;
    const { pixelsPerThickness, mipModeInvert } = mipMode;

    if (mipMode?.enabled && leftRightMode) {
      if (Math.abs(deltaY) >= pixelsPerThickness) {
        this._triggerMIP(viewport, deltaY > 0 ? -1 : 1, mipModeInvert);
        this.deltaY = deltaY % pixelsPerThickness;
      } else {
        this.deltaY = deltaY;
      }
    }

    if (mipMode?.enabled && !leftRightMode) {
      if (Math.abs(deltaX) >= pixelsPerThickness) {
        this._triggerMIP(viewport, deltaX > 0 ? 1 : -1, mipModeInvert);
        this.deltaX = deltaX % pixelsPerThickness;
      } else {
        this.deltaX = deltaX;
      }
    }
  }

  _getPixelPerImage(viewport) {
    const { element } = viewport;
    const numberOfSlices = this._getNumberOfSlices(viewport);

    // The Math.max here makes it easier to mouseDrag-scroll small or really large image stacks
    return Math.max(2, element.offsetHeight / Math.max(numberOfSlices, 8));
  }

  _getNumberOfSlices(viewport) {
    if (viewport instanceof VolumeViewport) {
      const { numberOfSlices } =
        csUtils.getImageSliceDataForVolumeViewport(viewport);
      return numberOfSlices;
    } else if (viewport instanceof StackViewport) {
      return viewport.getImageIds().length;
    }
  }

  _triggerMIP(viewport, delta, invert) {
    const inversionValue = invert ? -1 : 1;
    const { minSlabThickness, maxSlabThickness } = this.configuration.mipMode;
    if (viewport instanceof VolumeViewport) {
      const slabThickness = Math.min(
        maxSlabThickness,
        viewport.getSlabThickness() + inversionValue * delta
      );
      if (slabThickness <= minSlabThickness) {
        viewport.setBlendMode(0);
        viewport.setSlabThickness(minSlabThickness);
        viewport.render();
      } else {
        viewport.setBlendMode(1);
        viewport.setSlabThickness(
          slabThickness >= maxSlabThickness ? maxSlabThickness : slabThickness
        );
        viewport.render();
      }
    }
  }
}

StackScrollTool.toolName = 'StackScroll';
export default StackScrollTool;
