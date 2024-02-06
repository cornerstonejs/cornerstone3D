import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/tools';

const {
  LengthTool,
  StackScrollMouseWheelTool,
  StackScrollTool,
  PanTool,
  ZoomTool,

  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;

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
  register = true,
  options?
) {
  const zoomBindings: Types.IToolBinding[] = [
    {
      mouseButton: MouseBindings.Secondary,
    },
  ];

  if (options?.enableShiftClickZoom === true) {
    zoomBindings.push({
      mouseButton: MouseBindings.Primary, // Shift Left Click
      modifierKey: KeyboardBindings.Shift,
    });
  }

  if (register) {
    cornerstoneTools.addTool(LengthTool);
    cornerstoneTools.addTool(StackScrollMouseWheelTool);
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    cornerstoneTools.addTool(StackScrollTool);
  }

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);

  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
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
    bindings: zoomBindings,
  });
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Fifth_Button,
      },
    ],
  });
}
