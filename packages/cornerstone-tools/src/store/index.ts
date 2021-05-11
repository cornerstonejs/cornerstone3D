import IToolGroup from './ToolGroupManager/IToolGroup'
//
import addTool from './addTool'
import resetToolsState from './resetToolsState'
import addEnabledElement from './addEnabledElement'
import removeEnabledElement from './removeEnabledElement'
//
import ToolGroupManager from './ToolGroupManager'
import SynchronizerManager from './SynchronizerManager'
import Synchronizer from './SynchronizerManager/Synchronizer'
//
import svgNodeCache from './svgNodeCache'

interface cornerstoneTools3dState {
  isToolLocked: boolean
  isMultiPartToolActive: boolean
  tools: Record<string, any>
  toolGroups: Array<IToolGroup>
  synchronizers: Array<Synchronizer>
  svgNodeCache: Record<string, any>
  //
  enabledElements: Array<any>
  handleRadius: number
}

const state: cornerstoneTools3dState = {
  isToolLocked: false,
  isMultiPartToolActive: false,
  tools: [],
  toolGroups: [],
  synchronizers: [],
  svgNodeCache: svgNodeCache,
  // Should this be named... canvases?
  enabledElements: [], // switch to Uids?
  handleRadius: 6,
}

// TODO:
// - addTool
// - removeTool?
// - getToolGroupsForViewport?
// - getToolGroupsForScene?

export {
  // Store
  state,
  addTool,
  resetToolsState,
  addEnabledElement,
  removeEnabledElement,
  svgNodeCache,
  // Managers
  ToolGroupManager,
  SynchronizerManager,
}
