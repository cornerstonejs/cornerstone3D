import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';

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

export { triggerSegmentationRender, triggerSegmentationRenderBySegmentationId };
