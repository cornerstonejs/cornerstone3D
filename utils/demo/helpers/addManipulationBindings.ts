import * as cornerstoneTools from '@cornerstonejs/tools';

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
export default function addManipulationBindings(toolGroup, register = true) {
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
      {
        numTouchPoints: 1,
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
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Shift,
      },
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  // Need a binding to navigate without a wheel mouse
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift Left Click
        modifierKey: KeyboardBindings.Alt,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Alt,
      },
    ],
  });
  // Add a length tool binding to allow testing annotations on examples targetting
  // other use cases.  Use a primary button with shift+ctrl as that is relatively
  // unlikely to be otherwise used.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
    ],
  });
}
