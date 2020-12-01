import IToolGroup from './ToolGroupManager/IToolGroup';
//
import addTool from './addTool';
import addEnabledElement from './addEnabledElement';
import removeEnabledElement from './removeEnabledElement';
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
