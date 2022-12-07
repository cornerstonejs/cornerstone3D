import {
  triggerEvent,
  eventTarget,
  getRenderingEngine,
  Enums,
  Types,
} from '@cornerstonejs/core';
import { Events as csToolsEvents } from '../../enums';
import {
  getToolGroup,
  getToolGroupForViewport,
} from '../../store/ToolGroupManager';

import SegmentationDisplayTool from '../../tools/displayTools/SegmentationDisplayTool';
import { SegmentationRenderedEventDetail } from '../../types/EventTypes';

/**
 * SegmentationRenderingEngine is a class that is responsible for rendering
 * segmentations for a toolGroup. It will call SegmentationDisplayTool to render the segmentation
 * based on the segmentation data and their configurations. Note: This is a Singleton class
 * and should not be instantiated directly. To trigger a render for all the
 * segmentations of a tool group you can use.
 *
 * ```
 * triggerSegmentationRender(toolGroupId)
 * ```
 */
class SegmentationRenderingEngine {
  private _needsRender: Set<string> = new Set();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  public hasBeenDestroyed: boolean;

  public removeToolGroup(toolGroupId) {
    this._needsRender.delete(toolGroupId);

    if (this._needsRender.size === 0) {
      this._reset();
    }
  }

  public renderToolGroupSegmentations(toolGroupId): void {
    this._setToolGroupSegmentationToBeRenderedNextFrame([toolGroupId]);
  }

  /**
   *  _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  private _setToolGroupSegmentationToBeRenderedNextFrame(
    toolGroupIds: string[]
  ) {
    // Add the viewports to the set of flagged viewports
    toolGroupIds.forEach((toolGroupId) => {
      this._needsRender.add(toolGroupId);
    });

    // Render any flagged viewports
    this._render();
  }

  /**
   *  _render Sets up animation frame if necessary
   */
  private _render() {
    // If we have viewports that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedToolGroups
      );

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true;
    }
  }

  private _renderFlaggedToolGroups = () => {
    this._throwIfDestroyed();

    // for each toolGroupId insides the _needsRender set, render the segmentation
    const toolGroupIds = Array.from(this._needsRender.values());

    for (const toolGroupId of toolGroupIds) {
      this._triggerRender(toolGroupId);

      // This viewport has been rendered, we can remove it from the set
      this._needsRender.delete(toolGroupId);

      // If there is nothing left that is flagged for rendering, stop here
      // and allow RAF to be called again
      if (this._needsRender.size === 0) {
        this._animationFrameSet = false;
        this._animationFrameHandle = null;
        return;
      }
    }
  };
  _triggerRender(toolGroupId) {
    const toolGroup = getToolGroup(toolGroupId);

    if (!toolGroup) {
      console.warn(`No tool group found with toolGroupId: ${toolGroupId}`);
      return;
    }

    const { viewportsInfo } = toolGroup;
    const viewports = [];

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const renderingEngine = getRenderingEngine(renderingEngineId);

      if (!renderingEngine) {
        console.warn('rendering Engine has been destroyed');
        return;
      }

      viewports.push(renderingEngine.getViewport(viewportId));
    });

    const segmentationDisplayToolInstance = toolGroup.getToolInstance(
      SegmentationDisplayTool.toolName
    ) as SegmentationDisplayTool;
    if (!segmentationDisplayToolInstance) {
      console.warn('No segmentation tool found inside', toolGroupId);
      return;
    }

    function onSegmentationRender(evt: Types.EventTypes.ImageRenderedEvent) {
      const { element, viewportId, renderingEngineId } = evt.detail;

      element.removeEventListener(
        Enums.Events.IMAGE_RENDERED,
        onSegmentationRender as EventListener
      );

      const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

      if (!toolGroup) {
        console.warn('toolGroup has been destroyed');
        return;
      }

      const eventDetail: SegmentationRenderedEventDetail = {
        toolGroupId: toolGroup.id,
        viewportId,
      };

      triggerEvent(eventTarget, csToolsEvents.SEGMENTATION_RENDERED, {
        ...eventDetail,
      });
    }

    // Todo: for other representations we probably need the drawSVG, but right now we are not using it
    // drawSvg(element, (svgDrawingHelper) => {
    //   const handleDrawSvg = (tool) => {
    //     if (tool instanceof SegmentationDisplayTool && tool.renderAnnotation) {
    //       tool.renderAnnotation({ detail: eventDetail })
    //       triggerEvent(element, csToolsEvents.SEGMENTATION_RENDERED, { ...eventDetail })
    //     }
    //   }
    //   enabledTools.forEach(handleDrawSvg)
    // })

    viewports.forEach(({ element }) => {
      element.addEventListener(
        Enums.Events.IMAGE_RENDERED,
        onSegmentationRender
      );
    });

    segmentationDisplayToolInstance.renderSegmentation(toolGroupId);
  }

  /**
   *  _reset Resets the `RenderingEngine`
   */
  private _reset() {
    window.cancelAnimationFrame(this._animationFrameHandle);

    this._needsRender.clear();
    this._animationFrameSet = false;
    this._animationFrameHandle = null;
  }
}

const segmentationRenderingEngine = new SegmentationRenderingEngine();

/**
 * It triggers a render for all the segmentations of the tool group with the given Id.
 * @param toolGroupId - The Id of the tool group to render.
 */
function triggerSegmentationRender(toolGroupId: string): void {
  segmentationRenderingEngine.renderToolGroupSegmentations(toolGroupId);
}

export { segmentationRenderingEngine, triggerSegmentationRender };
export default triggerSegmentationRender;
