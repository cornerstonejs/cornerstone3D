import { segmentation } from '@cornerstonejs/tools';

import addDropDownToToolbar from './addDropdownToToolbar';

type SegmentDropdownType = Function & {
  /** The segmentationId to apply to */
  segmentationId?: string;
  /** The segment index currently being used */
  segmentIndex?: number;
  /** A function to update the active segment index */
  updateActiveSegmentIndex?: (segmentIndex: number) => void;
};
/**
 * Ceate a segment index selector dropdown
 *
 */
const addSegmentIndexDropdown: SegmentDropdownType = (
  segmentationId,
  segmentIndices = [1, 2, 3, 4, 5]
) => {
  addSegmentIndexDropdown.segmentationId = segmentationId;
  addSegmentIndexDropdown.segmentIndex = segmentIndices[0];
  addDropDownToToolbar({
    labelText: 'Segment Index',
    options: { values: segmentIndices, defaultValue: segmentIndices[0] },
    onSelectedValueChange: (nameAsStringOrNumber) => {
      addSegmentIndexDropdown.updateActiveSegmentIndex(
        Number(nameAsStringOrNumber)
      );
    },
  });
};

addSegmentIndexDropdown.updateActiveSegmentIndex = (segmentIndex: number) => {
  addSegmentIndexDropdown.segmentIndex = segmentIndex;
  const { segmentationId } = addSegmentIndexDropdown;
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, segmentIndex);
};

export default addSegmentIndexDropdown;
