import { IViewport } from './../types'
import Scene from './Scene'
import StackViewport from './StackViewport'
import VIEWPORT_TYPE from '../constants/viewportType'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import { createVolumeActor } from './helpers'
import cache from '../cache'
import { loadVolume } from '../volumeLoader'

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
class StackScene extends Scene {
  private _2DActors: Array<any>

  constructor(uid: string, renderingEngineUID: string) {
    super(uid, renderingEngineUID)
    this._2DActors = []
  }

  /**
   * @method addViewport Adds a `Viewport` to the `Scene`, as defined by the `ViewportInput`.
   * @param {ViewportInput} viewportInput
   */
  public addViewport(viewportInput: ViewportInput) {
    this._addViewport(viewportInput, StackViewport)
  }
}

export default StackScene
