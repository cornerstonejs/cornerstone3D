import { ToolBindings, ToolModes } from '../../enums'
import { getRenderingEngine } from '@precisionmetrics/cornerstone-render'
import { state } from '../index'
import { ISetToolModeOptions, IToolGroup } from '../../types'

import { MouseCursor, SVGMouseCursor } from '../../cursors'
import { initElementCursor } from '../../cursors/elementCursor'

const { Active, Passive, Enabled, Disabled } = ToolModes

export default class ToolGroup implements IToolGroup {
  uid: string
  viewportsInfo = []
  toolOptions = {}
  _toolInstances = {}

  constructor(uid) {
    this.uid = uid
  }

  getViewportUIDs() {
    return this.viewportsInfo.map(({ viewportUID }) => viewportUID)
  }
  getToolInstance(toolName) {
    const toolInstance = this._toolInstances[toolName]
    if (!toolInstance) {
      console.warn(`'${toolName}' is not registered with this toolGroup.`)
      return
    }
    return toolInstance
  }
  addTool(toolName: string, configuration = {}): void {
    const toolDefinition = state.tools[toolName]
    const hasToolName = typeof toolName !== 'undefined' && toolName !== ''
    const localToolInstance = this.toolOptions[toolName]

    if (!hasToolName) {
      console.warn(
        'Tool with configuration did not produce a toolName: ',
        configuration
      )
      return
    }

    if (!toolDefinition) {
      console.warn(`'${toolName}' is not registered with the library.`)
      return
    }

    if (localToolInstance) {
      console.warn(
        `'${toolName}' is already registered for ToolGroup ${this.uid}.`
      )
      return
    }

    // Should these be renamed higher up, so we don't have to alias?
    // Wrap in try-catch so 3rd party tools don't explode?
    const { toolClass: ToolClass } = toolDefinition

    const toolProps = {
      name: toolName,
      toolGroupUID: this.uid,
      configuration,
    }

    const instantiatedTool = new ToolClass(toolProps)

    // API instead of directly exposing schema?
    // Maybe not here, but feels like a "must" for any method outside of the ToolGroup itself
    this._toolInstances[toolName] = instantiatedTool
  }
  addViewports(renderingEngineUID: string, viewportUID?: string): void {
    this.viewportsInfo.push({ renderingEngineUID, viewportUID })
  }
  /**
   * Removes viewport from the toolGroup. If only renderingEngineUID is defined
   * it removes all the viewports with the same renderingEngineUID, if more filters
   * are provided, it uses them to search the viewport.
   * @param renderingEngineUID renderingEngine uid
   * @param viewportUID viewport uid
   */
  removeViewports(renderingEngineUID: string, viewportUID?: string): void {
    const indices = []

    this.viewportsInfo.forEach((vp, index) => {
      let match = false
      if (vp.renderingEngineUID === renderingEngineUID) {
        match = true

        if (viewportUID && vp.viewportUID !== viewportUID) {
          match = false
        }
      }
      if (match) {
        indices.push(index)
      }
    })

    if (indices.length) {
      // going in reverse to not mess up the indexes to be removed
      for (let i = indices.length - 1; i >= 0; i--) {
        this.viewportsInfo.splice(indices[i], 1)
      }
    }
  }
  // ~ setToolMode
  setToolActive(toolName: string, toolModeOptions: ISetToolModeOptions): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolgroup, can't set tool mode.`
      )

      return
    }

    const prevBindings = this.toolOptions[toolName]
      ? this.toolOptions[toolName].bindings
      : []

    const newBindings = toolModeOptions ? toolModeOptions.bindings : []

    // We should not override the bindings if they are already set
    const toolModeOptionsWithMode = {
      bindings: [...prevBindings, ...newBindings],
      mode: Active,
    }

    this.toolOptions[toolName] = toolModeOptionsWithMode
    this._toolInstances[toolName].mode = Active

    // reset the mouse cursor if tool has left click binding
    if (this.isPrimaryButtonBinding(toolModeOptions)) {
      this.resetViewportsCursor(this._toolInstances[toolName])
    }

    if (typeof this._toolInstances[toolName].init === 'function') {
      this._toolInstances[toolName].init(this.viewportsInfo)
    }
    this.refreshViewports()
  }
  setToolPassive(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolgroup, can't set tool mode.`
      )

      return
    }

    // Wwe should only remove the primary button bindings and keep
    // the other ones (Zoom on right click)
    const toolModeOptions = this.getToolModeOptions(toolName)
    const toolOptions = Object.assign(
      {
        bindings: toolModeOptions ? toolModeOptions.bindings : [],
      },
      toolModeOptions,
      {
        mode: Passive,
      }
    )

    // Remove the primary button bindings if they exist
    toolOptions.bindings = toolOptions.bindings.filter(
      (binding) => binding.mouseButton !== ToolBindings.Mouse.Primary
    )

    // If there are other bindings, set the tool to be active
    let mode = Passive
    if (toolOptions.bindings.length !== 0) {
      mode = Active
      toolOptions.mode = mode
    }

    this.toolOptions[toolName] = toolOptions
    this._toolInstances[toolName].mode = mode
    this.refreshViewports()
  }
  setToolEnabled(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolgroup, can't set tool mode.`
      )

      return
    }

    const toolModeOptionsWithMode = {
      bindings: [],
      mode: Enabled,
    }

    this.toolOptions[toolName] = toolModeOptionsWithMode
    this._toolInstances[toolName].mode = Enabled

    if (this._toolInstances[toolName].enableCallback) {
      this._toolInstances[toolName].enableCallback(this.uid)
    }

    this.refreshViewports()
  }
  setToolDisabled(toolName: string): void {
    if (this._toolInstances[toolName] === undefined) {
      console.warn(
        `Tool ${toolName} not added to toolgroup, can't set tool mode.`
      )
      return
    }

    // Would only need this for sanity check if not instantiating/hydrating
    // const tool = this.toolOptions[toolName];
    const toolModeOptionsWithMode = {
      bindings: [],
      mode: Disabled,
    }

    this.toolOptions[toolName] = toolModeOptionsWithMode
    this._toolInstances[toolName].mode = Disabled

    if (this._toolInstances[toolName].disableCallback) {
      this._toolInstances[toolName].disableCallback(this.uid)
    }
    this.refreshViewports()
  }
  // Todo:
  // setToolConfiguration(){},
  getToolModeOptions(toolName: string) {
    return this.toolOptions[toolName]
  }
  getActivePrimaryButtonTools() {
    return Object.keys(this.toolOptions).find((toolName) => {
      const toolModeOptions = this.toolOptions[toolName]
      return (
        toolModeOptions.mode === Active &&
        this.isPrimaryButtonBinding(toolModeOptions)
      )
    })
  }
  isPrimaryButtonBinding(toolModeOptions) {
    return toolModeOptions?.bindings?.some(
      (binding) =>
        binding.mouseButton === ToolBindings.Mouse.Primary &&
        binding.modifierKey === undefined
    )
  }
  refreshViewports(): void {
    this.viewportsInfo.forEach(({ renderingEngineUID, viewportUID }) => {
      getRenderingEngine(renderingEngineUID).renderViewport(viewportUID)
    })
  }
  resetViewportsCursor(tool: { name: string }, strategyName = undefined): void {
    const toolName = strategyName ? `${tool.name}.${strategyName}` : tool.name
    let cursor = SVGMouseCursor.getDefinedCursor(toolName, true)
    if (!cursor) {
      cursor = MouseCursor.getDefinedCursor('default')
    }
    this.viewportsInfo.forEach(({ renderingEngineUID, viewportUID }) => {
      const viewport =
        getRenderingEngine(renderingEngineUID).getViewport(viewportUID)
      if (viewport && viewport.element) {
        initElementCursor(viewport.element, cursor)
      }
    })
  }
}
