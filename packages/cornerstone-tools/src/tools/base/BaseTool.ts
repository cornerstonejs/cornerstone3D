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
      configuration = {},
      supportedInteractionTypes,
    } = this.initialConfiguration

    // If strategies are not initialized in the tool config
    if (!configuration.strategies) {
      configuration.strategies = {}
      configuration.defaultStrategy = undefined
      configuration.activeStrategy = undefined
      configuration.strategyOptions = {}
    }

    this.name = name
    this.supportedInteractionTypes = supportedInteractionTypes || []
    this.configuration = Object.assign({}, configuration)
    this.mode = ToolModes.Disabled
  }

  /**
   *
   * @param evt
   * @param operationData
   */
  public applyActiveStrategy(evt: any, operationData: any): any {
    const { strategies, activeStrategy } = this.configuration
    return strategies[activeStrategy].call(this, evt, operationData)
  }

  /**
   * merges the new configuration with the tool configuration
   * @param configuration toolConfiguration
   */
  public setConfiguration(newConfiguration: Record<string, any>): void {
    this.configuration = deepMerge(this.configuration, newConfiguration)
  }

  /**
   * Sets the active strategy for a tool. Strategies are
   * multiple implementations of tool behavior that can be switched by tool
   * configuration.
   *
   * @param strategyName
   * @public
   */
  public setActiveStrategy(strategyName: string): void {
    this.setConfiguration({ activeStrategy: strategyName })
  }
}

export default BaseTool
