import { IViewport } from './../types'
import VolumeViewport from './VolumeViewport'
import StackViewport from './StackViewport'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'

type ViewportInput = {
  uid: string
  type: string
  canvas: HTMLElement
  sx: number
  sy: number
  sWidth: number
  sHeight: number
  defaultOptions: any
}

/**
 * @class Scene - Describes a scene which defined a worldspace containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
class Scene {
  readonly uid: string
  readonly renderingEngineUID: string
  private _viewports: Array<VolumeViewport | StackViewport>

  constructor(uid, renderingEngineUID) {
    this.uid = uid
    this.renderingEngineUID = renderingEngineUID
    this._viewports = []
  }

  /**
   * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
   *
   * @returns {RenderingEngine} The RenderingEngine instance.
   */
  public getRenderingEngine(): RenderingEngine {
    return renderingEngineCache.get(this.renderingEngineUID)
  }

  /**
   * @method getViewports Returns the viewports on the scene.
   *
   * @returns {Array<Viewport>} The viewports.
   */
  public getViewports(): Array<VolumeViewport | StackViewport> {
    return this._viewports
  }

  /**
   * @method render Renders all `Viewport`s in the `Scene` using the `Scene`'s `RenderingEngine`.
   */
  public render() {
    const renderingEngine = this.getRenderingEngine()

    renderingEngine.renderScene(this.uid)
  }

  /**
   * @method getViewport - Returns a `Viewport` from the `Scene` by its `uid`.
   * @param {string } uid The UID of the viewport to get.
   */
  public getViewport(uid: string): VolumeViewport | StackViewport {
    return this._viewports.find((vp) => vp.uid === uid)
  }

  /**
   * @method addViewport Adds a `Viewport` to the `Scene`, as defined by the `ViewportInput`.
   * @param {ViewportInput} viewportInput
   * @param {ViewportClass} ViewportClass
   */
  protected _addViewport(
    viewportInput: ViewportInput,
    ViewportClass: VolumeViewport | StackViewport
  ) {
    const viewportInterface = <IViewport>Object.assign({}, viewportInput, {
      sceneUID: this.uid,
      renderingEngineUID: this.renderingEngineUID,
    })

    const viewport = <VolumeViewport | StackViewport>(
      new ViewportClass(viewportInterface)
    )
    this._viewports.push(viewport)
  }
}

export default Scene
