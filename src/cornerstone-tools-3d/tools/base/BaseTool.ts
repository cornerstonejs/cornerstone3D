import deepMerge from './../../util/deepMerge.js';

/**
 * @class BaseTool
 * @classdesc Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy application.
 */
abstract class BaseTool {
  initialConfiguration: any;
  name: string;
  supportedInteractionTypes: Array<string>;
  strategies: Record<string, any>;
  defaultStrategy: string;
  activeStrategy: string;
  _configuration: any;

  constructor(toolConfiguration, defaultToolConfiguration) {
    this.initialConfiguration = deepMerge(
      toolConfiguration,
      defaultToolConfiguration
    );

    const {
      name,
      strategies,
      defaultStrategy,
      configuration,
      supportedInteractionTypes,
    } = this.initialConfiguration;

    this.name = name;
    this.supportedInteractionTypes = supportedInteractionTypes || [];
    this.strategies = strategies || {};
    this.defaultStrategy =
      defaultStrategy || Object.keys(this.strategies)[0] || undefined;
    this.activeStrategy = this.defaultStrategy;
    this._configuration = Object.assign({}, configuration);
  }

  get configuration(): any {
    return this._configuration;
  }

  set configuration(configuration: any) {
    this._configuration = configuration;
  }

  applyActiveStrategy(evt, operationData) {
    return this.strategies[this.activeStrategy].call(this, evt, operationData);
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
    this.activeStrategy = strategyName;
  }
}

export default BaseTool;
