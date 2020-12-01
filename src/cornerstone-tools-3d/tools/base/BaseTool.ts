import deepmerge from './../../util/deepmerge.js';

class BaseTool {
  initialConfiguration: any;
  name: string;
  supportedInteractionTypes: Array<string>;
  strategies: Record<string, any>;
  defaultStrategy: string;
  activeStrategy: string;
  _configuration: any;

  constructor(toolConfiguration, defaultToolConfiguration) {
    this.initialConfiguration = deepmerge(
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

  //
  // CONFIGURATION
  //

  get configuration(): any {
    return this._configuration;
  }

  set configuration(configuration: any) {
    this._configuration = configuration;
  }

  applyActiveStrategy(evt, operationData) {
    return this.strategies[this.activeStrategy].call(this, evt, operationData);
  }

  setActiveStrategy(strategyName: string) {
    this.activeStrategy = strategyName;
  }
}

export default BaseTool;
