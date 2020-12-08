import csTools3d, {
  PanTool,
  WindowLevelTool,
  PetThresholdTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  ToolBindings,
  VolumeRotateMouseWheelTool,
  ProbeTool,
} from './../src/cornerstone-tools-3d/index';
import { TOOL_GROUP_UIDS, ptVolumeUID, ctVolumeUID } from './constants';

// TODO -> Make this a toggle.
const ANNOTATION_ON = true;

function initToolGroups() {
  // TODO: Can we delete tool groups?
  // These need to be in lifecylce so we can undo on page death
  csTools3d.addTool(PanTool, {});
  csTools3d.addTool(WindowLevelTool, {});
  csTools3d.addTool(PetThresholdTool, {});
  csTools3d.addTool(StackScrollMouseWheelTool, {});
  csTools3d.addTool(ZoomTool, {});
  csTools3d.addTool(VolumeRotateMouseWheelTool, {});
  csTools3d.addTool(ProbeTool, {});

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
  ctSceneToolGroup.addTool('StackScrollMouseWheel', {});
  ctSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ctVolumeUID },
  });
  if (ANNOTATION_ON) {
    ctSceneToolGroup.setToolActive('Probe', {
      bindings: [ToolBindings.Mouse.Primary],
    });
  } else {
    ctSceneToolGroup.setToolActive('WindowLevel', {
      bindings: [ToolBindings.Mouse.Primary],
    });
    ctSceneToolGroup.setToolPassive('Probe');
  }

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

  // TEMP TODO: Add toggle for WL/threshold to probe tool.
  ptSceneToolGroup.addTool('PetThreshold', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Probe', {
    configuration: { volumeUID: ptVolumeUID },
  });
  ptSceneToolGroup.addTool('Pan', {});
  ptSceneToolGroup.addTool('Zoom', {});
  ptSceneToolGroup.addTool('StackScrollMouseWheel', {});

  if (ANNOTATION_ON) {
    ptSceneToolGroup.setToolActive('Probe', {
      bindings: [ToolBindings.Mouse.Primary],
    });
  } else {
    ptSceneToolGroup.setToolActive('PetThreshold', {
      bindings: [ToolBindings.Mouse.Primary],
    });
    ptSceneToolGroup.setToolPassive('Probe');
  }

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

  if (ANNOTATION_ON) {
    fusionSceneToolGroup.setToolActive('Probe', {
      bindings: [ToolBindings.Mouse.Primary],
    });
  } else {
    fusionSceneToolGroup.setToolPassive('Probe');
  }

  fusionSceneToolGroup.setToolActive('StackScrollMouseWheel');
  fusionSceneToolGroup.setToolActive('Pan', {
    bindings: [ToolBindings.Mouse.Auxiliary],
  });
  fusionSceneToolGroup.setToolActive('Zoom', {
    bindings: [ToolBindings.Mouse.Secondary],
  });

  ptMipSceneToolGroup.addTool('VolumeRotateMouseWheel', {});
  ptMipSceneToolGroup.setToolActive('VolumeRotateMouseWheel');

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
