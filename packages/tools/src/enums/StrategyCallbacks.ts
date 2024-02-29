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
  OnInteractionStart = 'onInteractionStart',
  /**
   * finishStrategy is called at the end of a strategy being applied, usually on
   * mouse up.
   */
  OnInteractionEnd = 'onInteractionEnd',
  /**
   * The preview can be used for tools to show what would happen on accepting
   * before the change is actually done.  For example, a spline tool might
   * show a preview state, and allow that to be accepted or rejected.
   */
  Preview = 'preview',
  RejectPreview = 'rejectPreview',
  AcceptPreview = 'acceptPreview',

  /**
   * Fills the given reygion
   */
  Fill = 'fill',

  /**
   * The default strategy function, often synonymous with fill
   */
  StrategyFunction = 'strategyFunction',

  /**
   * For threshold functions, this creates the thresold test.  Mostly an internal
   * detail, but might be useful to share between strategies.
   */
  CreateIsInThreshold = 'createIsInThreshold',

  /**
   *  Some strategy functions need to initialize some data before being runnable.
   * This is mostly an internal detail, just useful to have an enum here for this.
   */
  Initialize = 'initialize',

  // Internal Details
  INTERNAL_setValue = 'setValue',

  /** inner circle size  */
  ComputeInnerCircleRadius = 'computeInnerCircleRadius',
}

export default StrategyCallbacks;
