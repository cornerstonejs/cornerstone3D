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
import { getSegmentation } from './getSegmentation';
import { getSegmentationRepresentations } from './getSegmentationRepresentation';
import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { addTool } from '../../store/addTool';
import { state } from '../../store/state';
import PlanarFreehandContourSegmentationTool from '../../tools/annotation/PlanarFreehandContourSegmentationTool';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import { addDefaultSegmentationListener } from './segmentationEventManager';
import { getSegmentationRepresentationDisplay } from './SegmentationRepresentationDisplayRegistry';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'stateManagement.segmentation.SegmentationRenderingEngine'
);

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

  /**
   * Flags the viewports for the next animation frame. The flags are a set, so
   * many requests for one viewport before a frame cause one render of that
   * viewport. A request made while a frame renders goes into the set for the
   * frame after it, because `_renderFlaggedSegmentations` takes and clears the
   * set before it renders.
   */
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

    // Take and clear the flags before the render, so that a request made
    // during the render is kept for the next frame
    const viewportIds = Array.from(this._needsRender);
    this._needsRender.clear();

    // Allow RAF to be called again
    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    viewportIds.forEach((viewportId) => {
      // A viewport that throws must not skip the other viewports of the frame,
      // because the set is already cleared and they would not render again.
      try {
        this._triggerRender(viewportId);
      } catch (error) {
        cs3dLogger.error(error);
      }
    });
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

    // Render each segmentationData, in each viewport
    const segmentationRenderList = segmentationRepresentations.map(
      (representation: SegmentationRepresentation) => {
        if (representation.type === SegmentationRepresentations.Contour) {
          // if the representation is contour we need to make sure
          // that the planarFreeHandTool is added
          this._addPlanarFreeHandToolIfAbsent(viewport);
        }

        const display = getSegmentationRepresentationDisplay(
          representation.type
        );
        const segmentation = getSegmentation(representation.segmentationId);
        const existingRepresentation =
          segmentation.representationData[representation.type] !== undefined;

        if (!display) {
          cs3dLogger.warn(
            `No display registered for segmentation representation type ${representation.type}.`
          );
          return Promise.resolve({
            segmentationId: representation.segmentationId,
            type: representation.type,
          });
        }

        return display
          .render(viewport, representation)
          .then(() => {
            if (!existingRepresentation) {
              addDefaultSegmentationListener(
                viewport,
                representation.segmentationId,
                representation.type
              );
            }

            return {
              segmentationId: representation.segmentationId,
              type: representation.type,
            };
          })
          .catch((error) => {
            cs3dLogger.error(error);

            return {
              segmentationId: representation.segmentationId,
              type: representation.type,
            };
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

// Trailing delay before re-rendering a projection-heavy viewport after a
// segmentation-data modification (brush edits fire many events per second).
const DEFERRED_SEGMENTATION_RENDER_DELAY_MS = 240;
const deferredSegmentationRenderTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

/**
 * Whether re-rendering this viewport's segmentations means re-marching a slab
 * per fragment (labelmap over MIP style projections), which is too expensive
 * to repeat for every segmentation-data-modified event.
 */
function isProjectionHeavySegmentationViewport(
  viewport: Types.IViewport
): boolean {
  // Legacy volume viewports render labelmap-over-MIP by switching the whole
  // viewport to the edge-projection blend mode.
  const blendMode = (
    viewport as Partial<{ getBlendMode: () => Enums.BlendModes }>
  ).getBlendMode?.();

  if (blendMode === Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND) {
    return true;
  }

  // Generic planar viewports are projection-heavy when any of their display
  // sets renders across a slab (e.g. a MIP source with a projected labelmap
  // overlay, which inherits the source's slab thickness).
  const planarViewport = viewport as Partial<{
    getActors: () => Types.ActorEntry[];
    getSourceDataId: () => string | undefined;
    getDisplaySetPresentation: (
      dataId: string
    ) => { slabThickness?: number } | undefined;
  }>;

  if (typeof planarViewport.getDisplaySetPresentation !== 'function') {
    return false;
  }

  const dataIds: string[] = [];
  const sourceDataId = planarViewport.getSourceDataId?.();

  if (sourceDataId) {
    dataIds.push(sourceDataId);
  }

  planarViewport.getActors?.().forEach((actorEntry) => {
    if (actorEntry.representationUID) {
      dataIds.push(String(actorEntry.representationUID));
    }
  });

  return dataIds.some(
    (dataId) =>
      (planarViewport.getDisplaySetPresentation(dataId)?.slabThickness ?? 0) > 0
  );
}

/**
 * Segmentation render trigger for high-frequency data modifications (brush
 * strokes and the like): viewports that are cheap to repaint render live,
 * while projection-heavy viewports (labelmap over MIP) are re-rendered once
 * the modification stream goes quiet.
 */
function triggerSegmentationRenderForModified(segmentationId?: string): void {
  const viewportIds =
    segmentationRenderingEngine._getViewportIdsForSegmentation(segmentationId);

  viewportIds.forEach((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId) || {};

    if (!viewport) {
      return;
    }

    if (!isProjectionHeavySegmentationViewport(viewport)) {
      segmentationRenderingEngine.renderSegmentationsForViewport(viewportId);
      return;
    }

    const existingTimer = deferredSegmentationRenderTimers.get(viewportId);

    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    deferredSegmentationRenderTimers.set(
      viewportId,
      setTimeout(() => {
        deferredSegmentationRenderTimers.delete(viewportId);
        segmentationRenderingEngine.renderSegmentationsForViewport(viewportId);
      }, DEFERRED_SEGMENTATION_RENDER_DELAY_MS)
    );
  });
}

const segmentationRenderingEngine = new SegmentationRenderingEngine();
export {
  triggerSegmentationRender,
  triggerSegmentationRenderBySegmentationId,
  triggerSegmentationRenderForModified,
  segmentationRenderingEngine,
};
