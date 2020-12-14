import csTools3d, {
  PanTool,
  WindowLevelTool,
  PetThresholdTool,
  StackScrollTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  ToolBindings,
  VolumeRotateMouseWheelTool,
  ProbeTool,
  RectangleRoiTool,
  EllipticalRoiTool,
} from './../src/cornerstone-tools-3d/index';
import { TOOL_GROUP_UIDS, ptVolumeUID, ctVolumeUID } from './constants';

function initToolGroups() {
  // TODO: Can we delete tool groups?
  // These need to be in lifecylce so we can undo on page death
  csTools3d.addTool(PanTool, {});
  csTools3d.addTool(WindowLevelTool, {});
  csTools3d.addTool(PetThresholdTool, {});
  csTools3d.addTool(StackScrollMouseWheelTool, {});
  csTools3d.addTool(StackScrollTool, {});
  csTools3d.addTool(ZoomTool, {});
  csTools3d.addTool(VolumeRotateMouseWheelTool, {});
  csTools3d.addTool(ProbeTool, {});
  csTools3d.addTool(RectangleRoiTool, {});
  csTools3d.addTool(EllipticalRoiTool, {});

  const ctSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.CT);
  const ptSceneToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UIDS.PT);
  const fusionSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.FUSION
  );
  const ptMipSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.PTMIP
  );
  const ctVRSceneToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.CTVR
  );
  const ctObliqueToolGroup = ToolGroupManager.createToolGroup(
    TOOL_GROUP_UIDS.OBLIQUE
  );

  // Set up CT Scene tools

  ctSceneToolGroup.addTool('WindowLevel', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Pan', {});
  ctSceneToolGroup.addTool('Zoom', {});
  ctSceneToolGroup.addTool('StackScrollMouseWheel', {});
  ctSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ctSceneToolGroup.setToolPassive('Probe');
  ctSceneToolGroup.setToolPassive('RectangleRoi');
  ctSceneToolGroup.setToolPassive('EllipticalRoi');
  ctSceneToolGroup.setToolActive('StackScrollMouseWheel');
  ctSceneToolGroup.setToolActive('WindowLevel', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ctSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ctSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up PT Scene tools

  ptSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  });

  ptSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Pan', {});
  ptSceneToolGroup.addTool('Zoom', {});
  ptSceneToolGroup.addTool('StackScrollMouseWheel', {});
  ptSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ptSceneToolGroup.setToolPassive('Probe');
  ptSceneToolGroup.setToolPassive('RectangleRoi');
  ptSceneToolGroup.setToolPassive('EllipticalRoi');
  ptSceneToolGroup.setToolActive('StackScrollMouseWheel');
  ptSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ptSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up Fusion Scene tools
  fusionSceneToolGroup.addTool('Pan', {});
  fusionSceneToolGroup.addTool('StackScrollMouseWheel', {});
  fusionSceneToolGroup.addTool('Zoom', {});
  fusionSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('RectangleRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.addTool('EllipticalRoi', {
    configuration: { volumeUID: ptVolumeUID },
  });

  fusionSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  fusionSceneToolGroup.setToolPassive('Probe');
  fusionSceneToolGroup.setToolPassive('RectangleRoi');
  fusionSceneToolGroup.setToolPassive('EllipticalRoi');
  fusionSceneToolGroup.setToolActive('StackScrollMouseWheel');
  fusionSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  fusionSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  fusionSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  ptMipSceneToolGroup.addTool('VolumeRotateMouseWheel', {});
  ptMipSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptMipSceneToolGroup.setToolActive('VolumeRotateMouseWheel');
  ptMipSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });

  // Set up CTVR Scene tools
  ctVRSceneToolGroup.addTool('Pan', {});
  ctVRSceneToolGroup.addTool('Zoom', {});
  ctVRSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ctVRSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up CTOBLIQUE Scene tools
  ctObliqueToolGroup.addTool('VolumeRotateMouseWheel', {});
  ctObliqueToolGroup.addTool('StackScroll', {});
  ctObliqueToolGroup.setToolActive('VolumeRotateMouseWheel');
  ctObliqueToolGroup.setToolActive('StackScroll', {
    bindings: [ToolBindings.Mouse.Primary],
  });

  return {
    ctSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
    ctVRSceneToolGroup,
    ctObliqueToolGroup,
  };
}

function destroyToolGroups(toolGroupUIDs) {
  // TODO
}

export { initToolGroups, destroyToolGroups };
