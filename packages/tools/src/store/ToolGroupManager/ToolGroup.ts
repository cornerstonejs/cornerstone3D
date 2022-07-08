import { MouseBindings, ToolModes } from '../../enums';
import cloneDeep from 'lodash.clonedeep';
import get from 'lodash.get';
import {
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElementByIds,
  Settings,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { state } from '../index';
import { IToolGroup, SetToolBindingsType, ToolOptionsType } from '../../types';

import { MouseCursor, SVGMouseCursor } from '../../cursors';
import { initElementCursor } from '../../cursors/elementCursor';
import deepmerge from '../../utilities/deepMerge';

const { Active, Passive, Enabled, Disabled } = ToolModes;

/**
 * ToolGroup class which is a container for tools and their modes and states.
 * In Cornerstone3DTools, you need to create a tool group in order to use the
 * tools. ToolGroup is a way to share tool configuration, state (enabled, disabled, etc.)
 * across a set of viewports. Tools can set to be activated, enabled or disabled
 * in a toolGroup. You should not directly instantiate a ToolGroup. You need to use
 * ToolGroupManager helpers to create a new toolGroup or get a reference to an existing toolGroup.
 *
 * ```js
 * const toolGroup = csTools.ToolGroupManager.createToolGroup('toolGroupId')
 * ```
 */
export default class ToolGroup implements IToolGroup {
  id: string;
  viewportsInfo = [];
  toolOptions = {};
  _toolInstances = {};

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Get the viewport IDs of all the viewports in the current viewport
   * @returns An array of viewport IDs.
   */
  getViewportIds(): string[] {
    return this.viewportsInfo.map(({ viewportId }) => viewportId);
  }

  /**
   * Returns the toolGroup viewports info which is an array of {viewportId, renderingEngineId}
   */
  getViewportsInfo(): Array<Types.IViewportId> {
    return Object.assign({}, this.viewportsInfo);
  }

  /**
   * Get the tool instance for a given tool name in the toolGroup
   * @param toolName - The name of the tool.
   * @returns A tool instance.
   */
  getToolInstance(toolName: string) {
    const toolInstance = this._toolInstances[toolName];
    if (!toolInstance) {
      console.warn(`'${toolName}' is not registered with this toolGroup.`);
      return;
    }
    return toolInstance;
  }

  /**
   * Add a tool to the tool group with the given tool name and tool configuration.
   * Note that adding a tool to a tool group will not automatically set the tool
   * to be active. You must call setToolActive or setToolPassive and other methods
   * to set the tool to be active or passive or in other states.
   *
   * @param toolName - string
   * @param configuration - Tool configuration objects
   */
  addTool(toolName: string, configuration = {}): void {
    const toolDefinition = state.tools[toolName];
    const hasToolName = typeof toolName !== 'undefined' && toolName !== '';
    const localToolInstance = this.toolOptions[toolName];

    if (!hasToolName) {
      console.warn(
        'Tool with configuration did not produce a toolName: ',
        configuration
      );
      return;
    }

    if (!toolDefinition) {
      console.warn(`'${toolName}' is not registered with the library.`);
      return;
    }

    if (localToolInstance) {
      console.warn(
        `'${toolName}' is already registered for ToolGroup ${this.id}.`
      );
      return;
    }

    // Should these be renamed higher up, so we don't have to alias?
    // Wrap in try-catch so 3rd party tools don't explode?
    const { toolClass: ToolClass } = toolDefinition;

    const toolProps = {
      name: toolName,
      toolGroupId: this.id,
      configuration,
    };

    const instantiatedTool = new ToolClass(toolProps);

    // API instead of directly exposing schema?
    // Maybe not here, but feels like a "must" for any method outside of the ToolGroup itself
    this._toolInstances[toolName] = instantiatedTool;
  }

  /**
   * Add a viewport to the ToolGroup. It accepts viewportId and optional
   * renderingEngineId parameter. If renderingEngineId is not provided,
   * it checks if cornerstone-core has more than one renderingEngine; If so,
   * it will throw an error. If cornerstone-core has only one renderingEngine,
   * it will use that renderingEngine.
   *
   * @param viewportId - The unique identifier for the viewport.
   * @param renderingEngineId - The rendering engine to use.
   */
  addViewport(viewportId: string, renderingEngineId?: string): void {
    const renderingEngines = getRenderingEngines();

    if (!renderingEngineId && renderingEngines.length > 1) {
      throw new Error(
        'You must specify a renderingEngineId when there are multiple rendering engines.'
      );
    }

    const renderingEngineUIDToUse = renderingEngineId || renderingEngines[0].id;

    this.viewportsInfo.push({
      viewportId,
      renderingEngineId: renderingEngineUIDToUse,
    });

    // Handle the newly added viewport's mouse cursor
    const activeToolName = this.getActivePrimaryMouseButtonTool();

    const runtimeSettings = Settings.getRuntimeSettings();
    if (runtimeSettings.get('useCursors')) {
      this.setViewportsCursorByToolName(activeToolName);
    }
  }

  /**
   * Removes viewport from the toolGroup. If only renderingEngineId is defined
   * it removes all the viewports with the same renderingEngineId, if viewportId
   * is also provided, it will remove that specific viewport from the ToolGroup.
   *
   * @param renderingEngineId - renderingEngine id
   * @param viewportId - viewport id
   */
  removeViewports(renderingEngineId: string, viewportId?: string): void {
    const indices = [];

    this.viewportsInfo.forEach((vpInfo, index) => {
      let match = false;
      if (vpInfo.renderingEngineId === renderingEngineId) {
        match = true;

        if (viewportId && vpInfo.viewportId !== viewportId) {
          match = false;
        }
      }
      if (match) {
        indices.push(index);
      }
    });

    if (indices.length) {
      // going in reverse to not wrongly choose the indexes to be removed
      for (let i = indices.length - 1; i >= 0; i--) {
        this.viewportsInfo.splice(indices[i], 1);
      }
    }
  }

  /**
   * Set the tool mode on the toolGroup to be Active. This means the tool
   * can be actively used by the defined bindings (e.g., Mouse primary click)
   *
   * - Can be actively used by mouse/touch events mapped to its `ToolBinding`s.
   * - Can add data if an annotation tool.
   * - Can be passively interacted by grabbing a tool or its handles.
   * - Renders data if the tool has a `renderAnnotation` method.
   *
   * @param toolName - tool name
   * @param toolBindingsOptions - tool bindings
   */
  setToolActive(
    toolName: string,
    toolBindingsOptions = {} as SetToolBindingsType
  ): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    const prevBindings = this.toolOptions[toolName]
      ? this.toolOptions[toolName].bindings
      : [];

    const newBindings = toolBindingsOptions.bindings
      ? toolBindingsOptions.bindings
      : [];

    // We should not override the bindings if they are already set
    const toolOptions: ToolOptionsType = {
      bindings: [...prevBindings, ...newBindings],
      mode: Active,
    };

    this.toolOptions[toolName] = toolOptions;
    this._toolInstances[toolName].mode = Active;

    // reset the mouse cursor if tool has left click binding
    const runtimeSettings = Settings.getRuntimeSettings();
    const useCursor = runtimeSettings.get('useCursors');

    if (this._hasMousePrimaryButtonBinding(toolBindingsOptions) && useCursor) {
      this.setViewportsCursorByToolName(toolName);
    } else {
      // reset to default cursor
      const cursor = MouseCursor.getDefinedCursor('default');
      this._setCursorForViewports(cursor);
    }

    if (typeof this._toolInstances[toolName].onSetToolActive === 'function') {
      this._toolInstances[toolName].onSetToolActive();
    }
    this._renderViewports();
  }

  /**
   * Set the tool mode on the toolGroup to be Passive.
   *
   * - Can be passively interacted by grabbing a tool or its handles.
   * - Renders data if the tool has a `renderAnnotation` method.
   *
   * @param toolName - tool name
   */
  setToolPassive(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    // Wwe should only remove the primary button bindings and keep
    // the other ones (Zoom on right click)
    const prevToolOptions = this.getToolOptions(toolName);
    const toolOptions = Object.assign(
      {
        bindings: prevToolOptions ? prevToolOptions.bindings : [],
      },
      prevToolOptions,
      {
        mode: Passive,
      }
    );

    // Remove the primary button bindings if they exist
    toolOptions.bindings = toolOptions.bindings.filter(
      (binding) => binding.mouseButton !== MouseBindings.Primary
    );

    // If there are other bindings, set the tool to be active
    let mode = Passive;
    if (toolOptions.bindings.length !== 0) {
      mode = Active;
      toolOptions.mode = mode;
    }

    this.toolOptions[toolName] = toolOptions;
    this._toolInstances[toolName].mode = mode;

    if (typeof this._toolInstances[toolName].onSetToolPassive === 'function') {
      this._toolInstances[toolName].onSetToolPassive();
    }
    this._renderViewports();
  }

  /**
   * Set the tool mode on the toolGroup to be Enabled.
   *
   * - Renders data if the tool has a `renderAnnotation` method..
   *
   * @param toolName - tool name
   */
  setToolEnabled(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    const toolOptions = {
      bindings: [],
      mode: Enabled,
    };

    this.toolOptions[toolName] = toolOptions;
    this._toolInstances[toolName].mode = Enabled;

    if (typeof this._toolInstances[toolName].onSetToolEnabled === 'function') {
      this._toolInstances[toolName].onSetToolEnabled();
    }

    this._renderViewports();
  }

  /**
   * Set the tool mode on the toolGroup to be Disabled.
   *
   * - Annotation does not render.
   *
   * @param toolName - tool name
   */
  setToolDisabled(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );
      return;
    }

    // Would only need this for sanity check if not instantiating/hydrating
    // const tool = this.toolOptions[toolName];
    const toolOptions = {
      bindings: [],
      mode: Disabled,
    };

    this.toolOptions[toolName] = toolOptions;
    this._toolInstances[toolName].mode = Disabled;

    if (typeof this._toolInstances[toolName].onSetToolDisabled === 'function') {
      this._toolInstances[toolName].onSetToolDisabled();
    }
    this._renderViewports();
  }

  /**
   * Get the options for a given tool
   * @param toolName - The name of the tool.
   * @returns the tool options
   */
  getToolOptions(toolName: string): ToolOptionsType {
    return this.toolOptions[toolName];
  }

  /**
   * Find the name of the tool that is Active and has a primary button binding
   * (Mouse primary click)
   *
   * @returns The name of the tool
   */
  getActivePrimaryMouseButtonTool(): string {
    return Object.keys(this.toolOptions).find((toolName) => {
      const toolOptions = this.toolOptions[toolName];
      return (
        toolOptions.mode === Active &&
        this._hasMousePrimaryButtonBinding(toolOptions)
      );
    });
  }

  /**
   * Set the cursor of all viewports of the toolGroup to the cursor defined by the
   * provided toolName and its strategy (if any).
   * @param toolName - The name of the tool.
   * @param strategyName - The name of the strategy if exists. For segmentation tools
   * for example the strategy can be FILL_INSIDE or FILL_OUTSIDE
   */
  setViewportsCursorByToolName(toolName: string, strategyName?: string): void {
    const cursorName = strategyName ? `${toolName}.${strategyName}` : toolName;
    let cursor = SVGMouseCursor.getDefinedCursor(cursorName, true);

    if (!cursor) {
      cursor = MouseCursor.getDefinedCursor('default');
    }

    this._setCursorForViewports(cursor);
  }

  _setCursorForViewports(cursor: MouseCursor): void {
    this.viewportsInfo.forEach(({ renderingEngineId, viewportId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;
      initElementCursor(viewport.element, cursor);
    });
  }

  /**
   * Set a configuration of a tool by the given toolName.
   * Use overwrite as true in case you want to overwrite any existing configuration (be careful, depending on config change it might break the annotation flow).
   */
  setToolConfiguration(
    toolName: string,
    configuration: Record<any, any>,
    overwrite?: boolean
  ): boolean {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not present, can't set tool configuration.`
      );
      return false;
    }

    let _configuration;

    if (overwrite) {
      _configuration = configuration;
    } else {
      _configuration = deepmerge(
        this._toolInstances[toolName].configuration,
        configuration
      );
    }

    this._toolInstances[toolName].configuration = _configuration;

    this._renderViewports();

    return true;
  }

  /**
   * Get the configuration of tool. It returns only the config for the given path (in case exists).
   * ConfigurationPath is the the path of the property to get separated by '.'.
   *
   * @example
   * getToolConfiguration('LengthTool', 'firstLevel.secondLevel')
   * // get from LengthTool instance the configuration value as being LengthToolInstance[configuration][firstLevel][secondLevel]
   */
  getToolConfiguration(toolName: string, configurationPath: string): any {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not present, can't set tool configuration.`
      );
      return;
    }

    const _configuration = get(
      this._toolInstances[toolName].configuration,
      configurationPath
    );

    return cloneDeep(_configuration);
  }

  /**
   * Check if the tool binding is set to be primary mouse button.
   * @param toolOptions - The options for the tool mode.
   * @returns A boolean value.
   */
  private _hasMousePrimaryButtonBinding(toolOptions) {
    return toolOptions?.bindings?.some(
      (binding) =>
        binding.mouseButton === MouseBindings.Primary &&
        binding.modifierKey === undefined
    );
  }

  /**
   * It re-renders the viewports in the toolGroup
   */
  private _renderViewports(): void {
    this.viewportsInfo.forEach(({ renderingEngineId, viewportId }) => {
      getRenderingEngine(renderingEngineId).renderViewport(viewportId);
    });
  }
}
