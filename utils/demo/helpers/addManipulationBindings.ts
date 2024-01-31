import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  LengthTool,
  StackScrollMouseWheelTool,
  StackScrollTool,
  PanTool,
  ZoomTool,
  TrackballRotateTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;

let registered = false;

/**
 * Adds navigation bindings to the given tool group.  Registers the basic
 * tool with CS Tools if register is true.
 *
 * Adds:
 * * Pan on Right or Primary+Ctrl
 * * Zoom on Middle, Primary+Shift
 * * Stack Scroll on Mouse Wheel, Primary+Alt
 * * Length Tool on fourth button
 */
export default function addManipulationBindings(
  toolGroup,
  options: {
    is3DViewport?: boolean;
  } = {}
) {
  const { is3DViewport = false } = options;

  if (!registered) {
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    cornerstoneTools.addTool(TrackballRotateTool);
    cornerstoneTools.addTool(LengthTool);
    cornerstoneTools.addTool(StackScrollTool);
    cornerstoneTools.addTool(StackScrollMouseWheelTool);
  }

  registered = true;

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  if (is3DViewport) {
    toolGroup.addTool(TrackballRotateTool.toolName);
  } else {
    toolGroup.addTool(LengthTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  }

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        mouseButton: MouseBindings.Primary, // Ctrl Left drag
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift Left Click
        modifierKey: KeyboardBindings.Shift,
      },
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  if (is3DViewport) {
    toolGroup.setToolActive(TrackballRotateTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
  } else {
    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolActive(StackScrollTool.toolName);
    toolGroup.setToolActive(LengthTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Fifth_Button,
        },
      ],
    });
  }
}
