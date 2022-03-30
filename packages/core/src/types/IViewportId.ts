/**
 * Interface to uniquely define a viewport in cornerstone. Note: viewportIds
 * can be shared between different rendering engines, but having a renderingEngineId
 * and a viewportId is required to uniquely define a viewport.
 */
export default interface IViewportId {
  renderingEngineId: string;
  viewportId: string;
}
