import csTools3d, {
  PanTool,
  WindowLevelTool,
  PetThresholdTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  ToolBindings,
  VolumeRotateTool,
} from './../src/cornerstone-tools-3d/index';
import { TOOL_GROUP_UIDS, ptVolumeUID, ctVolumeUID } from './constants';

function initToolGroups() {
  // TODO: Can we delete tool groups?
  // These need to be in lifecylce so we can undo on page death
  csTools3d.addTool(PanTool, {});
  csTools3d.addTool(WindowLevelTool, {});
  csTools3d.addTool(PetThresholdTool, {});
  csTools3d.addTool(StackScrollTool, {});
  csTools3d.addTool(ZoomTool, {});
  csTools3d.addTool(VolumeRotateTool, {});

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

  // Set up CT Scene tools
  ctSceneToolGroup.addTool('WindowLevel', {
    configuration: { volumeUID: ctVolumeUID },
  });
  ctSceneToolGroup.addTool('Pan', {});
  ctSceneToolGroup.addTool('Zoom', {});
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
  ptSceneToolGroup.addTool('Pan', {});
  ptSceneToolGroup.addTool('Zoom', {});
  ptSceneToolGroup.setToolActive('PetThreshold', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  ptSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  ptSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  // Set up Fusion Scene tools
  fusionSceneToolGroup.addTool('Pan', {});
  fusionSceneToolGroup.addTool('StackScroll', {});
  fusionSceneToolGroup.addTool('Zoom', {});
  // TODO -> Move to mouse wheel.
  fusionSceneToolGroup.setToolActive('StackScroll', {
    bindings: [ToolBindings.Mouse.Primary],
  });
  fusionSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  fusionSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  ptMipSceneToolGroup.addTool('VolumeRotate', {});
  // TODO -> Move to mouse wheel.
  ptMipSceneToolGroup.setToolActive('VolumeRotate', {
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

  return {
    ctSceneToolGroup,
    ptSceneToolGroup,
    fusionSceneToolGroup,
    ptMipSceneToolGroup,
    ctVRSceneToolGroup,
  };
}

function destroyToolGroups(toolGroupUIDs) {
  // TODO
}

export { initToolGroups, destroyToolGroups };
