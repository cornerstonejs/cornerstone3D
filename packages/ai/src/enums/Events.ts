/**
 * Cornerstone AI events
 */
enum Events {
  /**
   * Triggers when the AI model loading starts.
   */
  MODEL_LOADING_STARTED = 'AI_MODEL_LOADING_STARTED',
  /**
   * Triggers when the AI model loading is completed.
   */
  MODEL_LOADING_COMPLETED = 'AI_MODEL_LOADING_COMPLETED',
  /**
   * Triggers when a component of the AI model is loaded.
   */
  MODEL_COMPONENT_LOADED = 'AI_MODEL_COMPONENT_LOADED',
  /**
   * Triggers when the AI model loading fails, for example when the model
   * files cannot be downloaded or instantiated. The event detail contains
   * the `error` that caused the failure.
   */
  MODEL_LOADING_ERROR = 'AI_MODEL_LOADING_ERROR',
}

export default Events;
