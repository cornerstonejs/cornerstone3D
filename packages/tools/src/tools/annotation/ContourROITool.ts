import type { PublicToolProps, ToolProps } from '../../types';
import PlanarFreehandContourSegmentationTool from './PlanarFreehandContourSegmentationTool';
import InterpolationManager from '../../utilities/segmentation/InterpolationManager/InterpolationManager';

class ContourROITool extends PlanarFreehandContourSegmentationTool {
  constructor(toolProps: PublicToolProps = {}) {
    super(toolProps);
    this.configuration.interpolation.enable = true;
    this.configuration.smoothing.smoothOnAdd = false;
    this.configuration.smoothing.smoothOnEdit = false;
    InterpolationManager.addTool(this.getToolName());
  }
}

ContourROITool.toolName = 'ContourROI';
export default ContourROITool;
