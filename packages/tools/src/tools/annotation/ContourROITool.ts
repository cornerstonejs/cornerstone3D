import type { PublicToolProps, ToolProps } from '../../types';
import PlanarFreehandContourSegmentationTool from './PlanarFreehandContourSegmentationTool';
import InterpolationManager from '../../utilities/contourROITool/InterpolationManager';

class ContourROITool extends PlanarFreehandContourSegmentationTool {
  constructor(toolProps: PublicToolProps = {}) {
    super(toolProps);
    this.configuration.interpolation.interpolateOnAdd = false;
    this.configuration.interpolation.interpolateOnEdit = false;
    InterpolationManager.addTool(this.getToolName());
  }
}

ContourROITool.toolName = 'ContourROI';
export default ContourROITool;
