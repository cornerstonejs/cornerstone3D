import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/LabelmapConfig'
import SegmentationRepresentation from '../../enums/SegmentationRepresentations'

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
