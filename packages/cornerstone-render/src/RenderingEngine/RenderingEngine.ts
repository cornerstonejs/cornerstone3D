import EVENTS from '../enums/events'
import renderingEngineCache from './renderingEngineCache'
import VIEWPORT_TYPE from '../constants/viewportType'
import eventTarget from '../eventTarget'
import { triggerEvent, uuidv4 } from '../utilities'
import { vtkOffscreenMultiRenderWindow } from './vtkClasses'
import {
  PublicViewportInput,
  ViewportInput,
  InternalViewportInput,
} from '../types'
import VolumeViewport from './VolumeViewport'
import StackViewport from './StackViewport'
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline'
import getOrCreateCanvas from './helpers/getOrCreateCanvas'
import { getShouldUseCPURendering, isCornerstoneInitialized } from '../init'

interface IRenderingEngine {
  uid: string
  hasBeenDestroyed: boolean
  offscreenMultiRenderWindow: any
  offScreenCanvasContainer: any
  setViewports(viewports: Array<PublicViewportInput>): void
  resize(): void
  getViewport(uid: string): StackViewport | VolumeViewport
  getViewports(): Array<StackViewport | VolumeViewport>
  render(): void
  renderViewports(viewportUIDs: Array<string>): void
  renderViewport(viewportUID: string): void
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
class RenderingEngine implements IRenderingEngine {
  readonly uid: string
  public hasBeenDestroyed: boolean
  /**
   * A hook into vtk-js `vtkOffscreenMultiRenderWindow`
   * @member {any}
   */
  public offscreenMultiRenderWindow: any
  readonly offScreenCanvasContainer: any // WebGL
  private _viewports: Map<string, StackViewport | VolumeViewport>
  private _needsRender: Set<string> = new Set()
  private _animationFrameSet = false
  private _animationFrameHandle: number | null = null
  private useCPURendering: boolean

  /**
   *
   * @param uid - Unique identifier for RenderingEngine
   */
  constructor(uid?: string) {
    this.uid = uid ? uid : uuidv4()
    this.useCPURendering = getShouldUseCPURendering()

    renderingEngineCache.set(this)

    if (!isCornerstoneInitialized()) {
      throw new Error('Cornerstone-render is not initialized, run init() first')
    }

    if (!this.useCPURendering) {
      this.offscreenMultiRenderWindow =
        vtkOffscreenMultiRenderWindow.newInstance()
      this.offScreenCanvasContainer = document.createElement('div')
      this.offscreenMultiRenderWindow.setContainer(
        this.offScreenCanvasContainer
      )
    }

    this._viewports = new Map()
    this.hasBeenDestroyed = false
  }

  /**
   * Enables the requested viewport and add it to the viewports. It will
   * properly create the Stack viewport or Volume viewport:
   *
   * 1) Checks if the viewport is defined already, if yes, remove it first
   * 2) Calculates a new offScreen canvas with the new requested viewport
   * 3) Adds the viewport
   *
   * @param {Object} viewportInputEntry viewport specifications
   *
   * @returns {void}
   * @memberof RenderingEngine
   */
  public enableElement(viewportInputEntry: PublicViewportInput): void {
    this._throwIfDestroyed()
    const { element, viewportUID } = viewportInputEntry

    // Throw error if no canvas
    if (!element) {
      throw new Error('No element provided')
    }

    // 1. Get the viewport from the list of available viewports.
    const viewport = this.getViewport(viewportUID)

    // 1.a) If there is a found viewport, we remove the viewport and create a new viewport
    if (viewport) {
      this.disableElement(viewportUID)
      // todo: if only removing the viewport, make sure resize also happens
      // this._removeViewport(viewportUID)
    }

    // 2.a) See if viewport uses a custom rendering pipeline.
    const { type } = viewportInputEntry

    const viewportUsesCustomRenderingPipeline =
      viewportTypeUsesCustomRenderingPipeline(type)

    // 2.b) Retrieving the list of viewports for calculation of the new size for
    // offScreen canvas.

    // If the viewport being added uses a custom pipeline, or we aren't using
    // GPU rendering, we don't need to resize the offscreen canvas.
    if (!this.useCPURendering && !viewportUsesCustomRenderingPipeline) {
      this.enableVTKjsDrivenViewport(viewportInputEntry)
    } else {
      // 3 Add the requested viewport to rendering Engine
      this.addCustomViewport(viewportInputEntry)
    }

    // 5. Set the background color for the canvas
    const canvas = getOrCreateCanvas(element)
    const { background } = viewportInputEntry.defaultOptions
    this.fillCanvasWithBackgroundColor(canvas, background)
  }

  /**
   * Disables the requested viewportUID from the rendering engine:
   * 1) It removes the viewport from the the list of viewports
   * 2) remove the renderer from the offScreen render window
   * 3) resetting the viewport to remove the canvas attributes and canvas data
   * 4) resize the offScreen appropriately
   *
   * @param {string} viewportUID viewport UID
   *
   * @returns {void}
   * @memberof RenderingEngine
   */
  public disableElement(viewportUID: string): void {
    this._throwIfDestroyed()
    // 1. Getting the viewport to remove it
    const viewport = this.getViewport(viewportUID)

    // 2 To throw if there is no viewport stored in rendering engine
    if (!viewport) {
      console.warn(`viewport ${viewportUID} does not exist`)
      return
    }

    // 3. Reset the viewport to remove attributes, and reset the canvas
    this._resetViewport(viewport)

    // 4. Remove the related renderer from the offScreenMultiRenderWindow
    if (
      !viewportTypeUsesCustomRenderingPipeline(viewport.type) &&
      !this.useCPURendering
    ) {
      this.offscreenMultiRenderWindow.removeRenderer(viewportUID)
    }

    // 5. Remove the requested viewport from the rendering engine
    this._removeViewport(viewportUID)

    // 6. Avoid rendering for the disabled viewport
    this._needsRender.delete(viewportUID)

    // 7. Clear RAF if no viewport is left
    const viewports = this.getViewports()
    if (!viewports.length) {
      this._clearAnimationFrame()
    }

    // 8. Resize the offScreen canvas to accommodate for the new size (after removal)
    this.resize()
  }

  /**
   * Todo: Docs
   *
   * @param viewportInputEntries An array of viewport definitions to construct the rendering engine
   */
  public setViewports(viewportInputEntries: Array<PublicViewportInput>): void {
    this._throwIfDestroyed()
    this._reset()

    // 1. Split viewports based on whether they use vtk.js or a custom pipeline.

    const vtkDrivenViewportInputEntries: PublicViewportInput[] = []
    const customRenderingViewportInputEntries: PublicViewportInput[] = []

    viewportInputEntries.forEach((vpie) => {
      if (
        !this.useCPURendering &&
        !viewportTypeUsesCustomRenderingPipeline(vpie.type)
      ) {
        vtkDrivenViewportInputEntries.push(vpie)
      } else {
        customRenderingViewportInputEntries.push(vpie)
      }
    })

    this.setVtkjsDrivenViewports(vtkDrivenViewportInputEntries)
    this.setCustomViewports(customRenderingViewportInputEntries)
  }

  /**
   * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
   * It is up to the parent app to call the size of the on-screen canvas changes.
   * This is left as an app level concern as one might want to debounce the changes, or the like.
   *
   * @param {boolean} [immediate=true] Whether all of the viewports should be rendered immediately.
   * @param {boolean} [resetPanZoomForViewPlane=true] Whether each viewport gets centered (reset pan) and
   * its zoom gets reset upon resize.
   *
   */
  public resize(immediate = true, resetPanZoomForViewPlane = true): void {
    this._throwIfDestroyed()

    // 1. Get the viewports' canvases
    const viewports = this._getViewportsAsArray()

    const vtkDrivenViewports = []
    const customRenderingViewports = []

    viewports.forEach((vpie) => {
      if (!viewportTypeUsesCustomRenderingPipeline(vpie.type)) {
        vtkDrivenViewports.push(vpie)
      } else {
        customRenderingViewports.push(vpie)
      }
    })

    this._resizeVTKViewports(
      vtkDrivenViewports,
      immediate,
      resetPanZoomForViewPlane
    )

    this._resizeUsingCustomResizeHandler(
      customRenderingViewports,
      immediate,
      resetPanZoomForViewPlane
    )
  }

  /**
   * @method getViewport Returns the viewport by UID
   *
   * @returns {StackViewport | VolumeViewport} viewport
   */
  public getViewport(uid: string): StackViewport | VolumeViewport {
    return this._viewports.get(uid)
  }

  /**
   * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   *
   * @returns {Viewport} The viewports Array.
   */
  public getViewports(): Array<StackViewport | VolumeViewport> {
    this._throwIfDestroyed()

    return this._getViewportsAsArray()
  }

  /**
   * Filters all the available viewports and return the stack viewports
   * @returns stack viewports registered on the rendering Engine
   */
  public getStackViewports(): Array<StackViewport> {
    this._throwIfDestroyed()

    const viewports = this.getViewports()

    const isStackViewport = (
      viewport: StackViewport | VolumeViewport
    ): viewport is StackViewport => {
      return viewport instanceof StackViewport
    }

    return viewports.filter(isStackViewport)
  }

  public getVolumeViewports(): Array<VolumeViewport> {
    this._throwIfDestroyed()

    const viewports = this.getViewports()

    const isVolumeViewport = (
      viewport: StackViewport | VolumeViewport
    ): viewport is VolumeViewport => {
      return viewport instanceof VolumeViewport
    }

    return viewports.filter(isVolumeViewport)
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
   * @method renderFrameOfReference Renders any viewports viewing the
   * given Frame Of Reference.
   *
   * @param {string} FrameOfReferenceUID The unique identifier of the
   * Frame Of Reference.
   */
  public renderFrameOfReference = (FrameOfReferenceUID: string): void => {
    const viewports = this._getViewportsAsArray()
    const viewportUidsWithSameFrameOfReferenceUID = viewports.map((vp) => {
      if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
        return vp.uid
      }
    })

    return this.renderViewports(viewportUidsWithSameFrameOfReferenceUID)
  }

  /**
   * @method renderViewports Renders the provided Viewport UIDs.
   *
   * @returns{void}
   */
  public renderViewports(viewportUIDs: Array<string>): void {
    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  /**
   * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
   *
   * @param {string} viewportUID The UID of the viewport.
   */
  public renderViewport(viewportUID: string): void {
    this._setViewportsToBeRenderedNextFrame([viewportUID])
  }

  /**
   * @method destroy the rendering engine
   */
  public destroy(): void {
    if (this.hasBeenDestroyed) {
      return
    }

    this._reset()
    renderingEngineCache.delete(this.uid)

    if (!this.useCPURendering) {
      // Free up WebGL resources
      this.offscreenMultiRenderWindow.delete()

      // Make sure all references go stale and are garbage collected.
      delete this.offscreenMultiRenderWindow
    }

    this.hasBeenDestroyed = true
  }

  /**
   * Fill the canvas with the background color
   * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
   * @param backgroundColor - An array of three numbers between 0 and 1 that
   * specify the red, green, and blue values of the background color.
   */
  public fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ): void {
    const ctx = canvas.getContext('2d')

    // Default to black if no background color is set
    let fillStyle
    if (backgroundColor) {
      const rgb = backgroundColor.map((f) => Math.floor(255 * f))
      fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    } else {
      fillStyle = 'black'
    }

    // We draw over the previous stack with the background color while we
    // wait for the next stack to load
    ctx.fillStyle = fillStyle
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  private _resizeUsingCustomResizeHandler(
    customRenderingViewports: StackViewport[],
    immediate = true,
    resetPanZoomForViewPlane = true
  ) {
    // 1. If viewport has a custom resize method, call it here.
    customRenderingViewports.forEach((vp) => {
      if (typeof vp.resize === 'function') vp.resize()
    })

    // 3. Reset viewport cameras
    customRenderingViewports.forEach((vp) => {
      vp.resetCamera(resetPanZoomForViewPlane)
    })

    // 2. If render is immediate: Render all
    if (immediate === true) {
      this.render()
    }
  }

  private _resizeVTKViewports(
    vtkDrivenViewports: (StackViewport | VolumeViewport)[],
    resetPanZoomForViewPlane = true,
    immediate = true
  ) {
    const canvasesDrivenByVtkJs = vtkDrivenViewports.map((vp) => vp.canvas)

    if (canvasesDrivenByVtkJs.length) {
      // 1. Recalculate and resize the offscreen canvas size
      const { offScreenCanvasWidth, offScreenCanvasHeight } =
        this._resizeOffScreenCanvas(canvasesDrivenByVtkJs)

      // 2. Recalculate the viewports location on the off screen canvas
      this._resize(
        vtkDrivenViewports,
        offScreenCanvasWidth,
        offScreenCanvasHeight
      )
    }

    // 3. Reset viewport cameras
    vtkDrivenViewports.forEach((vp) => {
      vp.resetCamera(resetPanZoomForViewPlane)
    })

    // 4. If render is immediate: Render all
    if (immediate === true) {
      this.render()
    }
  }

  /**
   * @method enableVTKjsDrivenViewport Enables a viewport to be driven by the
   * offscreen vtk.js rendering engine.
   *
   * @param {PublicViewportInput} viewportInputEntry Information object used to
   * construct and enable the viewport.
   */
  private enableVTKjsDrivenViewport(viewportInputEntry: PublicViewportInput) {
    const viewports = this._getViewportsAsArray()
    const viewportsDrivenByVtkJs = viewports.filter(
      (vp) => viewportTypeUsesCustomRenderingPipeline(vp.type) === false
    )

    const canvasesDrivenByVtkJs = viewportsDrivenByVtkJs.map((vp) => vp.canvas)

    const canvas = getOrCreateCanvas(viewportInputEntry.element)
    canvasesDrivenByVtkJs.push(canvas)

    // 2.c Calculating the new size for offScreen Canvas
    const { offScreenCanvasWidth, offScreenCanvasHeight } =
      this._resizeOffScreenCanvas(canvasesDrivenByVtkJs)

    // 2.d Re-position previous viewports on the offScreen Canvas based on the new
    // offScreen canvas size
    const xOffset = this._resize(
      viewportsDrivenByVtkJs,
      offScreenCanvasWidth,
      offScreenCanvasHeight
    )

    const internalViewportEntry = { ...viewportInputEntry, canvas }

    // 3 Add the requested viewport to rendering Engine
    this.addVtkjsDrivenViewport(internalViewportEntry, {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      xOffset,
    })
  }

  /**
   * Disables the requested viewportUID from the rendering engine:
   * 1) It removes the viewport from the the list of viewports
   * 2) remove the renderer from the offScreen render window
   * 3) resetting the viewport to remove the canvas attributes and canvas data
   * 4) resize the offScreen appropriately
   *
   * @param {string} viewportUID viewport UID
   *
   * @returns {void}
   * @memberof RenderingEngine
   */
  private _removeViewport(viewportUID: string): void {
    // 1. Get the viewport
    const viewport = this.getViewport(viewportUID)
    if (!viewport) {
      console.warn(`viewport ${viewportUID} does not exist`)
      return
    }

    // 2. Delete the viewports from the the viewports
    this._viewports.delete(viewportUID)
  }

  /**
   * @method addVtkjsDrivenViewport Adds a viewport driven by vtk.js to the
   * `RenderingEngine`.
   *
   * @param {PublicViewportInput} viewportInputEntry Information object used to
   * construct and enable the viewport.
   * @param {{
   *       offScreenCanvasWidth: number;
   *       offScreenCanvasHeight: number;
   *       xOffset: number;
   *     }} [offscreenCanvasProperties] How the viewport relates to the
   * offscreen canvas.
   */
  private addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput,
    offscreenCanvasProperties?: {
      offScreenCanvasWidth: number
      offScreenCanvasHeight: number
      xOffset: number
    }
  ): void {
    const { element, canvas, viewportUID, type, defaultOptions } =
      viewportInputEntry

    const { offScreenCanvasWidth, offScreenCanvasHeight, xOffset } =
      offscreenCanvasProperties

    // 1. Calculate the size of location of the viewport on the offScreen canvas
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
      xOffset
    )

    // 2. Add a renderer to the offScreenMultiRenderWindow
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

    // 3. ViewportInput to be passed to a stack/volume viewport
    const viewportInput = <ViewportInput>{
      uid: viewportUID,
      element, // div
      renderingEngineUID: this.uid,
      type,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      defaultOptions: defaultOptions || {},
    }

    // 4. Create a proper viewport based on the type of the viewport
    let viewport
    if (type === VIEWPORT_TYPE.STACK) {
      // 4.a Create stack viewport
      viewport = new StackViewport(viewportInput)
    } else if (type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
      // 4.b Create a volume viewport
      viewport = new VolumeViewport(viewportInput)
    } else {
      throw new Error(`Viewport Type ${type} is not supported`)
    }

    // 5. Storing the viewports
    this._viewports.set(viewportUID, viewport)

    const eventData = {
      element,
      viewportUID,
      renderingEngineUID: this.uid,
    }

    if (!viewport.suppressEvents) {
      triggerEvent(eventTarget, EVENTS.ELEMENT_ENABLED, eventData)
    }
  }

  /**
   * @method addCustomViewport Adds a viewport using a custom rendering pipeline
   * to the `RenderingEngine`.
   *
   * @param {PublicViewportInput} viewportInputEntry Information object used to
   * construct and enable the viewport.
   */
  private addCustomViewport(viewportInputEntry: PublicViewportInput): void {
    const { element, viewportUID, type, defaultOptions } = viewportInputEntry

    const canvas = getOrCreateCanvas(element)

    // Add a viewport with no offset
    const { clientWidth, clientHeight } = canvas

    // Set the canvas to be same resolution as the client.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth
      canvas.height = clientHeight
    }

    const viewportInput = <ViewportInput>{
      uid: viewportUID,
      renderingEngineUID: this.uid,
      element, // div
      type,
      canvas,
      sx: 0, // No offset, uses own renderer
      sy: 0,
      sWidth: clientWidth,
      sHeight: clientHeight,
      defaultOptions: defaultOptions || {},
    }

    // 4. Create a proper viewport based on the type of the viewport

    if (type !== VIEWPORT_TYPE.STACK) {
      // In the future these will need to be pluggable, but we aren't there yet
      // and these are just Stacks for now.
      throw new Error('Support for fully custom viewports not yet implemented')
    }

    // 4.a Create stack viewport
    const viewport = new StackViewport(viewportInput)

    // 5. Storing the viewports
    this._viewports.set(viewportUID, viewport)

    const eventData = {
      canvas,
      element,
      viewportUID,
      renderingEngineUID: this.uid,
    }

    triggerEvent(eventTarget, EVENTS.ELEMENT_ENABLED, eventData)
  }

  /**
   * @method setCustomViewports Sets multiple viewports using custom rendering
   * pipelines to the `RenderingEngine`.
   *
   * @param {PublicViewportInput[]} viewportInputEntries An array of information
   * objects used to construct and enable the viewports.
   */
  private setCustomViewports(viewportInputEntries: PublicViewportInput[]) {
    viewportInputEntries.forEach((vpie) => this.addCustomViewport(vpie))
  }

  /**
   * @method setCustomViewports Sets multiple vtk.js driven viewports to
   * the `RenderingEngine`.
   *
   * @param {PublicViewportInput[]} viewportInputEntries An array of information
   * objects used to construct and enable the viewports.
   */
  private setVtkjsDrivenViewports(viewportInputEntries: PublicViewportInput[]) {
    // Deal with vtkjs driven viewports
    if (viewportInputEntries.length) {
      // 1. Getting all the canvases from viewports calculation of the new offScreen size

      const vtkDrivenCanvases = viewportInputEntries.map((vp) =>
        getOrCreateCanvas(vp.element)
      )

      // 2. Set canvas size based on height and sum of widths
      const { offScreenCanvasWidth, offScreenCanvasHeight } =
        this._resizeOffScreenCanvas(vtkDrivenCanvases)

      /*
          TODO: Commenting this out until we can mock the Canvas usage in the tests (or use jsdom?)
          if (!offScreenCanvasWidth || !offScreenCanvasHeight) {
            throw new Error('Invalid offscreen canvas width or height')
          }*/

      // 3. Adding the viewports based on the viewportInputEntry definition to the
      // rendering engine.
      let xOffset = 0
      for (let i = 0; i < viewportInputEntries.length; i++) {
        const vtkDrivenViewportInputEntry = viewportInputEntries[i]
        const canvas = vtkDrivenCanvases[i]
        const internalViewportEntry = {
          ...vtkDrivenViewportInputEntry,
          canvas,
        }

        this.addVtkjsDrivenViewport(internalViewportEntry, {
          offScreenCanvasWidth,
          offScreenCanvasHeight,
          xOffset,
        })

        // Incrementing the xOffset which provides the horizontal location of each
        // viewport on the offScreen canvas
        xOffset += canvas.clientWidth
      }
    }
  }

  /**
   * Resizes the offscreen canvas based on the provided vtk.js driven canvases.
   *
   * @param canvases An array of HTML Canvas
   */
  private _resizeOffScreenCanvas(
    canvasesDrivenByVtkJs: Array<HTMLCanvasElement>
  ): { offScreenCanvasWidth: number; offScreenCanvasHeight: number } {
    const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this

    // 1. Calculated the height of the offScreen canvas to be the maximum height
    // between canvases
    const offScreenCanvasHeight = Math.max(
      ...canvasesDrivenByVtkJs.map((canvas) => canvas.clientHeight)
    )

    // 2. Calculating the width of the offScreen canvas to be the sum of all
    let offScreenCanvasWidth = 0

    canvasesDrivenByVtkJs.forEach((canvas) => {
      offScreenCanvasWidth += canvas.clientWidth
    })

    offScreenCanvasContainer.width = offScreenCanvasWidth
    offScreenCanvasContainer.height = offScreenCanvasHeight

    // 3. Resize command
    offscreenMultiRenderWindow.resize()

    return { offScreenCanvasWidth, offScreenCanvasHeight }
  }

  /**
   * Recalculates and updates the viewports location on the offScreen canvas upon its resize
   *
   * @param viewports An array of viewports
   * @param offScreenCanvasWidth new offScreen canvas width
   * @param offScreenCanvasHeight new offScreen canvas height
   *
   * @returns {number} _xOffset the final offset which will be used for the next viewport
   */
  private _resize(
    viewportsDrivenByVtkJs: Array<StackViewport | VolumeViewport>,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number
  ): number {
    // Redefine viewport properties
    let _xOffset = 0

    for (let i = 0; i < viewportsDrivenByVtkJs.length; i++) {
      const viewport = viewportsDrivenByVtkJs[i]
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

      _xOffset += viewport.element.clientWidth

      viewport.sx = sx
      viewport.sy = sy
      viewport.sWidth = sWidth
      viewport.sHeight = sHeight

      // Updating the renderer for the viewport
      const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.uid)
      renderer.setViewport([
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
      ])
    }

    // Returns the final xOffset
    return _xOffset
  }

  /**
   * Calculates the location of the provided viewport on the offScreenCanvas
   *
   * @param viewports An array of viewports
   * @param offScreenCanvasWidth new offScreen canvas width
   * @param offScreenCanvasHeight new offScreen canvas height
   * @param _xOffset xOffSet to draw
   */
  private _getViewportCoordsOnOffScreenCanvas(
    viewport: InternalViewportInput | StackViewport | VolumeViewport,
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
   * @method _getViewportsAsArray Returns an array of all viewports
   *
   * @returns {Array} Array of viewports.
   */
  private _getViewportsAsArray() {
    return Array.from(this._viewports.values())
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

    if (!this.useCPURendering) {
      this.performVtkDrawCall()
    }

    const viewports = this._getViewportsAsArray()
    const eventDataArray = []

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i]
      if (this._needsRender.has(viewport.uid)) {
        const eventData = this.renderViewportUsingCustomOrVtkPipeline(viewport)
        eventDataArray.push(eventData)

        // This viewport has been rendered, we can remove it from the set
        this._needsRender.delete(viewport.uid)

        // If there is nothing left that is flagged for rendering, stop the loop
        if (this._needsRender.size === 0) {
          break
        }
      }
    }

    // allow RAF to be called again
    this._animationFrameSet = false
    this._animationFrameHandle = null

    eventDataArray.forEach((eventData) => {
      triggerEvent(eventData.element, EVENTS.IMAGE_RENDERED, eventData)
    })
  }

  /**
   * Performs the single `vtk.js` draw call which is used to render the offscreen
   * canvas for vtk.js. This is a bulk rendering step for all Volume and Stack
   * viewports when GPU rendering is available.
   */
  private performVtkDrawCall() {
    // Render all viewports under vtk.js' control.
    const { offscreenMultiRenderWindow } = this
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow()

    const renderers = offscreenMultiRenderWindow.getRenderers()

    if (!renderers.length) {
      return
    }

    for (let i = 0; i < renderers.length; i++) {
      const { renderer, uid } = renderers[i]

      // Requesting viewports that need rendering to be rendered only
      if (this._needsRender.has(uid)) {
        renderer.setDraw(true)
      } else {
        renderer.setDraw(false)
      }
    }

    renderWindow.render()

    // After redraw we set all renderers to not render until necessary
    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(false)
    }
  }

  /**
   * @method renderViewportUsingCustomOrVtkPipeline Renders the given viewport
   * using its preffered method.
   *
   * @param {(StackViewport | VolumeViewport)} viewport The viewport to render
   */
  private renderViewportUsingCustomOrVtkPipeline(
    viewport: StackViewport | VolumeViewport
  ): unknown {
    let eventData

    if (viewportTypeUsesCustomRenderingPipeline(viewport.type) === true) {
      eventData = viewport.customRenderViewportToCanvas()
    } else {
      if (this.useCPURendering) {
        throw new Error(
          'GPU not available, and using a viewport with no custom render pipeline.'
        )
      }

      const { offscreenMultiRenderWindow } = this
      const openGLRenderWindow =
        offscreenMultiRenderWindow.getOpenGLRenderWindow()
      const context = openGLRenderWindow.get3DContext()
      const offScreenCanvas = context.canvas

      eventData = this._renderViewportFromVtkCanvasToOnscreenCanvas(
        viewport,
        offScreenCanvas
      )
    }

    return eventData
  }

  /**
   * @method _renderViewportFromVtkCanvasToOnscreenCanvas Renders a particular `Viewport`'s on screen canvas.
   * @param {Viewport} viewport The `Viewport` to render.
   * @param {object} offScreenCanvas The offscreen canvas to render from.
   */
  private _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: StackViewport | VolumeViewport,
    offScreenCanvas
  ): {
    element: HTMLElement
    viewportUID: string
    renderingEngineUID: string
    suppressEvents: boolean
  } {
    const {
      element,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      uid,
      renderingEngineUID,
      suppressEvents,
    } = viewport

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

    return {
      element,
      suppressEvents,
      viewportUID: uid,
      renderingEngineUID,
    }
  }

  /**
   * @method _resetViewport Reset the viewport by removing the data attributes
   * and clearing the context of draw. It also emits an element disabled event
   *
   * @param {Viewport} viewport The `Viewport` to render.
   * @returns{void}
   */
  private _resetViewport(viewport) {
    const renderingEngineUID = this.uid

    const { element, canvas, uid: viewportUID } = viewport

    const eventData = {
      element,
      viewportUID,
      renderingEngineUID,
    }

    // Trigger first before removing the data attributes, as we need the enabled
    // element to remove tools associated with the viewport
    triggerEvent(eventTarget, EVENTS.ELEMENT_DISABLED, eventData)

    element.removeAttribute('data-viewport-uid')
    element.removeAttribute('data-rendering-engine-uid')

    // clear drawing
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  private _clearAnimationFrame() {
    window.cancelAnimationFrame(this._animationFrameHandle)

    this._needsRender.clear()
    this._animationFrameSet = false
    this._animationFrameHandle = null
  }

  /**
   * @method _reset Resets the `RenderingEngine`
   */
  private _reset() {
    const viewports = this._getViewportsAsArray()

    viewports.forEach((viewport) => {
      this._resetViewport(viewport)
    })

    this._clearAnimationFrame()

    this._viewports = new Map()
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

  // debugging utils for offScreen canvas
  _downloadOffScreenCanvas() {
    const dataURL = this._debugRender()
    _TEMPDownloadURI(dataURL)
  }

  // debugging utils for offScreen canvas
  _debugRender(): void {
    const { offscreenMultiRenderWindow } = this
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow()

    const renderers = offscreenMultiRenderWindow.getRenderers()

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true)
    }

    renderWindow.render()
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow()
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

// debugging utils for offScreen canvas
function _TEMPDownloadURI(uri) {
  const link = document.createElement('a')

  link.download = 'viewport.png'
  link.href = uri
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
