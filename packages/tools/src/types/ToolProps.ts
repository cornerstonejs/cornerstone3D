import { Calculator } from '../utilities/math/basic';

type SharedToolProp = {
  /** supported interactions for the tool */
  supportedInteractionTypes?: Array<string>;
  /** tool specific tool configuration */
  configuration?: ToolConfiguration;
};

export type ToolConfiguration = Record<string, any> & {
  statsCalculator?: Calculator;
};

export type ToolProps = SharedToolProp;

/**
 * Tool specific tool properties which includes the supported interaction types
 * and the configuration.
 */
export type PublicToolProps = SharedToolProp & {
  name?: string;
};
