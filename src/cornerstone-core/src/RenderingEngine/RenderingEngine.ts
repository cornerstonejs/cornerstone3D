import EVENTS from '../enums/events'
import renderingEngineCache from './renderingEngineCache'
import VIEWPORT_TYPE from '../constants/viewportType'
import eventTarget from '../eventTarget'
import { triggerEvent, uuidv4 } from '../utilities'
import { vtkOffscreenMultiRenderWindow } from './vtkClasses'
import { IViewport, PublicViewportInput, ViewportInput } from '../types'
import VolumeViewport from './VolumeViewport'
import StackViewport from './StackViewport'
import Scene from './Scene'

/**
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 *
 * @example
 * Instantiating a rendering engine:
 * ```
 * const renderingEngine = new RenderingEngine('pet-ct-rendering-engine');
 * ```
 *
 * @public
 */

interface IRenderingEngine {
  uid: string
  hasBeenDestroyed: boolean
  offscreenMultiRenderWindow: any
  offScreenCanvasContainer: any
  setViewports(viewports: Array<PublicViewportInput>): void
  resize(): void
  getScene(uid: string): Scene
  getScenes(): Array<Scene>
  getViewport(uid: string): StackViewport | VolumeViewport
  getViewports(): Array<StackViewport | VolumeViewport>
  render(): void
  renderScene(sceneUID: string): void
  renderScenes(sceneUIDs: Array<string>): void
  renderViewports(viewportUIDs: Array<string>): void
  renderViewport(sceneUID: string, viewportUID: string): void
  renderFrameOfReference(FrameOfReferenceUID: string): void
  destroy(): void
  _debugRender(): void
}

type ViewportDisplayCoords = {
  sxStartDisplayCoords: number
  syStartDisplayCoords: number
  sxEndDisplayCoords: number
  syEndDisplayCoords: number
  sx: number
  sy: number
  sWidth: number
  sHeight: number
}

class RenderingEngine {
  readonly uid: string
  public hasBeenDestroyed: boolean
  /**
   * A hook into VTK's `vtkOffscreenMultiRenderWindow`
   * @member {any}
   */
  public offscreenMultiRenderWindow: any
  readonly offScreenCanvasContainer: any // WebGL
  private _scenes: Array<Scene> = []
  private _viewports: Map<string, StackViewport | VolumeViewport>
  private _needsRender: Set<string> = new Set()
  private _animationFrameSet = false
  private _animationFrameHandle: number | null = null

  /**
   *
   * @param uid - Unique identifier for RenderingEngine
   */
  constructor(uid: string) {
    this.uid = uid ? uid : uuidv4()
    renderingEngineCache.set(this)

    this.offscreenMultiRenderWindow = vtkOffscreenMultiRenderWindow.newInstance()
    this.offScreenCanvasContainer = document.createElement('div')
    this.offscreenMultiRenderWindow.setContainer(this.offScreenCanvasContainer)
    this._scenes = []
    this._viewports = new Map()
    this.hasBeenDestroyed = false
  }

  public enableElement(viewportInputEntry: PublicViewportInput): void {
    const { canvas, viewportUID } = viewportInputEntry

    if (!canvas) {
      throw new Error('No canvases provided')
    }

    // Todo 1. Check if already exits, erase and add again. if canvas exits

    const viewports = this._getViewportsAsArray()
    const canvases = viewports.map((vp) => vp.canvas)
    canvases.push(viewportInputEntry.canvas)

    // New off screen size based on all viewports
    const {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
    } = this._resizeOffScreenCanvas(canvases)

    // re position previous viewports
    const _xOffset = this._resize(
      viewports,
      offScreenCanvasWidth,
      offScreenCanvasHeight
    )

    // add the new viewport
    this._addViewport(
      viewportInputEntry,
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      _xOffset
    )

    const viewport = this.getViewport(viewportUID)

    if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      scene.addVolumeActors(viewportUID)
    }

    this._setViewportsToBeRenderedNextFrame([viewportInputEntry.viewportUID])
  }

  // public disableElement(viewportUID: string): void {}

  private _addViewport(
    viewportInputEntry: PublicViewportInput,
    offScreenCanvasWidth,
    offScreenCanvasHeight,
    _xOffset
  ) {
    const {
      canvas,
      sceneUID,
      viewportUID,
      type,
      defaultOptions,
    } = viewportInputEntry

    if (this._viewports.get(viewportUID)) {
      console.warn(
        `The viewport ${viewportUID} is already added, if you want to add a new viewport, try a different uid`
      )
    }

    const {
      sxStartDisplayCoords,
      syStartDisplayCoords,
      sxEndDisplayCoords,
      syEndDisplayCoords,
      sx,
      sy,
      sWidth,
      sHeight,
    } = this._getViewportCoordsOnOffScreenCanvas(
      viewportInputEntry,
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      _xOffset
    )

    this.offscreenMultiRenderWindow.addRenderer({
      viewport: [
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
      ],
      uid: viewportUID,
      background: defaultOptions.background
        ? defaultOptions.background
        : [0, 0, 0],
    })

    const viewportInput = <ViewportInput>{
      uid: viewportUID,
      renderingEngineUID: this.uid,
      type,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      defaultOptions: defaultOptions || {},
    }

    let scene = this.getScene(sceneUID)

    if (!scene) {
      // creating scenes for volume viewports
      if (type !== VIEWPORT_TYPE.STACK) {
        scene = new Scene(sceneUID, this.uid)
        this._scenes.push(scene)
      }
    }

    let viewport
    if (type !== VIEWPORT_TYPE.STACK) {
      viewportInput.sceneUID = scene.uid
      viewport = new VolumeViewport(viewportInput)
      scene.addViewport(viewportUID)
    } else {
      viewport = new StackViewport(viewportInput)
    }

    this._viewports.set(viewportUID, viewport)

    const eventData = {
      canvas,
      viewportUID,
      sceneUID: sceneUID || scene ? scene.uid : undefined, // if it is internal uid
      renderingEngineUID: this.uid,
    }

    triggerEvent(eventTarget, EVENTS.ELEMENT_ENABLED, eventData)
  }

  /**
   * Creates `Scene`s containing `Viewport`s and sets up the offscreen render
   * window to allow offscreen rendering and transmission back to the target
   * canvas in each viewport.
   *
   * @param viewports An array of viewport definitions to construct the rendering engine
   * /todo: if don't want scene don't' give uid
   */
  public setViewports(viewportInputEntries: Array<PublicViewportInput>): void {
    this._throwIfDestroyed()
    this._reset()

    const canvases = viewportInputEntries.map((vp) => vp.canvas)

    // Set canvas size based on height and sum of widths
    const {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
    } = this._resizeOffScreenCanvas(canvases)

    if (!offScreenCanvasWidth || !offScreenCanvasHeight) {
      throw new Error('Invalid offscreen canvas width or height')
    }

    let _xOffset = 0
    for (let i = 0; i < viewportInputEntries.length; i++) {
      const viewportInputEntry = viewportInputEntries[i]

      const { canvas } = viewportInputEntry
      this._addViewport(
        viewportInputEntry,
        offScreenCanvasWidth,
        offScreenCanvasHeight,
        _xOffset
      )

      _xOffset += canvas.clientWidth
    }
  }

  // Todo: create Canvas type instead of publicViewportInput
  private _resizeOffScreenCanvas(canvases: Array<HTMLCanvasElement>) {
    const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this

    // Set canvas size based on height and sum of widths
    const offScreenCanvasHeight = Math.max(
      ...canvases.map((canvas) => canvas.clientHeight)
    )

    let offScreenCanvasWidth = 0

    canvases.forEach((canvas) => {
      offScreenCanvasWidth += canvas.clientWidth
    })

    offScreenCanvasContainer.width = offScreenCanvasWidth
    offScreenCanvasContainer.height = offScreenCanvasHeight

    offscreenMultiRenderWindow.resize()

    return { offScreenCanvasWidth, offScreenCanvasHeight }
  }

  private _resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight) {
    // Redefine viewport properties
    let _xOffset = 0

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i]
      const {
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
        sx,
        sy,
        sWidth,
        sHeight,
      } = this._getViewportCoordsOnOffScreenCanvas(
        viewport,
        offScreenCanvasWidth,
        offScreenCanvasHeight,
        _xOffset
      )

      _xOffset += viewport.canvas.clientWidth

      viewport.sx = sx
      viewport.sy = sy
      viewport.sWidth = sWidth
      viewport.sHeight = sHeight

      // Set the viewport of the vtkRenderer
      const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.uid)
      renderer.setViewport([
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
      ])
    }

    // Render all viewports
    return _xOffset
  }

  /**
   * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
   * It is up to the parent app to call the size of the on-screen canvas changes.
   * This is left as an app level concern as one might want to debounce the changes, or the like.
   */
  public resize(): void {
    this._throwIfDestroyed()

    const viewports = this._getViewportsAsArray()
    const canvases = viewports.map((vp) => vp.canvas)

    const {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
    } = this._resizeOffScreenCanvas(canvases)

    this._resize(viewports, offScreenCanvasWidth, offScreenCanvasHeight)
    this.render()
  }

  public _getViewportCoordsOnOffScreenCanvas(
    viewport: PublicViewportInput,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number,
    _xOffset: number
  ): ViewportDisplayCoords {
    const { canvas } = viewport
    const { clientWidth, clientHeight } = canvas

    // Set the canvas to be same resolution as the client.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth
      canvas.height = clientHeight
    }

    // Update the canvas drawImage offsets.
    const sx = _xOffset
    const sy = 0
    const sWidth = clientWidth
    const sHeight = clientHeight

    const sxStartDisplayCoords = sx / offScreenCanvasWidth

    // Need to offset y if it not max height
    const syStartDisplayCoords =
      sy + (offScreenCanvasHeight - clientHeight) / offScreenCanvasHeight

    const sWidthDisplayCoords = sWidth / offScreenCanvasWidth
    const sHeightDisplayCoords = sHeight / offScreenCanvasHeight

    return {
      sxStartDisplayCoords,
      syStartDisplayCoords,
      sxEndDisplayCoords: sxStartDisplayCoords + sWidthDisplayCoords,
      syEndDisplayCoords: syStartDisplayCoords + sHeightDisplayCoords,
      sx,
      sy,
      sWidth,
      sHeight,
    }
  }

  /**
   * @method getScene Returns the scene, only scenes with SceneUID (not internal)
   * are returned
   * @param {string} uid The UID of the scene to fetch.
   *
   * @returns {Scene} The scene object.
   */
  public getScene(uid: string): Scene {
    this._throwIfDestroyed()

    return this._scenes.find(
      (scene) => scene.uid === uid && !scene.getIsInternalScene()
    )
  }

  /**
   * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
   *
   * @returns {Scene} The scene object.
   */
  public getScenes(): Array<Scene> {
    this._throwIfDestroyed()

    return this._scenes.filter((scene) => scene.getIsInternalScene() === false)
  }

  private _getViewportsAsArray() {
    return Array.from(this._viewports.values())
  }

  public getViewport(uid: string): StackViewport | VolumeViewport {
    return this._viewports.get(uid)
  }
  /**
   * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   *
   * @returns {Viewport} The scene object.
   */
  public getViewports(): Array<StackViewport | VolumeViewport> {
    this._throwIfDestroyed()

    return this._getViewportsAsArray()
  }

  private _setViewportsToBeRenderedNextFrame(viewportUIDs: string[]) {
    // Add the viewports to the set of flagged viewports
    viewportUIDs.forEach((viewportUID) => {
      this._needsRender.add(viewportUID)
    })

    // Render any flagged viewports
    this._render()
  }

  /**
   * @method render Renders all viewports on the next animation frame.
   */
  public render(): void {
    const viewports = this.getViewports()
    const viewportUIDs = viewports.map((vp) => vp.uid)

    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  /**
   * @method _render Sets up animation frame if necessary
   */
  private _render() {
    // If we have viewports that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      )

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true
    }
  }

  /**
   * @method _renderFlaggedViewports Renders all viewports.
   */
  private _renderFlaggedViewports = () => {
    this._throwIfDestroyed()

    const { offscreenMultiRenderWindow } = this
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow()

    const renderers = offscreenMultiRenderWindow.getRenderers()

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true)
    }

    renderWindow.render()

    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const context = openGLRenderWindow.get3DContext()

    const offScreenCanvas = context.canvas

    const viewports = this._getViewportsAsArray()

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i]
      if (this._needsRender.has(viewport.uid)) {
        this._renderViewportToCanvas(viewport, offScreenCanvas)

        // This viewport has been rendered, we can remove it from the set
        this._needsRender.delete(viewport.uid)

        // If there is nothing left that is flagged for rendering, stop here
        // and allow RAF to be called again
        if (this._needsRender.size === 0) {
          this._animationFrameSet = false
          this._animationFrameHandle = null
          return
        }
      }
    }
  }

  /**
   * @method renderScene Renders only a specific `Scene` on the next animation frame.
   *
   * @param {string} sceneUID The UID of the scene to render.
   */
  public renderScene(sceneUID: string): void {
    const scene = this.getScene(sceneUID)
    const viewports = scene.getViewports()
    const viewportUIDs = viewports.map((vp) => vp.uid)

    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  public renderFrameOfReference = (FrameOfReferenceUID: string): void => {
    const viewports = this._getViewportsAsArray()
    const viewportUidsWithSameFrameOfReferenceUID = viewports.map((vp) => {
      if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
        return vp.uid
      }
    })

    return this.renderViewports(viewportUidsWithSameFrameOfReferenceUID)
  }

  public renderScenes(sceneUIDs: Array<string>): void {
    const scenes = sceneUIDs.map((sUid) => this.getScene(sUid))
    return this._renderScenes(scenes)
  }

  public renderViewports(viewportUIDs: Array<string>): void {
    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  private _renderScenes(scenes: Array<Scene>) {
    this._throwIfDestroyed()

    const viewportUIDs = []

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const viewports = scene.getViewports()
      viewports.forEach((vp) => {
        viewportUIDs.push(vp.uid)
      })
    }

    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  /**
   * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
   *
   * @param {string} viewportUID The UID of the scene the viewport belongs to.
   * @param {string} viewportUID The UID of the viewport.
   */
  public renderViewport(viewportUID: string): void {
    this._setViewportsToBeRenderedNextFrame([viewportUID])
  }

  /**
   * @method _renderViewportToCanvas Renders a particular `Viewport`'s on screen canvas.
   * @param {Viewport} viewport The `Viewport` to render.
   * @param {object} offScreenCanvas The offscreen canvas to render from.
   */
  private _renderViewportToCanvas(
    viewport: StackViewport | VolumeViewport,
    offScreenCanvas
  ) {
    const {
      sx,
      sy,
      sWidth,
      sHeight,
      uid,
      sceneUID,
      renderingEngineUID,
    } = viewport

    const canvas = <HTMLCanvasElement>viewport.canvas
    const { width: dWidth, height: dHeight } = canvas

    const onScreenContext = canvas.getContext('2d')

    onScreenContext.drawImage(
      offScreenCanvas,
      sx,
      sy,
      sWidth,
      sHeight,
      0, //dx
      0, // dy
      dWidth,
      dHeight
    )

    const eventData = {
      canvas,
      viewportUID: uid,
      sceneUID,
      renderingEngineUID,
    }

    triggerEvent(canvas, EVENTS.IMAGE_RENDERED, eventData)
  }

  /**
   * @method _reset Resets the `RenderingEngine`
   */
  private _reset() {
    const renderingEngineUID = this.uid

    const viewports = this._getViewportsAsArray()

    viewports.forEach((viewport) => {
      const { canvas, uid: viewportUID } = viewport

      const eventData = {
        canvas,
        viewportUID,
        //sceneUID, // todo: where to get this now?
        renderingEngineUID,
      }

      canvas.removeAttribute('data-viewport-uid')
      canvas.removeAttribute('data-scene-uid')
      canvas.removeAttribute('data-rendering-engine-uid')

      triggerEvent(eventTarget, EVENTS.ELEMENT_DISABLED, eventData)
    })

    window.cancelAnimationFrame(this._animationFrameHandle)

    this._needsRender.clear()
    this._animationFrameSet = false
    this._animationFrameHandle = null

    this._viewports = new Map()
    this._scenes = []
  }

  /**
   * @method destroy
   */
  public destroy(): void {
    if (this.hasBeenDestroyed) {
      return
    }

    this._reset()

    // Free up WebGL resources
    this.offscreenMultiRenderWindow.delete()

    renderingEngineCache.delete(this.uid)

    // Make sure all references go stale and are garbage collected.
    delete this.offscreenMultiRenderWindow

    this.hasBeenDestroyed = true
  }

  /**
   * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      )
    }
  }

  _downloadOffScreenCanvas() {
    const dataURL = this._debugRender()
    _TEMPDownloadURI(dataURL)
  }

  _debugRender(): void {
    // Renders all scenes
    const { offscreenMultiRenderWindow } = this
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow()

    const renderers = offscreenMultiRenderWindow.getRenderers()

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true)
    }

    renderWindow.render()
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const context = openGLRenderWindow.get3DContext()

    const offScreenCanvas = context.canvas
    const dataURL = offScreenCanvas.toDataURL()

    this._getViewportsAsArray().forEach((viewport) => {
      const { sx, sy, sWidth, sHeight } = viewport

      const canvas = <HTMLCanvasElement>viewport.canvas
      const { width: dWidth, height: dHeight } = canvas

      const onScreenContext = canvas.getContext('2d')

      //sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
      onScreenContext.drawImage(
        offScreenCanvas,
        sx,
        sy,
        sWidth,
        sHeight,
        0, //dx
        0, // dy
        dWidth,
        dHeight
      )
    })

    return dataURL
  }
}

export default RenderingEngine

function _TEMPDownloadURI(uri) {
  const link = document.createElement('a')

  link.download = 'viewport.png'
  link.href = uri
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
