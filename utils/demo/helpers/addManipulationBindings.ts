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

export type ToolBinding = {
  // A base tool to register.  Should only be defined once per tool
  tool?: any;
  // The tool name to base this on
  baseTool?: string;
  // The configuration to register with
  configuration?: Record<string, any>;
  // Sets to passive initially
  passive?: boolean;
  // Initial bindings
  bindings?: Types.IToolBinding[];
};

/**
 * Adds navigation bindings to the given tool group.  Registers the basic
 * tool with CS Tools if register is true.
 *
 * Adds:
 * * Pan on Right or Primary+Ctrl
 * * Zoom on Middle, Primary+Shift
 * * Stack Scroll on Mouse Wheel, Primary+Alt
 * * Length Tool on fourth button
 *
 * Also allows registering other tools by having them in the options.toolMap with configuration values.
 */
export default function addManipulationBindings(
  toolGroup,
  options: {
    enableShiftClickZoom?: boolean;
    is3DViewport?: boolean;
    toolMap?: Map<string, ToolBinding>;
  } = {}
) {
  const zoomBindings: Types.IToolBinding[] = [
    {
      mouseButton: MouseBindings.Secondary,
    },
  ];

  const {
    is3DViewport = false,
    enableShiftClickZoom = false,
    toolMap = new Map(),
  } = options;

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
    for (const [, config] of toolMap) {
      if (config.tool) {
        cornerstoneTools.addTool(config.tool);
      }
    }
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

  // Add extra tools from the toolMap
  for (const [toolName, config] of toolMap) {
    if (config.baseTool) {
      if (!toolGroup.hasTool(config.baseTool)) {
        toolGroup.addTool(
          config.baseTool,
          toolMap.get(config.baseTool)?.configuration
        );
      }
      toolGroup.addToolInstance(
        toolName,
        config.baseTool,
        config.configuration
      );
    } else if (!toolGroup.hasTool(toolName)) {
      toolGroup.addTool(toolName, config.configuration);
    }
    if (config.passive) {
      // This can be applied during add/remove contours
      toolGroup.setToolPassive(toolName);
    }
    if (config.bindings || config.selected) {
      toolGroup.setToolActive(
        toolName,
        (config.bindings && config) || {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        }
      );
    }
  }
}
