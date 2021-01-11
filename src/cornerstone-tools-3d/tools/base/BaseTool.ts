import deepMerge from './../../util/deepMerge'

/**
 * @class BaseTool
 * @classdesc Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy application.
 */
abstract class BaseTool {
  initialConfiguration: Record<string, any>
  name: string
  supportedInteractionTypes: Array<string>
  strategies: Record<string, any>
  defaultStrategy: string
  activeStrategy: string
  configuration: Record<string, any>

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration: Record<string, any>
  ) {
    this.initialConfiguration = deepMerge(
      toolConfiguration,
      defaultToolConfiguration
    )

    const {
      name,
      strategies,
      defaultStrategy,
      configuration = {},
      supportedInteractionTypes,
    } = this.initialConfiguration

    this.name = name
    this.supportedInteractionTypes = supportedInteractionTypes || []
    this.strategies = strategies || {}
    this.defaultStrategy =
      defaultStrategy || Object.keys(this.strategies)[0] || undefined
    this.activeStrategy = this.defaultStrategy
    this.configuration = Object.assign({}, configuration)

    console.log(this.name, this.configuration)
  }

  applyActiveStrategy(evt, operationData) {
    return this.strategies[this.activeStrategy].call(this, evt, operationData)
  }

  /**
   * @protected @method setActiveStrategy Sets the active strategy for a tool if
   * using strategies. Strategies are multiple implementations of tool behavior
   * that can be switched by tool configuration.
   *
   * @param {string} strategyName
   * @memberof BaseTool
   */
  protected setActiveStrategy(strategyName: string) {
    this.activeStrategy = strategyName
  }
}

export default BaseTool
