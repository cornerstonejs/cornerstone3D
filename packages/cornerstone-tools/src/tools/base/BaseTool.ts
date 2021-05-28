import deepMerge from '../../util/deepMerge'
import { ToolModes } from '../../enums'

/**
 * Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy
 * application.
 */
abstract class BaseTool {
  public initialConfiguration: Record<string, any>
  public name: string
  public supportedInteractionTypes: Array<string>
  public strategies: Record<string, any>
  public defaultStrategy: string
  public activeStrategy: string
  public configuration: Record<string, any>
  public mode: ToolModes

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration: Record<string, any>
  ) {
    this.initialConfiguration = deepMerge(
      defaultToolConfiguration,
      toolConfiguration
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
    this.mode = ToolModes.Disabled
  }

  /**
   *
   * @param evt
   * @param operationData
   */
  public applyActiveStrategy(evt: any, operationData: any): any {
    return this.strategies[this.activeStrategy].call(this, evt, operationData)
  }

  /**
   * Sets the active strategy for a tool if using strategies. Strategies are
   * multiple implementations of tool behavior that can be switched by tool
   * configuration.
   *
   * @param strategyName
   * @public
   */
  public setActiveStrategyName(strategyName): void {
    this.activeStrategy = strategyName
  }
}

export default BaseTool
