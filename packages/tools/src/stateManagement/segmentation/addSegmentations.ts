import cloneDeep from 'lodash.clonedeep';
import { SegmentationPublicInput } from '../../types/SegmentationStateTypes';
import { validateSegmentationInput } from './helpers';
import { addSegmentation as addSegmentationToState } from './segmentationState';
/**
 * Adds the segmentation to the cornerstone3D segmentation state. It should be
 * noted that segmentations are not added to any toolGroup's viewports. In order to
 * do so, you should add a "representation" of the segmentation to the toolGroup
 * using addSegmentationRepresentations helper. The reason for this is that there
 * can be multiple representations of the same segmentation (e.g. Labelmap and
 * Contour, etc. - Currently only Labelmap representations is supported).
 * @param segmentationInputArray - The array of segmentation input, each of which
 * defining the segmentationId and the main representation data for the segmentation.
 */
function addSegmentations(
  segmentationInputArray: SegmentationPublicInput[]
): void {
  validateSegmentationInput(segmentationInputArray);

  segmentationInputArray.map((segInput) => {
    const segmentationInput = cloneDeep(segInput);

    addSegmentationToState(segmentationInput);
  });
}

export default addSegmentations;
