/**
 * Defines the names of the strategy callbacks used for performing enhanced
 * strategy operations.
 */
enum StrategyCallbacks {
  /**
   * startStrategy is called at the start of a strategy, typically on mouse down
   * Note this is separate from preview and the endings for preview, which could
   * be called alternatively, but this may be nested within a preview.
   */
  startStrategy = 'initDown',
  /**
   * finishStrategy is called at the end of a strategy being applied, usually on
   * mouse up.
   */
  finishStrategy = 'completeUp',
  /**
   * The preview can be used for tools to show what would happen on accepting
   * before the change is actually done.  For example, a spline tool might
   * show a preview state, and allow that to be accepted or rejected.
   */
  preview = 'preview',
  rejectPreview = 'rejectPreview',
  acceptPreview = 'acceptPreview',

  /**
   * Fills the given reygion
   */
  fill = 'fill',

  /**
   * The default strategy function, often synonymous with fill
   */
  strategyFunction = 'strategyFunction',

  /**
   * For threshold functions, this creates the thresold test.  Mostly an internal
   * detail, but might be useful to share between strategies.
   */
  createIsInThreshold = 'createIsInThreshold',

  /**
   *  Some strategy functions need to initialize some data before being runnable.
   * This is mostly an internal detail, just useful to have an enum here for this.
   */
  initialize = 'createInitialized',

  // Internal Details
  INTERNAL_setValue = 'setValue',
}

export default StrategyCallbacks;
