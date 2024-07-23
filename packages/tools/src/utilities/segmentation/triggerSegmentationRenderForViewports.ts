import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';
/**
 * It triggers segmentation render for the given viewport id if not
 * provided it will trigger for all viewports.
 */
function triggerSegmentationRenderForViewports(viewportIds?: string[]): void {
  segmentationRenderingEngine.renderSegmentationsForViewports(viewportIds);
}

export { triggerSegmentationRenderForViewports };
export default triggerSegmentationRenderForViewports;
