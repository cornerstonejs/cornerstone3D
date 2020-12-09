import { ToolBindings } from './../../src/cornerstone-tools-3d/index';

export default function ptCtToggleAnnotationTool(
  enableAnnotationTool,
  ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup
) {
  const options = {
    bindings: [ToolBindings.Mouse.Primary],
  };

  if (enableAnnotationTool) {
    ctSceneToolGroup.setToolActive('Probe', options);
    ptSceneToolGroup.setToolActive('Probe', options);
    fusionSceneToolGroup.setToolActive('Probe', options);

    ctSceneToolGroup.setToolDisabled('WindowLevel');
    ptSceneToolGroup.setToolDisabled('PetThreshold');
    fusionSceneToolGroup.setToolDisabled('PetThreshold');
  } else {
    ctSceneToolGroup.setToolActive('WindowLevel', options);
    ptSceneToolGroup.setToolActive('PetThreshold', options);
    fusionSceneToolGroup.setToolActive('PetThreshold', options);

    ctSceneToolGroup.setToolPassive('Probe');
    ptSceneToolGroup.setToolPassive('Probe');
    fusionSceneToolGroup.setToolPassive('Probe');
  }
}
