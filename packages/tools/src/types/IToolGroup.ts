import type { Types } from '@cornerstonejs/core';
import { SetToolBindingsType, ToolOptionsType } from './ISetToolModeOptions';

/**
 * ToolGroup interface
 */
export default interface IToolGroup {
  /** Unserializable instantiated tool classes, keyed by name */
  _toolInstances: Record<string, any>;
  /** ToolGroup ID */
  id: string;
  /** Viewports Info inside the ToolGroup - including viewportId and renderingEngineId */
  viewportsInfo: Array<Types.IViewportId>;
  /** Options for each tool including bindings and mode */
  toolOptions: Record<string, any>;
  /** Get viewportIds in the toolGroup*/
  getViewportIds: () => string[];
  /** Get viewports info in the toolGroup*/
  getViewportsInfo: () => Array<Types.IViewportId>;
  /** Get the toolInstance of the toolName */
  getToolInstance: { (toolName: string): any };
  /** Add a tool to toolGroup with its configuration */
  addTool: { (toolName: string, toolConfiguration?: any): void };
  /** Add tool instance, if you want to create more than one instance from the same tool e.g., brush/eraser tool */
  addToolInstance: {
    (ttoolName: string, parentClassName: string, configuration?: any): void;
  };
  /** Add viewports to share the tools for the ToolGroup */
  addViewport: {
    (viewportId: string, renderingEngineId?: string): void;
  };
  /** Remove viewports from the ToolGroup */
  removeViewports: {
    (renderingEngineId: string, viewportId?: string): void;
  };
  /** Setting the tool to be Active by its name*/
  setToolActive: {
    (toolName: string, toolBindingsOption?: SetToolBindingsType): void;
  };
  /** Setting the tool to be Passive by its name*/
  setToolPassive: {
    (toolName: string): void;
  };
  /** Setting the tool to be Enabled by its name*/
  setToolEnabled: {
    (toolName: string): void;
  };
  /** Setting the tool to be Disabled by its name*/
  setToolDisabled: {
    (toolName: string): void;
  };
  /** Returns the Tool options including tool bindings and tool mode*/
  getToolOptions: {
    (toolName: string): ToolOptionsType;
  };
  getActivePrimaryMouseButtonTool: {
    (): undefined | string;
  };
  setViewportsCursorByToolName: {
    (toolName: string, strategyName?: string): void;
  };
  setToolConfiguration: {
    (
      toolName: string,
      configuration: Record<any, any>,
      overwrite?: boolean
    ): void;
  };
  getToolConfiguration: {
    (toolName: string, configurationPath: string): any;
  };
}
