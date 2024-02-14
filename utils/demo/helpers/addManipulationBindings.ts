import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/tools';

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
    enableShiftClickZoom?: boolean;
    is3DViewport?: boolean;
  } = {}
) {
  const zoomBindings: Types.IToolBinding[] = [
    {
      mouseButton: MouseBindings.Secondary,
    },
  ];

  const { is3DViewport = false, enableShiftClickZoom = false } = options;

  if (enableShiftClickZoom === true) {
    zoomBindings.push({
      mouseButton: MouseBindings.Primary, // Shift Left Click
      modifierKey: KeyboardBindings.Shift,
    });
  }

  if (!registered) {
    cornerstoneTools.addTool(StackScrollMouseWheelTool);
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    cornerstoneTools.addTool(TrackballRotateTool);
    cornerstoneTools.addTool(LengthTool);
    cornerstoneTools.addTool(StackScrollTool);
  }

  registered = true;

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  if (is3DViewport) {
    toolGroup.addTool(TrackballRotateTool.toolName);
  } else {
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  }
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: zoomBindings,
  });
  // Need a binding to navigate without a wheel mouse
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
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
  }
}
