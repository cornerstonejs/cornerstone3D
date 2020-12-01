// @ts-ignore
import IToolGroup from './ToolGroupManager/IToolGroup.ts';
//
// @ts-ignore
import addTool from './addTool.ts';
// @ts-ignore
import addEnabledElement from './addEnabledElement.ts';
// @ts-ignore
import removeEnabledElement from './removeEnabledElement.ts';
//
import ToolGroupManager from './ToolGroupManager/index';

interface cornerstoneTools3dState {
  isToolLocked: boolean;
  isMultiPartToolActive: boolean;
  tools: Record<string, any>;
  toolGroups: Array<IToolGroup>;
  //
  enabledElements: Array<any>;
}

const state: cornerstoneTools3dState = {
  isToolLocked: false,
  isMultiPartToolActive: false,
  tools: [],
  toolGroups: [],
  // Should this be named... canvases?
  enabledElements: [], // switch to Uids?
};

// TODO:
// - addTool
// - removeTool?
// - getToolGroupsForViewport?
// - getToolGroupsForScene?

export {
  // Store
  state,
  addTool,
  addEnabledElement,
  removeEnabledElement,
  // Managers
  ToolGroupManager,
};
