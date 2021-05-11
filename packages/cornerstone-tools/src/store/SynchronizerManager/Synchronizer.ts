import IViewportUID from '../IViewportUID'
// ~~ VIEWPORT LIBRARY
import {
  getRenderingEngine,
  getEnabledElement,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'

export interface ISynchronizerEventHandler {
  (
    synchronizer: Synchronizer,
    sourceViewport: IViewportUID,
    targetViewport: IViewportUID,
    sourceEvent: any
  ): void
}

class Synchronizer {
  //
  private _enabled: boolean
  private _eventName: string
  private _eventHandler: ISynchronizerEventHandler
  private _ignoreFiredEvents: boolean
  private _sourceViewports: Array<IViewportUID>
  private _targetViewports: Array<IViewportUID>
  //
  public id: string

  constructor(
    synchronizerId: string,
    eventName: string,
    eventHandler: ISynchronizerEventHandler
  ) {
    this._enabled = true
    this._eventName = eventName
    this._eventHandler = eventHandler
    this._ignoreFiredEvents = false
    this._sourceViewports = []
    this._targetViewports = []

    //
    this.id = synchronizerId
  }

  public isDisabled(): boolean {
    return !this._enabled || !this._hasSourceElements()
  }

  /**
   * ADD
   * TODO: LISTENERS TO CATCH RenderingEngine/Scene specific adds for addSource/addTarget (and remove)
   * ========================
   */
  public add(viewport: IViewportUID): void {
    this.addTarget(viewport)
    this.addSource(viewport)
  }

  public addSource(viewport: IViewportUID) {
    const { renderingEngineUID, sceneUID, viewportUID } = viewport

    // TODO: exit early if already in list
    const canvas = getRenderingEngine(renderingEngineUID)
      .getScene(sceneUID)
      .getViewport(viewportUID)
      .getCanvas()

    // const enabledElement = getEnabledElement(canvas)

    // @ts-ignore
    canvas.addEventListener(this._eventName, this._onEvent.bind(this))
    this._updateDisableHandlers()

    this._sourceViewports.push(viewport)
  }

  public addTarget(viewport: IViewportUID) {
    // const { renderingEngineUID, sceneUID, viewportUID } = viewport

    // TODO: exit early if already in list
    this._targetViewports.push(viewport)
    this._updateDisableHandlers()
  }

  /**
   * REMOVE
   * ========================
   */

  public destroy(): void {
    this._sourceViewports.forEach((s) => this.removeSource(s))
    this._targetViewports.forEach((t) => this.removeTarget(t))
  }

  public remove(viewport: IViewportUID) {
    this.removeTarget(viewport)
    this.removeSource(viewport)
  }

  public removeSource(viewport: IViewportUID) {
    const index = _getViewportIndex(this._sourceViewports, viewport)

    if (index === -1) {
      return
    }

    const canvas = _getViewportCanvas(viewport)

    this._sourceViewports.splice(index, 1)
    // @ts-ignore
    canvas.removeEventListener(this._eventName, this._eventHandler)
    this._updateDisableHandlers()
  }

  public removeTarget(viewport: IViewportUID) {
    const index = _getViewportIndex(this._sourceViewports, viewport)

    if (index === -1) {
      return
    }

    this._targetViewports.splice(index, 1)
    this._updateDisableHandlers()
  }

  public hasSourceViewport(renderingEngineUID, sceneUID, viewportUID) {
    // Exact match; could make loose
    const containsExactMatch = this._sourceViewports.some(
      (vp) =>
        vp.renderingEngineUID === renderingEngineUID &&
        vp.sceneUID === sceneUID &&
        vp.viewportUID === viewportUID
    )

    return containsExactMatch
  }

  public fireEvent(sourceViewport: IViewportUID, sourceEvent: any): void {
    if (this.isDisabled() || this._ignoreFiredEvents) {
      return
    }

    this._ignoreFiredEvents = true
    try {
      for (let i = 0; i < this._targetViewports.length; i++) {
        const targetViewport = this._targetViewports[i]
        const targetIsSource =
          sourceViewport.viewportUID === targetViewport.viewportUID

        if (targetIsSource) {
          continue
        }

        this._eventHandler(this, sourceViewport, targetViewport, sourceEvent)
      }
    } catch (ex) {
      console.warn(`Synchronizer, for: ${this._eventName}`, ex)
    } finally {
      this._ignoreFiredEvents = false
    }
  }

  private _onEvent(evt: any) {
    if (this._ignoreFiredEvents === true) {
      return
    }

    const { renderingEngineUID, sceneUID, viewportUID } = getEnabledElement(
      evt.currentTarget
    )

    this.fireEvent(
      {
        renderingEngineUID,
        sceneUID,
        viewportUID,
      },
      evt
    )
  }

  private _hasSourceElements(): boolean {
    return this._sourceViewports.length !== 0
  }

  private _updateDisableHandlers(): void {
    const viewports = _getUniqueViewports(
      this._sourceViewports,
      this._targetViewports
    )
    const _remove = this.remove
    const disableHandler = (elementDisabledEvent) => {
      _remove(elementDisabledEvent.detail.element)
    }

    viewports.forEach(function (vUid) {
      const canvas = getRenderingEngine(vUid.renderingEngineUID)
        .getScene(vUid.sceneUID)
        .getViewport(vUid.viewportUID)
        .getCanvas()

      canvas.removeEventListener(
        RENDERING_EVENTS.ELEMENT_DISABLED,
        disableHandler
      )
      canvas.addEventListener(RENDERING_EVENTS.ELEMENT_DISABLED, disableHandler)
    })
  }
}

function _getUniqueViewports(vp1, vp2) {
  const unique = []

  const vps = vp1.concat(vp2)

  for (let i = 0; i < vps.length; i++) {
    const vp = vps[i]
    if (
      !unique.some(
        (u) =>
          vp.renderingEngineUID === u.renderingEngineUID &&
          vp.sceneUID === u.sceneUID &&
          vp.viewportUID === u.viewportUID
      )
    ) {
      unique.push(vp)
    }
  }

  return unique
}

function _getViewportIndex(arr, vp) {
  return arr.findIndex(
    (ar) =>
      vp.renderingEngineUID === ar.renderingEngineUID &&
      vp.sceneUID === ar.sceneUID &&
      vp.viewportUID === ar.viewportUID
  )
}

function _getViewportCanvas(vp: IViewportUID) {
  return getRenderingEngine(vp.renderingEngineUID)
    .getScene(vp.sceneUID)
    .getViewport(vp.viewportUID)
    .getCanvas()
}

export default Synchronizer
