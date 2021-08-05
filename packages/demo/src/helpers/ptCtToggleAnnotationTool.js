import { ToolBindings } from '@ohif/cornerstone-tools'
import { ANNOTATION_TOOLS } from '../constants'

export default function ptCtToggleAnnotationTool(
  enableAnnotationTool,
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  annotationToolName
) {
  const options = {
    bindings: [ { mouseButton: ToolBindings.Mouse.Primary } ],
  }

  if (enableAnnotationTool) {
    // Set tool active

    const toolsToSetPassive = ANNOTATION_TOOLS.filter(
      (toolName) => toolName !== annotationToolName
    )

    ctSceneToolGroup.setToolActive(annotationToolName, options)
    ptSceneToolGroup.setToolActive(annotationToolName, options)
    fusionSceneToolGroup.setToolActive(annotationToolName, options)

    toolsToSetPassive.forEach((toolName) => {
      ctSceneToolGroup.setToolPassive(toolName)
      ptSceneToolGroup.setToolPassive(toolName)
      fusionSceneToolGroup.setToolPassive(toolName)
    })

    ctSceneToolGroup.setToolDisabled('WindowLevel')
    ptSceneToolGroup.setToolDisabled('PetThreshold')
    fusionSceneToolGroup.setToolDisabled('PetThreshold')
  } else {
    // Set window level + threshold
    ctSceneToolGroup.setToolActive('WindowLevel', options)
    ptSceneToolGroup.setToolActive('PetThreshold', options)
    fusionSceneToolGroup.setToolActive('PetThreshold', options)

    // Set all annotation tools passive
    ANNOTATION_TOOLS.forEach((toolName) => {
      ctSceneToolGroup.setToolPassive(toolName)
      ptSceneToolGroup.setToolPassive(toolName)
      fusionSceneToolGroup.setToolPassive(toolName)
    })
  }
}
