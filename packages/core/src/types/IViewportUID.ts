/**
 * Interface to uniquely define a viewport in cornerstone. Note: viewportUIDs
 * can be shared between different rendering engines, but having a renderingEngineUID
 * and a viewportUID is required to uniquely define a viewport.
 */
export default interface IViewportUID {
  renderingEngineUID: string
  viewportUID: string
}
