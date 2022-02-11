// ~~ VIEWPORT LIBRARY
import {
  getRenderingEngine,
  getEnabledElement,
  EVENTS as RENDERING_EVENTS,
  Types,
} from '@precisionmetrics/cornerstone-render'

export interface ISynchronizerEventHandler {
  (
    synchronizer: Synchronizer,
    sourceViewport: Types.IViewportUID,
    targetViewport: Types.IViewportUID,
    sourceEvent: any
  ): void
}

class Synchronizer {
  //
  private _enabled: boolean
  private _eventName: string
  private _eventHandler: ISynchronizerEventHandler
  private _ignoreFiredEvents: boolean
  private _sourceViewports: Array<Types.IViewportUID>
  private _targetViewports: Array<Types.IViewportUID>
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
   * TODO: LISTENERS TO CATCH RenderingEngine specific adds for addSource/addTarget (and remove)
   * ========================
   */
  public add(viewport: Types.IViewportUID): void {
    this.addTarget(viewport)
    this.addSource(viewport)
  }

  public addSource(viewport: Types.IViewportUID): void {
    if (_containsViewport(this._sourceViewports, viewport)) {
      return
    }

    const { renderingEngineUID, viewportUID } = viewport

    const { element } =
      getRenderingEngine(renderingEngineUID).getViewport(viewportUID)

    // @ts-ignore
    element.addEventListener(this._eventName, this._onEvent.bind(this))
    this._updateDisableHandlers()

    this._sourceViewports.push(viewport)
  }

  public addTarget(viewport: Types.IViewportUID): void {
    if (_containsViewport(this._targetViewports, viewport)) {
      return
    }

    this._targetViewports.push(viewport)
    this._updateDisableHandlers()
  }

  public getSourceViewports(): Array<Types.IViewportUID> {
    return this._sourceViewports
  }

  public getTargetViewports(): Array<Types.IViewportUID> {
    return this._targetViewports
  }

  /**
   * REMOVE
   * ========================
   */

  public destroy(): void {
    this._sourceViewports.forEach((s) => this.removeSource(s))
    this._targetViewports.forEach((t) => this.removeTarget(t))
  }

  public remove(viewport: Types.IViewportUID): void {
    this.removeTarget(viewport)
    this.removeSource(viewport)
  }

  public removeSource(viewport: Types.IViewportUID): void {
    const index = _getViewportIndex(this._sourceViewports, viewport)

    if (index === -1) {
      return
    }

    const element = _getViewportElement(viewport)

    this._sourceViewports.splice(index, 1)
    // @ts-ignore
    element.removeEventListener(this._eventName, this._eventHandler)
    this._updateDisableHandlers()
  }

  public removeTarget(viewport: Types.IViewportUID): void {
    const index = _getViewportIndex(this._targetViewports, viewport)

    if (index === -1) {
      return
    }

    this._targetViewports.splice(index, 1)
    this._updateDisableHandlers()
  }

  public hasSourceViewport(
    renderingEngineUID: string,
    viewportUID: string
  ): boolean {
    return _containsViewport(this._sourceViewports, {
      renderingEngineUID,
      viewportUID,
    })
  }

  public fireEvent(sourceViewport: Types.IViewportUID, sourceEvent: any): void {
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

  private _onEvent = (evt: any): void => {
    if (this._ignoreFiredEvents === true) {
      return
    }

    // If no target viewports, then return immediately, this is useful
    // when switching between layouts, when previous layout has disabled
    // its viewports, and the new layout has not yet enabled them.
    // Right now we don't "delete" the synchronizer if all source and targets
    // are removed, but we may want to do that in the future.
    if (!this._targetViewports.length) {
      return
    }

    const enabledElement = getEnabledElement(evt.currentTarget)

    if (!enabledElement) {
      return
    }

    const { renderingEngineUID, viewportUID } = enabledElement

    this.fireEvent(
      {
        renderingEngineUID,
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
      const { element } = getRenderingEngine(
        vUid.renderingEngineUID
      ).getViewport(vUid.viewportUID)

      element.removeEventListener(
        RENDERING_EVENTS.ELEMENT_DISABLED,
        disableHandler
      )
      element.addEventListener(
        RENDERING_EVENTS.ELEMENT_DISABLED,
        disableHandler
      )
    })
  }
}

function _getUniqueViewports(
  vp1: Array<Types.IViewportUID>,
  vp2: Array<Types.IViewportUID>
): Array<Types.IViewportUID> {
  const unique = []

  const vps = vp1.concat(vp2)

  for (let i = 0; i < vps.length; i++) {
    const vp = vps[i]
    if (
      !unique.some(
        (u) =>
          vp.renderingEngineUID === u.renderingEngineUID &&
          vp.viewportUID === u.viewportUID
      )
    ) {
      unique.push(vp)
    }
  }

  return unique
}

function _getViewportIndex(
  arr: Array<Types.IViewportUID>,
  vp: Types.IViewportUID
): number {
  return arr.findIndex(
    (ar) =>
      vp.renderingEngineUID === ar.renderingEngineUID &&
      vp.viewportUID === ar.viewportUID
  )
}

function _containsViewport(
  arr: Array<Types.IViewportUID>,
  vp: Types.IViewportUID
) {
  return arr.some(
    (ar) =>
      ar.renderingEngineUID === vp.renderingEngineUID &&
      ar.viewportUID === vp.viewportUID
  )
}

function _getViewportElement(vp: Types.IViewportUID): HTMLElement {
  const renderingEngine = getRenderingEngine(vp.renderingEngineUID)
  if (!renderingEngine) {
    throw new Error(`No RenderingEngine for UID: ${vp.renderingEngineUID}`)
  }

  return renderingEngine.getViewport(vp.viewportUID).element
}

export default Synchronizer
