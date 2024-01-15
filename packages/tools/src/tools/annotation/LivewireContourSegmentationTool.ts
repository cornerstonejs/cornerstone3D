import LivewireContourTool from './LivewireContourTool';

class LivewireContourSegmentationTool extends LivewireContourTool {
  static toolName;

  protected isContourSegmentationTool(): boolean {
    // Re-enable contour segmentation behavior disabled by LivewireContourTool
    return true;
  }
}

LivewireContourSegmentationTool.toolName = 'LivewireContourSegmentationTool';
export default LivewireContourSegmentationTool;
