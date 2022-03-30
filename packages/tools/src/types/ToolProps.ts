type SharedToolProp = {
  /** supported interactions for the tool */
  supportedInteractionTypes?: Array<string>;
  /** tool specific tool configuration */
  configuration?: Record<string, any>;
};

export type ToolProps = SharedToolProp;

/**
 * Tool specific tool properties which includes the supported interaction types
 * and the configuration.
 */
export type PublicToolProps = SharedToolProp & {
  name?: string;
};
