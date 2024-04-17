import { utilities } from '@cornerstonejs/tools';

import { configElement } from './createElement';
import addSliderToToolbar from './addSliderToToolbar';

interface configBrush extends configElement {
  title?: string;
  toolGroupId?: string;
  range?: number[];
  defaultValue?: number;
}

/**
 * Adds a slider to control brush size to the example page.
 */
export default function addBrushSizeSlider(config: configBrush): void {
  if (!config.toolGroupId) {
    config.toolGroupId = 'TOOL_GROUP_ID';
  }

  //
  addSliderToToolbar({
    merge: config,
    title: 'Brush Size: ',
    range: [5, 50],
    defaultValue: 25,
    onSelectedValueChange: (valueAsStringOrNumber) => {
      const value = Number(valueAsStringOrNumber);

      utilities.segmentation.setBrushSizeForToolGroup(
        config.toolGroupId,
        value
      );
    },
  });
}
