import IViewportUID from './../IViewportUID';
import ISetToolModeOptions from './ISetToolModeOptions';

export default interface IToolGroup {
  // Unserializable instantiated tool classes, keyed by name
  _tools: Record<string, any>;
  id: string;
  viewports: Array<IViewportUID>;
  tools: Record<string, any>;
  //
  addTool: { (toolName: string, toolConfiguration?: any): void };
  addViewports: {
    (renderingEngineUID: string, sceneUID?: string, viewportUID?: string): void;
  };
  // ~ setToolMode
  setToolActive: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void;
  };

  setToolPassive: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void;
  };
  setToolEnabled: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void;
  };
  setToolDisabled: {
    (toolName: string, toolModeOptions: ISetToolModeOptions): void;
  };
}
