import type BaseTool from '../tools/base/BaseTool';

/**
 * General tool configuration.  This is intended to be extended
 * by various tools to add the different configuration options.
 */
export interface ToolConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategies: any;
  defaultStrategy?: string;
  activeStrategy?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategyOptions: any;

  /**
   * @returns true if the given targetId is preferred.
   */
  isPreferredTargetId?: (
    viewport,
    targetInfo: {
      targetId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cachedStat?: any;
    }
  ) => boolean;
}

export type IBaseTool = BaseTool;
