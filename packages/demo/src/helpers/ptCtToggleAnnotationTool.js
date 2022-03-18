import { Enums, WindowLevelTool } from '@precisionmetrics/cornerstone-tools'
import { ANNOTATION_TOOLS } from '../constants'

export default function ptCtToggleAnnotationTool(
  enableAnnotationTool,
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  annotationToolName
) {
  const options = {
    bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
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

    ctSceneToolGroup.setToolDisabled(WindowLevelTool.toolName)
    ptSceneToolGroup.setToolDisabled(WindowLevelTool.toolName)
    fusionSceneToolGroup.setToolDisabled(WindowLevelTool.toolName)
  } else {
    // Set window level + threshold
    ctSceneToolGroup.setToolActive(WindowLevelTool.toolName, options)
    ptSceneToolGroup.setToolActive(WindowLevelTool.toolName, options)
    fusionSceneToolGroup.setToolActive(WindowLevelTool.toolName, options)

    // Set all annotation tools passive
    ANNOTATION_TOOLS.forEach((toolName) => {
      ctSceneToolGroup.setToolPassive(toolName)
      ptSceneToolGroup.setToolPassive(toolName)
      fusionSceneToolGroup.setToolPassive(toolName)
    })
  }
}
