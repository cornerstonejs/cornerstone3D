import { Types } from '@cornerstonejs/core'
import { SetToolBindingsType, ToolOptionsType } from './ISetToolModeOptions'

/**
 * ToolGroup interface
 */
export default interface IToolGroup {
  /** Unserializable instantiated tool classes, keyed by name */
  _toolInstances: Record<string, any>
  /** ToolGroup UID */
  uid: string
  /** Viewports Info inside the ToolGroup - including viewportUID and renderingEngineUID */
  viewportsInfo: Array<Types.IViewportUID>
  /** Options for each tool including bindings and mode */
  toolOptions: Record<string, any>
  /** Get viewportUIDs in the toolGroup*/
  getViewportUIDs: () => string[]
  /** Get the toolInstance of the toolName */
  getToolInstance: { (toolName: string): any }
  /** Add a tool to toolGroup with its configuration */
  addTool: { (toolName: string, toolConfiguration?: any): void }
  /** Add viewports to share the tools for the ToolGroup */
  addViewport: {
    (viewportUID: string, renderingEngineUID?: string): void
  }
  /** Remove viewports from the ToolGroup */
  removeViewports: {
    (renderingEngineUID: string, viewportUID?: string): void
  }
  /** Setting the tool to be Active by its name*/
  setToolActive: {
    (toolName: string, toolBindingsOption?: SetToolBindingsType): void
  }
  /** Setting the tool to be Passive by its name*/
  setToolPassive: {
    (toolName: string): void
  }
  /** Setting the tool to be Enabled by its name*/
  setToolEnabled: {
    (toolName: string): void
  }
  /** Setting the tool to be Disabled by its name*/
  setToolDisabled: {
    (toolName: string): void
  }
  /** Returns the Tool options including tool bindings and tool mode*/
  getToolOptions: {
    (toolName: string): ToolOptionsType
  }
  getActivePrimaryMouseButtonTool: {
    (): undefined | string
  }
  setViewportsCursorByToolName: {
    (toolName: string, strategyName?: string): void
  }
}
