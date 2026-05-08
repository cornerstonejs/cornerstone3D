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
    /**
     * The target info is a specifier for different types of target information.
     * Right now there is just the single option consisting of an image id and
     * cached stat, but in the future other alternatives might be provided.
     */
    targetInfo: {
      /**
       * The imageId of a cachedStat instance.  This isn't the only way to
       * identify data, but is one possible option.
       */
      imageId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cachedStat: any;
    }
  ) => boolean;
}

export type IBaseTool = BaseTool;
