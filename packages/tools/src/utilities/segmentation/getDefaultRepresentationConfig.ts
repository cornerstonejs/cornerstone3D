import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/LabelmapConfig'
import SegmentationRepresentation from '../../enums/SegmentationRepresentations'

/**
 * It returns a configuration object for the given representation type.
 * @param representationType - The type of segmentation representation
 * @returns A representation configuration object.
 */
export default function getDefaultRepresentationConfig(
  representationType: string
) {
  switch (representationType) {
    case SegmentationRepresentation.Labelmap:
      return getDefaultLabelmapConfig()
    default:
      throw new Error(`Unknown representation type: ${representationType}`)
  }
}
