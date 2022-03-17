import { isValidLabelmapConfig } from '../../tools/displayTools/Labelmap/LabelmapConfig'
import SegmentationRepresentation from '../../enums/SegmentationRepresentations'
import { RepresentationConfig } from '../../types/SegmentationStateTypes'

export default function isValidRepresentationConfig(
  representationType: string,
  config: RepresentationConfig
): boolean {
  switch (representationType) {
    case SegmentationRepresentation.Labelmap:
      return isValidLabelmapConfig(config)
    default:
      throw new Error(`Unknown representation type: ${representationType}`)
  }
}
