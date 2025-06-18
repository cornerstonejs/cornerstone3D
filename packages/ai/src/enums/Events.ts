/**
 * Cornerstone AI events
 */
enum Events {
  /**
   * Triggers when the ONNX model loading starts.
   */
  MODEL_LOADING_STARTED = 'ONNX_MODEL_LOADING_STARTED',
  /**
   * Triggers when the ONNX model loading is completed.
   */
  MODEL_LOADING_COMPLETED = 'ONNX_MODEL_LOADING_COMPLETED',
  /**
   * Triggers when a component of the ONNX model is loaded.
   */
  MODEL_COMPONENT_LOADED = 'ONNX_MODEL_COMPONENT_LOADED',
}

export default Events;
