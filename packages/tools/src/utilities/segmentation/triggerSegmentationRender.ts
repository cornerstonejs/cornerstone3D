import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';
/**
 * It triggers segmentation render for the given segmentation ID.
 */
function triggerSegmentationRender(segmentationId?: string): void {
  segmentationRenderingEngine.renderSegmentations(segmentationId);
}

export { triggerSegmentationRender };
export default triggerSegmentationRender;
