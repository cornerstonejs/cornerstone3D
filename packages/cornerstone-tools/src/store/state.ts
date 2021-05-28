import IToolGroup from './ToolGroupManager/IToolGroup'
import Synchronizer from './SynchronizerManager/Synchronizer'
import svgNodeCache from './svgNodeCache'
import { BaseTool } from '../tools'

interface IToolClassReference {
  toolClass: new <T extends BaseTool>(config: any) => T
  toolOptions: Record<string, unknown>
}

interface ICornerstoneTools3dState {
  isToolLocked: boolean
  isMultiPartToolActive: boolean
  tools: Record<string, IToolClassReference>
  toolGroups: Array<IToolGroup>
  synchronizers: Array<Synchronizer>
  svgNodeCache: Record<string, unknown>
  enabledElements: Array<unknown>
  handleRadius: number
}

const state: ICornerstoneTools3dState = {
  isToolLocked: false,
  isMultiPartToolActive: false,
  tools: {},
  toolGroups: [],
  synchronizers: [],
  svgNodeCache: svgNodeCache,
  // Should this be named... canvases?
  enabledElements: [], // switch to Uids?
  handleRadius: 6,
}

export { ICornerstoneTools3dState, state, state as default }
