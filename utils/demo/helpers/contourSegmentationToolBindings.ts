import { Enums } from '@cornerstonejs/tools';

const { MouseBindings, KeyboardBindings } = Enums;

/**
 * This is a shared version of the tool bindings used for segmentation contours,
 * until the final primary only binding can be completed.
 * TODO - delete this helper in favour of bindings on tools themselves.
 */
const contourSegmentationToolBindings = [
  {
    mouseButton: MouseBindings.Primary, // Left Click
  },
  {
    mouseButton: MouseBindings.Primary, // Left Click+Shift
    modifierKey: KeyboardBindings.Shift,
  },
];

export default contourSegmentationToolBindings;
