import { Types } from '@ohif/cornerstone-render'

import ISetToolModeOptions from '../../types/ISetToolModeOptions'

export default interface IToolGroup {
  // Unserializable instantiated tool classes, keyed by name
  _tools: Record<string, any>
  id: string
  viewports: Array<Types.IViewportUID>
  tools: Record<string, any>
  //
  getToolInstance: { (toolName: string): any }
  addTool: { (toolName: string, toolConfiguration?: any): void }
  addViewports: {
    (renderingEngineUID: string, sceneUID?: string, viewportUID?: string): void
  }
  removeViewports: {
    (renderingEngineUID: string, sceneUID?: string, viewportUID?: string): void
  }
  // ~ setToolMode
  setToolActive: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void
  }

  setToolPassive: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void
  }
  setToolEnabled: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void
  }
  setToolDisabled: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void
  }
  isPrimaryButtonBinding: {
    (toolModeOptions: ISetToolModeOptions): boolean
  }
  refreshViewports: {
    (): void
  }
  resetViewportsCursor: {
    ({ name: string }): void
  }
}
