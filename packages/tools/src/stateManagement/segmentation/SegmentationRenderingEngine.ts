import type { Types } from '@cornerstonejs/core';
import {
  triggerEvent,
  eventTarget,
  Enums,
  getRenderingEngines,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import {
  SegmentationRepresentations,
  Events as csToolsEvents,
} from '../../enums';

import type { SegmentationRenderedEventDetail } from '../../types/EventTypes';
import Representations from '../../enums/SegmentationRepresentations';
import { getSegmentationRepresentations } from './getSegmentationRepresentation';
import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import surfaceDisplay from '../../tools/displayTools/Surface/surfaceDisplay';
import contourDisplay from '../../tools/displayTools/Contour/contourDisplay';
import labelmapDisplay from '../../tools/displayTools/Labelmap/labelmapDisplay';
import { addTool } from '../../store/addTool';
import { state } from '../../store/state';
import PlanarFreehandContourSegmentationTool from '../../tools/annotation/PlanarFreehandContourSegmentationTool';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';

const renderers = {
  [Representations.Labelmap]: labelmapDisplay,
  [Representations.Contour]: contourDisplay,
  [Representations.Surface]: surfaceDisplay,
};

const planarContourToolName = PlanarFreehandContourSegmentationTool.toolName;

/**
 * SegmentationRenderingEngine is a class that is responsible for rendering
 * segmentations. It will render the segmentation based on the segmentation data
 * and their configurations. Note: This is a Singleton class and should not be
 * instantiated directly. To trigger a render for all the segmentations, you can use:
 *
 */
class SegmentationRenderingEngine {
  private _needsRender: Set<string> = new Set();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  public hasBeenDestroyed: boolean;

  /**
   * Renders the segmentations on the specified viewport or all viewports that has
   * some sort of segmentation representation.
   *
   * @param viewportId - The ID of the viewport to render the segmentations on. If not provided, segmentations will be rendered on all viewports.
   */
  public renderSegmentationsForViewport(viewportId?: string): void {
    const viewportIds = viewportId
      ? [viewportId]
      : this._getViewportIdsForSegmentation();
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  /**
   * Renders the segmentation with the specified ID.
   *
   * @param segmentationId - The ID of the segmentation to render.
   */
  public renderSegmentation(segmentationId: string): void {
    const viewportIds = this._getViewportIdsForSegmentation(segmentationId);
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  _getAllViewports = () => {
    const renderingEngine = getRenderingEngines();
    return renderingEngine.flatMap((renderingEngine) =>
      renderingEngine.getViewports()
    );
  };

  _getViewportIdsForSegmentation(segmentationId?: string): string[] {
    const viewports = this._getAllViewports();
    const viewportIds = [];

    for (const viewport of viewports) {
      const viewportId = viewport.id;

      if (segmentationId) {
        const segmentationRepresentations = getSegmentationRepresentations(
          viewportId,
          { segmentationId }
        );

        if (segmentationRepresentations?.length > 0) {
          viewportIds.push(viewportId);
        }
      } else {
        const segmentationRepresentations =
          getSegmentationRepresentations(viewportId);

        if (segmentationRepresentations?.length > 0) {
          viewportIds.push(viewportId);
        }
      }
    }

    return viewportIds;
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

  private _setViewportsToBeRenderedNextFrame(viewportIds: string[]) {
    // Add the viewports to the set of flagged viewports
    viewportIds.forEach((viewportId) => {
      this._needsRender.add(viewportId);
    });

    // Render any flagged viewports
    this._render();
  }

  /**
   *  _render Sets up animation frame if necessary
   */
  private _render() {
    // If we have segmentations that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedSegmentations
      );

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true;
    }
  }

  private _renderFlaggedSegmentations = () => {
    this._throwIfDestroyed();

    const viewportIds = Array.from(this._needsRender);

    viewportIds.forEach((viewportId) => {
      this._triggerRender(viewportId);
    });

    // Clear the set of flagged segmentations
    this._needsRender.clear();

    // Allow RAF to be called again
    this._animationFrameSet = false;
    this._animationFrameHandle = null;
  };

  _triggerRender(viewportId?: string) {
    const segmentationRepresentations =
      getSegmentationRepresentations(viewportId);

    if (!segmentationRepresentations?.length) {
      return;
    }
    const { viewport } = getEnabledElementByViewportId(viewportId) || {};

    if (!viewport) {
      return;
    }

    const viewportRenderList = [];

    // Render each segmentationData, in each viewport
    const segmentationRenderList = segmentationRepresentations.map(
      (representation: SegmentationRepresentation) => {
        if (representation.type === SegmentationRepresentations.Contour) {
          // if the representation is contour we need to make sure
          // that the planarFreeHandTool is added
          this._addPlanarFreeHandToolIfAbsent(viewport);
        }

        const display = renderers[representation.type];

        try {
          // @ts-ignore
          const viewportId = display.render(viewport, representation);
          viewportRenderList.push(viewportId);
        } catch (error) {
          console.error(error);
        }

        return Promise.resolve({
          segmentationId: representation.segmentationId,
          type: representation.type,
        });
      }
    );

    Promise.allSettled(segmentationRenderList).then((results) => {
      const segmentationDetails = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);

      function onSegmentationRender(evt: Types.EventTypes.ImageRenderedEvent) {
        const { element, viewportId } = evt.detail;

        element.removeEventListener(
          Enums.Events.IMAGE_RENDERED,
          onSegmentationRender as EventListener
        );

        segmentationDetails.forEach((detail) => {
          const eventDetail: SegmentationRenderedEventDetail = {
            viewportId,
            segmentationId: detail.segmentationId,
            type: detail.type,
          };

          triggerEvent(eventTarget, csToolsEvents.SEGMENTATION_RENDERED, {
            ...eventDetail,
          });
        });
      }

      // For all viewports, trigger a re-render
      const element = viewport.element;
      element.addEventListener(
        Enums.Events.IMAGE_RENDERED,
        onSegmentationRender as EventListener
      );

      // Render the viewport
      viewport.render();
    });
  }

  _addPlanarFreeHandToolIfAbsent(viewport) {
    // if it is contour we should check if the cornerstoneTools have the planarFreeHandTool added
    if (!(planarContourToolName in state.tools)) {
      addTool(PlanarFreehandContourSegmentationTool);
    }
    const toolGroup = getToolGroupForViewport(viewport.id);

    // check if toolGroup has this tool
    if (!toolGroup.hasTool(planarContourToolName)) {
      toolGroup.addTool(planarContourToolName);
      toolGroup.setToolPassive(planarContourToolName);
    }
  }
}

/**
 * It triggers segmentation render for the given viewportIds
 */
function triggerSegmentationRender(viewportId?: string): void {
  segmentationRenderingEngine.renderSegmentationsForViewport(viewportId);
}

/**
 * It triggers segmentation render for the given segmentationId
 */
function triggerSegmentationRenderBySegmentationId(
  segmentationId?: string
): void {
  segmentationRenderingEngine.renderSegmentation(segmentationId);
}

const segmentationRenderingEngine = new SegmentationRenderingEngine();
export {
  triggerSegmentationRender,
  triggerSegmentationRenderBySegmentationId,
  segmentationRenderingEngine,
};
