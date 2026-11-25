import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';

/**
 * Listens to the core RENDERING_PIPELINE_CHANGED event, fired after a viewport
 * rebuilds its render paths in place (live render-backend switch). The rebuild
 * replaces the viewport's actors, so any segmentation representations mounted
 * on it must be re-reconciled and restyled against the new actor instances --
 * without this, remounted labelmap overlays render unstyled (invisible).
 * @param evt - The RENDERING_PIPELINE_CHANGED event object
 */
const renderingPipelineChangedListener = function (evt: CustomEvent): void {
  const viewportId = evt.detail?.viewportId as string | undefined;

  if (!viewportId) {
    return;
  }

  const representations = getSegmentationRepresentations(viewportId);

  if (!representations?.length) {
    return;
  }

  triggerSegmentationRender(viewportId);
};

export default renderingPipelineChangedListener;
