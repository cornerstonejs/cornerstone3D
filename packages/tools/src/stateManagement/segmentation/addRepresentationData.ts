import { LabelmapSegmentationData } from '../../types/LabelmapTypes';
import { ContourSegmentationData } from '../../types/ContourTypes';
import { SurfaceSegmentationData } from '../../types/SurfaceTypes';
import { getSegmentation } from './segmentationState';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';

type SegmentationData =
  | LabelmapSegmentationData
  | ContourSegmentationData
  | SurfaceSegmentationData;

type AddRepresentationData = {
  segmentationId: string;
  type: SegmentationRepresentations;
  data: SegmentationData;
};

/**
 * This will add representation data to the segmentation, for rendering.
 * Each segmentation can have multiple representation data, for example
 * labelmap, contour and surface representation data. For each representation
 * the relevant data should be provided, for instance for the labelmap
 * representation the volumeId should be provided, for contour the contour data
 * which includes geometryIds of the contour sets, and for surface the surface
 * data which includes geometryId of the points and cells.
 *
 * Note: if the representation data already exists for the segmentation, it will
 * be overwritten.
 *
 * @param segmentationId - id of the segmentation
 * @param representationData - representation data to add, it can be either
 * labelmap, contour or surface representation data.
 */
function addRepresentationData({
  segmentationId,
  type,
  data,
}: AddRepresentationData) {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation.representationData[type]) {
    console.warn(
      `Representation data of type ${type} already exists for segmentation ${segmentationId}, overwriting it.`
    );

    // update the representation data class
  }

  switch (type) {
    case SegmentationRepresentations.Labelmap:
      if (data) {
        segmentation.representationData[type] =
          data as LabelmapSegmentationData;
      }
      break;
    case SegmentationRepresentations.Contour:
      if (data) {
        segmentation.representationData[type] = data as ContourSegmentationData;
      }
      break;
    case SegmentationRepresentations.Surface:
      if (data) {
        segmentation.representationData[type] = data as SurfaceSegmentationData;
      }
      break;
    default:
      throw new Error(`Invalid representation type ${type}`);
  }
}

export default addRepresentationData;
