import { state } from './../index';
import IToolGroup from './IToolGroup';
import ISetToolModeOptions from './ISetToolModeOptions';

function createToolGroup(toolGroupId: string): IToolGroup | undefined {
  // Exit early if ID conflict
  const toolGroupWithIdExists = state.toolGroups.some(
    tg => tg.id === toolGroupId
  );

  if (toolGroupWithIdExists) {
    console.warn(`'${toolGroupId}' already exists.`);
    return;
  }

  // Create
  const toolGroup: IToolGroup = {
    _tools: {},
    id: toolGroupId,
    viewports: [],
    tools: {},
    //
    addTool: function(toolName, toolConfiguration = {}) {
      const toolDefinition = state.tools[toolName];
      const localToolInstance = this.tools[toolName];

      if (!toolDefinition) {
        console.warn(`'${toolName}' is not registered with the library.`);
        return;
      }

      if (localToolInstance) {
        console.warn(`'${toolName}' is already registered for this ToolGroup.`);
        return;
      }

      // Should these be renamed higher up, so we don't have to alias?
      // Wrap in try-catch so 3rd party tools don't explode?
      const {
        toolClass: ToolClass,
        toolOptions: defaultToolOptions,
      } = toolDefinition;
      const mergedToolConfiguration = Object.assign(
        {},
        defaultToolOptions,
        toolConfiguration
      );
      const instantiatedTool = new ToolClass(mergedToolConfiguration);

      // API instead of directly exposing schema?
      // Maybe not here, but feels like a "must" for any method outside of the ToolGroup itself
      this._tools[toolName] = instantiatedTool;
    },
    addViewports: function(
      renderingEngineUID: string,
      sceneUID?: string,
      viewportUID?: string
    ): void {
      this.viewports.push({ renderingEngineUID, sceneUID, viewportUID });
    },
    // ~ setToolMode
    setToolActive: function(
      toolName: string,
      toolModeOptions: ISetToolModeOptions
    ): void {
      // Would only need this for sanity check if not instantiating/hydrating
      // const tool = this.tools[toolName];
      const toolModeOptionsWithMode = Object.assign({}, toolModeOptions, {
        mode: 'active',
      });

      this.tools[toolName] = toolModeOptionsWithMode;
    },
  };

  // Update state
  state.toolGroups.push(toolGroup);

  // Return reference
  return toolGroup;
}

export default createToolGroup;
