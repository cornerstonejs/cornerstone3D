import {
  triggerEvent,
  eventTarget,
  getRenderingEngine,
  Enums,
  Types,
  getRenderingEngines,
  getEnabledElementByViewportId,
  utilities as csUtils,
} from '@cornerstonejs/core';
import {
  SegmentationRepresentations,
  Events as csToolsEvents,
} from '../../enums';

import { SegmentationRenderedEventDetail } from '../../types/EventTypes';
import Representations from '../../enums/SegmentationRepresentations';
import { config as segmentationConfig } from '../../stateManagement/segmentation';
import { getViewportSegmentationRepresentations } from '../../stateManagement/segmentation/segmentationState';
import {
  SegmentationRepresentation,
  SegmentationRepresentationConfig,
} from '../../types/SegmentationStateTypes';
import { surfaceDisplay } from './Surface';
import { contourDisplay } from './Contour';
import { labelmapDisplay } from './Labelmap';
import { addTool, state } from '../../store';
import PlanarFreehandContourSegmentationTool from '../annotation/PlanarFreehandContourSegmentationTool';

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
 * ```
 * triggerSegmentationRender()
 * ```
 */
class SegmentationRenderingEngine {
  private _needsRender: Set<string> = new Set();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  public hasBeenDestroyed: boolean;

  public renderSegmentations(segmentationId?: string): void {
    const viewportIds = this._getViewportIdsForSegmentation(segmentationId);
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  public renderSegmentationsForViewports(viewportIds?: string[]): void {
    if (!viewportIds?.length) {
      const allViewports = this._getAllViewports();
      this._setViewportsToBeRenderedNextFrame(
        allViewports.map((viewport) => viewport.id)
      );
    } else {
      this._setViewportsToBeRenderedNextFrame(viewportIds);
    }
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
      const segmentationRepresentations =
        getViewportSegmentationRepresentations(viewportId);

      if (segmentationId) {
        const hasSegmentationRepresentation = segmentationRepresentations.some(
          (representation) => representation.segmentationId === segmentationId
        );

        if (hasSegmentationRepresentation) {
          viewportIds.push(viewportId);
        }
      } else {
        if (segmentationRepresentations.length > 0) {
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
      getViewportSegmentationRepresentations(viewportId);

    if (!segmentationRepresentations?.length) {
      return;
    }
    const { viewport } = getEnabledElementByViewportId(viewportId);

    const viewportRenderList = [];

    // Render each segmentationData, in each viewport
    const segmentationRenderList = segmentationRepresentations.map(
      (representation: SegmentationRepresentation) => {
        // const viewportsRenderList = [];

        if (representation.type === SegmentationRepresentations.Contour) {
          // if the representation is contour we need to make sure
          // that the planarFreeHandTool is added
          this._addPlanarFreeHandToolIfAbsent();
        }

        const display = renderers[representation.type];

        try {
          const viewportId = display.render(viewport, representation);
          viewportRenderList.push(viewportId);
        } catch (error) {
          console.error(error);
        }

        return Promise.resolve();
      }
    );

    function onSegmentationRender(evt: Types.EventTypes.ImageRenderedEvent) {
      const { element, viewportId } = evt.detail;

      element.removeEventListener(
        Enums.Events.IMAGE_RENDERED,
        onSegmentationRender as EventListener
      );

      const eventDetail: SegmentationRenderedEventDetail = {
        viewportId,
      };

      triggerEvent(eventTarget, csToolsEvents.SEGMENTATION_RENDERED, {
        ...eventDetail,
      });
    }

    Promise.allSettled(segmentationRenderList).then(() => {
      // for all viewports trigger a re-render
      const element = viewport.element;
      element.addEventListener(
        Enums.Events.IMAGE_RENDERED,
        onSegmentationRender as EventListener
      );

      // viewport render
      viewport.render();
    });
  }

  _addPlanarFreeHandToolIfAbsent() {
    // if it is contour we should check if the cornerstoneTools have the planarFreeHandTool added
    if (!(planarContourToolName in state.tools)) {
      addTool(PlanarFreehandContourSegmentationTool);
    }
  }
}

const segmentationRenderingEngine = new SegmentationRenderingEngine();

export { segmentationRenderingEngine };
