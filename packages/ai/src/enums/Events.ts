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
}

export default Events;
