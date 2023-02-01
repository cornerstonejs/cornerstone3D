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
import {
  IToolBinding,
  IToolClassReference,
  IToolGroup,
  SetToolBindingsType,
  ToolOptionsType,
} from '../../types';

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
    return this.viewportsInfo.slice();
  }

  /**
   * Get the tool instance for a given tool name in the toolGroup
   * @param toolName - The name of the tool.
   * @returns A tool instance.
   */
  public getToolInstance(toolInstanceName: string) {
    const toolInstance = this._toolInstances[toolInstanceName];
    if (!toolInstance) {
      console.warn(
        `'${toolInstanceName}' is not registered with this toolGroup.`
      );
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
      console.warn(
        `'${toolName}' is not registered with the library. You need to use cornerstoneTools.addTool to register it.`
      );
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

  public addToolInstance(
    toolName: string,
    parentClassName: string,
    configuration = {}
  ): void {
    let ToolClassToUse = state.tools[toolName]
      ?.toolClass as IToolClassReference;

    if (!ToolClassToUse) {
      // get parent class constructor
      const ParentClass = state.tools[parentClassName]
        .toolClass as IToolClassReference;

      // Todo: could not find a way to make this work with typescript
      // @ts-ignore
      class ToolInstance extends ParentClass {}
      // @ts-ignore
      ToolInstance.toolName = toolName;
      // @ts-ignore
      ToolClassToUse = ToolInstance;

      state.tools[toolName] = {
        toolClass: ToolInstance as IToolClassReference,
      };
    }

    // add the tool to the toolGroup
    // @ts-ignore
    this.addTool(ToolClassToUse.toolName, configuration);
  }

  //   class InstanceTool extends parentClass;
  // InstanceTool.constructor.toolName = name;
  // addTool(InstanceTool,configuration)
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
  public addViewport(viewportId: string, renderingEngineId?: string): void {
    const renderingEngines = getRenderingEngines();

    if (!renderingEngineId && renderingEngines.length > 1) {
      throw new Error(
        'You must specify a renderingEngineId when there are multiple rendering engines.'
      );
    }

    const renderingEngineUIDToUse = renderingEngineId || renderingEngines[0].id;

    // Don't overwrite if it already exists
    if (
      !this.viewportsInfo.some(({ viewportId: vpId }) => vpId === viewportId)
    ) {
      this.viewportsInfo.push({
        viewportId,
        renderingEngineId: renderingEngineUIDToUse,
      });
    }

    // Handle the newly added viewport's mouse cursor
    const toolName = this.getActivePrimaryMouseButtonTool();

    const runtimeSettings = Settings.getRuntimeSettings();
    if (runtimeSettings.get('useCursors')) {
      this.setViewportsCursorByToolName(toolName);
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
  public removeViewports(renderingEngineId: string, viewportId?: string): void {
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
      // Note: Traverse the array backwards, such that when we remove items we
      // do not immediately mess up our loop indicies.
      for (let i = indices.length - 1; i >= 0; i--) {
        this.viewportsInfo.splice(indices[i], 1);
      }
    }
  }

  public setActiveStrategy(toolName: string, strategyName: string) {
    const toolInstance = this._toolInstances[toolName];

    if (toolInstance === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool configuration.`
      );

      return;
    }

    toolInstance.setActiveStrategy(strategyName);
  }

  setToolMode(
    toolName: string,
    mode: ToolModes,
    options = {} as SetToolBindingsType
  ): void {
    if (!toolName) {
      console.warn('setToolMode: toolName must be defined');
      return;
    }

    if (mode === ToolModes.Active) {
      this.setToolActive(toolName, options);
      return;
    }

    if (mode === ToolModes.Passive) {
      this.setToolPassive(toolName);
      return;
    }

    if (mode === ToolModes.Enabled) {
      this.setToolEnabled(toolName);
      return;
    }

    if (mode === ToolModes.Disabled) {
      this.setToolDisabled(toolName);
      return;
    }

    console.warn('setToolMode: mode must be defined');
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
  public setToolActive(
    toolName: string,
    toolBindingsOptions = {} as SetToolBindingsType
  ): void {
    const toolInstance = this._toolInstances[toolName];

    if (toolInstance === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    if (!toolInstance) {
      console.warn(
        `'${toolName}' instance ${toolInstance} is not registered with this toolGroup, can't set tool mode.`
      );
      return;
    }

    const prevBindings: IToolBinding[] = this.toolOptions[toolName]
      ? this.toolOptions[toolName].bindings
      : [];

    const newBindings = toolBindingsOptions.bindings
      ? toolBindingsOptions.bindings
      : [];

    // combine the new bindings with the previous bindings to avoid duplicates
    // it allows duplicated mouse buttons as long as they don't have same
    // modifier keys.
    const bindingsToUse = [...prevBindings, ...newBindings].reduce(
      (unique, binding) => {
        const TouchBinding = binding.numTouchPoints !== undefined;
        const MouseBinding = binding.mouseButton !== undefined;

        if (
          !unique.some((obj) => hasSameBinding(obj, binding)) &&
          (TouchBinding || MouseBinding)
        ) {
          unique.push(binding);
        }
        return unique;
      },
      []
    );

    // We should not override the bindings if they are already set
    const toolOptions: ToolOptionsType = {
      bindings: bindingsToUse,
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
      // reset to default cursor only if there is no other tool with primary binding
      const activeToolIdentifier = this.getActivePrimaryMouseButtonTool();
      if (!activeToolIdentifier && useCursor) {
        const cursor = MouseCursor.getDefinedCursor('default');
        this._setCursorForViewports(cursor);
      }
    }

    if (typeof toolInstance.onSetToolActive === 'function') {
      toolInstance.onSetToolActive();
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
  public setToolPassive(toolName: string): void {
    const toolInstance = this._toolInstances[toolName];

    if (toolInstance === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    // We should only remove the primary button bindings and keep
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

    // Remove the primary button bindings without modifiers, if they exist
    toolOptions.bindings = toolOptions.bindings.filter(
      (binding) =>
        binding.mouseButton !== MouseBindings.Primary || binding.modifierKey
    );

    // If there are other bindings, set the tool to be active
    let mode = Passive;
    if (toolOptions.bindings.length !== 0) {
      mode = Active;
      toolOptions.mode = mode;
    }

    this.toolOptions[toolName] = toolOptions;
    toolInstance.mode = mode;

    if (typeof toolInstance.onSetToolPassive === 'function') {
      toolInstance.onSetToolPassive();
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
  public setToolEnabled(toolName: string): void {
    const toolInstance = this._toolInstances[toolName];

    if (toolInstance === undefined) {
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
    toolInstance.mode = Enabled;

    if (typeof toolInstance.onSetToolEnabled === 'function') {
      toolInstance.onSetToolEnabled();
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
  public setToolDisabled(toolName: string): void {
    const toolInstance = this._toolInstances[toolName];

    if (toolInstance === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolGroup, can't set tool mode.`
      );

      return;
    }

    const toolOptions = {
      bindings: [],
      mode: Disabled,
    };

    this.toolOptions[toolName] = toolOptions;
    toolInstance.mode = Disabled;

    if (typeof toolInstance.onSetToolDisabled === 'function') {
      toolInstance.onSetToolDisabled();
    }
    this._renderViewports();
  }

  /**
   * Get the options for a given tool
   * @param toolName - The name of the tool.
   * @returns the tool options
   */
  public getToolOptions(toolName: string): ToolOptionsType {
    const toolOptionsForTool = this.toolOptions[toolName];

    if (toolOptionsForTool === undefined) {
      return;
    }

    return toolOptionsForTool;
  }

  /**
   * Find the name of the tool that is Active and has a primary button binding
   * (Mouse primary click)
   *
   * @returns The name of the tool
   */
  public getActivePrimaryMouseButtonTool(): string {
    return Object.keys(this.toolOptions).find((toolName) => {
      const toolOptions = this.toolOptions[toolName];
      return (
        toolOptions.mode === Active &&
        this._hasMousePrimaryButtonBinding(toolOptions)
      );
    });
  }

  public setViewportsCursorByToolName(
    toolName: string,
    strategyName?: string
  ): void {
    const cursor = this._getCursor(toolName, strategyName);

    this._setCursorForViewports(cursor);
  }

  private _getCursor(toolName: string, strategyName?: string): MouseCursor {
    let cursorName;
    let cursor;

    if (strategyName) {
      // Try combinations with strategyName first:
      // Try with toolName and toolInstanceName first.
      cursorName = `${toolName}.${strategyName}`;

      cursor = SVGMouseCursor.getDefinedCursor(cursorName, true);

      if (cursor) {
        return cursor;
      }
    }

    // Try with toolName and toolInstanceName first.
    cursorName = `${toolName}`;

    cursor = SVGMouseCursor.getDefinedCursor(cursorName, true);

    if (cursor) {
      return cursor;
    }

    // Try with just toolName.
    cursorName = toolName;

    cursor = SVGMouseCursor.getDefinedCursor(cursorName, true);

    if (cursor) {
      return cursor;
    }

    return MouseCursor.getDefinedCursor('default');
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
  public setToolConfiguration(
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

function hasSameBinding(
  binding1: IToolBinding,
  binding2: IToolBinding
): boolean {
  if (binding1.mouseButton !== binding2.mouseButton) {
    return false;
  }

  return binding1.modifierKey === binding2.modifierKey;
}
