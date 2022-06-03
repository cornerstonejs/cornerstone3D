import {
  getEnabledElement,
  VolumeViewport,
  StackViewport,
  triggerEvent,
  cache,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { BaseTool } from './base';
import {
  MouseWheelEventType,
  StackScrollEventDetail,
} from '../types/EventTypes';
import { scrollVolume } from '../utilities/scroll';
import { Events } from '../enums';
import { ToolGroupManager } from '../store';
import { clip } from '../utilities';

type StackScrollState = {
  imageIds: string[];
  currentIndex: number;
  debouncedTimeout: number;
};

/**
 * The StackScrollMouseWheelTool is a tool that allows the user to scroll through a
 * stack of images using the mouse wheel
 */
export default class StackScrollMouseWheelTool extends BaseTool {
  static toolName = 'StackScrollMouseWheel';

  _configuration: any;
  _internalState: Record<number, StackScrollState> = {};

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
    this._internalState = {};
    this._initializeViewportStackChangeEventListener();
  }

  _getScrollState(viewportId: string): StackScrollState {
    const state = this._internalState[viewportId];

    if (!state) {
      this._internalState[viewportId] = {
        imageIds: [],
        currentIndex: null,
      };
      return this._internalState[viewportId];
    }

    return state;
  }

  mouseWheelCallback(evt: MouseWheelEventType): void {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const delta = direction * (invert ? -1 : 1);

    if (viewport instanceof StackViewport) {
      const scrollState = this._getScrollState(viewport.id);
      this._scrollStack(viewport, delta, scrollState);
    } else if (viewport instanceof VolumeViewport) {
      const targetId = this.getTargetId(viewport);
      const volumeId = targetId.split('volumeId:')[1];
      scrollVolume(viewport, volumeId, delta);
    }
  }

  _scrollStack(
    viewport: StackViewport,
    delta: number,
    scrollState: StackScrollState
  ): void {
    const currentImageIdIndex =
      scrollState.currentIndex || viewport.getCurrentImageIdIndex();
    const imageIds = viewport.getImageIds();
    const numberOfFrames = imageIds.length;
    let newImageIdIndex = currentImageIdIndex + delta;
    newImageIdIndex = clip(newImageIdIndex, 0, numberOfFrames - 1);
    scrollState.currentIndex = newImageIdIndex;

    const imageAlreadyLoaded = cache.isImageIdCached(imageIds[newImageIdIndex]);

    // If image is already cached we want to scroll right away; however, if it is
    // not cached, we can debounce the scroll event to avoid firing multiple scroll
    // events for the images that might happen to be passing by (as a result of infinite
    // scrolling).
    if (imageAlreadyLoaded || !this.configuration.debounceIfNotLoaded) {
      viewport.setImageIdIndex(newImageIdIndex);
    } else {
      clearTimeout(scrollState.debouncedTimeout);
      scrollState.debouncedTimeout = window.setTimeout(() => {
        viewport.setImageIdIndex(newImageIdIndex);
      }, 40);
    }

    const eventData: StackScrollEventDetail = {
      newImageIdIndex,
      imageId: imageIds[newImageIdIndex],
      direction: delta,
    };

    if (newImageIdIndex !== currentImageIdIndex) {
      triggerEvent(viewport.element, Events.STACK_SCROLL, eventData);
    }
  }

  /**
   * sets up event listeners for when a stack of images is changed in the toolGroup's
   * viewports that this tool instance belongs to. This is needed since we are setting
   * an internal state for the stackViewport as with the new configuration the scroll
   * can be debounced and as a result we need to keep track of previous indices that
   * was set.
   */
  _initializeViewportStackChangeEventListener() {
    const viewportStackChangeHandlerBound =
      viewportStackChangeHandler.bind(this);
    const viewportStackChangeCleanupBound =
      viewportStackChangeCleanup.bind(this);

    function viewportStackChangeHandler(
      evt: Types.EventTypes.NewStackSetEvent
    ) {
      const toolGroup = ToolGroupManager.getToolGroup(this.toolGroupId);

      if (!toolGroup) {
        return;
      }

      const viewportIds = toolGroup.getViewportIds();

      const { imageIds, viewportId, currentImageIdIndex } = evt.detail;

      if (viewportIds.indexOf(viewportId) === -1) {
        return;
      }

      const scrollState = this._getScrollState(viewportId);
      scrollState.imageIds = imageIds;
      scrollState.currentIndex = currentImageIdIndex;
    }

    function viewportStackChangeCleanup(
      evt: Types.EventTypes.ElementDisabledEvent
    ) {
      const { viewportId } = evt.detail;
      const toolGroup = ToolGroupManager.getToolGroup(this.toolGroupId);

      if (!toolGroup) {
        return;
      }

      const viewportIds = toolGroup.getViewportIds();

      if (viewportIds.indexOf(viewportId) === -1) {
        return;
      }

      eventTarget.removeEventListener(
        Enums.Events.NEW_STACK_SET,
        viewportStackChangeHandlerBound
      );

      eventTarget.removeEventListener(
        Enums.Events.ELEMENT_DISABLED,
        viewportStackChangeCleanupBound
      );

      delete this._internalState[viewportId];
    }

    eventTarget.removeEventListener(
      Enums.Events.NEW_STACK_SET,
      viewportStackChangeHandlerBound
    );
    eventTarget.addEventListener(
      Enums.Events.NEW_STACK_SET,
      viewportStackChangeHandlerBound
    );

    eventTarget.addEventListener(
      Enums.Events.ELEMENT_DISABLED,
      viewportStackChangeCleanupBound
    );
  }
}
