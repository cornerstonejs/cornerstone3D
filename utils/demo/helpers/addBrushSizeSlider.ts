import { utilities } from '@cornerstonejs/tools';

import addSliderToToolbar from './addSliderToToolbar';

const { segmentation: segmentationUtils } = utilities;

/**
 * Adds a slider to control brush size to the example page.
 */
export default function (
  toolGroupId = 'TOOL_GROUP_ID',
  range = [5, 50],
  defaultValue = 25
) {
  addSliderToToolbar({
    title: 'Brush Size',
    range,
    defaultValue,
    onSelectedValueChange: (valueAsStringOrNumber) => {
      const value = Number(valueAsStringOrNumber);
      segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
    },
  });
}
