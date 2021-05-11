/**
 * @interface IViewportUID An interface contract defining a list of required UIDs
 * to uniquely define a viewport.
 */
export default interface IViewportUID {
  renderingEngineUID: string
  sceneUID: string
  viewportUID: string
}
