import EVENTS from '../enums/events'
import renderingEngineCache from './renderingEngineCache'
import VIEWPORT_TYPE from '../constants/viewportType'
import eventTarget from '../eventTarget'
import { triggerEvent, uuidv4 } from '../utilities'
import { vtkOffscreenMultiRenderWindow } from './vtkClasses'
import { PublicViewportInput, ViewportInput } from '../types'
import VolumeViewport from './VolumeViewport'
import StackViewport from './StackViewport'
import Scene from './Scene'
import getOrCreateCanvas from './helpers/getOrCreateCanvas'
import isEqual from 'lodash.isequal'
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline'
import { getShouldUseCPURendering, isCornerstoneInitialized } from '../init'

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
  private _scenes: Map<string, Scene>
  private _viewports: Map<string, StackViewport | VolumeViewport>
  private _needsRender: Set<string> = new Set()
  private _animationFrameSet = false
  private _animationFrameHandle: number | null = null
  private useCPURendering: boolean

  /**
   *
   * @param uid - Unique identifier for RenderingEngine
   */
  constructor(uid: string) {
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

    this._scenes = new Map()
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
   * 4) If a sceneUID is provided for the viewportInputEntry it will create
   * a Scene for the viewport and add it to the list of scene viewports.
   * 5) If there is an already created scene, it will add the volumeActors
   * to the requested viewport. OffScreen canvas is resized properly based
   *  on the size of the new viewport.
   *
   *
   * @param {Object} viewportInputEntry viewport specifications
   *
   * @returns {void}
   * @memberof RenderingEngine
   */
  public enableElement(viewportInputEntry: PublicViewportInput): void {
    this._throwIfDestroyed()
    const { element, viewportUID } = viewportInputEntry

    // Throw error if no element provided
    if (!element) {
      throw new Error('No HTML div element provided')
    }

    // 1. Get the viewport from the list of available viewports.
    const viewport = this.getViewport(viewportUID)

    // 1.a) If there is a found viewport, and the scene Id has changed, we
    // remove the viewport and create a new viewport
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

    // 5. Add the new viewport to the queue to be rendered
    this._setViewportsToBeRenderedNextFrame([viewportInputEntry.viewportUID])
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
   * Creates `Scene`s containing `Viewport`s and sets up the offscreen render
   * window to allow offscreen rendering and transmission back to the target
   * canvas in each viewport.
   *
   * @param viewportInputEntries An array of viewport definitions to construct the rendering engine
   * /todo: if don't want scene don't' give uid
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
   * @method getScene Returns the scene, only scenes with SceneUID (not internal)
   * are returned
   * @param {string} sceneUID The UID of the scene to fetch.
   *
   * @returns {Scene} The scene object.
   */
  public getScene(sceneUID: string): Scene {
    this._throwIfDestroyed()

    // Todo: should the volume be decached?
    return this._scenes.get(sceneUID)
  }

  /**
   * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
   *
   * @returns {Scene} The scene object.
   */
  public getScenes(): Array<Scene> {
    this._throwIfDestroyed()

    return Array.from(this._scenes.values()).filter((s) => {
      // Do not return Scenes not explicitly created by the user
      return s.getIsInternalScene() === false
    })
  }

  /**
   * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
   *
   * @returns {Scene} The scene object.
   */
  public removeScene(sceneUID: string): void {
    this._throwIfDestroyed()

    this._scenes.delete(sceneUID)
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
   * @method getViewportsContainingVolumeUID Returns the viewport containing the volumeUID
   *
   * @returns {VolumeViewport} viewports
   */
  public getViewportsContainingVolumeUID(uid: string): Array<VolumeViewport> {
    const viewports = this._getViewportsAsArray() as Array<VolumeViewport>
    return viewports.filter((vp) => {
      const volActors = vp.getDefaultActor()
      return volActors.volumeActor && volActors.uid === uid
    })
  }

  /**
   * @method getScenesContainingVolume Returns the scenes containing the volumeUID
   *
   * @returns {Scene} scenes
   */
  public getScenesContainingVolume(uid: string): Array<Scene> {
    const scenes = this.getScenes()
    return scenes.filter((scene) => {
      const volumeActors = scene.getVolumeActors()
      const firstActor = volumeActors[0]
      return firstActor.volumeActor && firstActor.uid === uid
    })
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

  /**
   * @method render Renders all viewports on the next animation frame.
   */
  public render(): void {
    const viewports = this.getViewports()
    const viewportUIDs = viewports.map((vp) => vp.uid)

    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
  }

  /**
   * @method renderScene Renders only a specific `Scene` on the next animation frame.
   *
   * @param {string} sceneUID The UID of the scene to render.
   */
  public renderScene(sceneUID: string): void {
    const scene = this.getScene(sceneUID)
    const viewportUIDs = scene.getViewportUIDs()

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
   * @method renderScenes Renders the provided Scene UIDs.
   *
   * @returns{void}
   */
  public renderScenes(sceneUIDs: Array<string>): void {
    const scenes = sceneUIDs.map((sUid) => this.getScene(sUid))
    this._renderScenes(scenes)
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

    canvasesDrivenByVtkJs.push(viewportInputEntry.canvas)

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

    // 3 Add the requested viewport to rendering Engine
    this.addVtkjsDrivenViewport(viewportInputEntry, {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      xOffset,
    })

    // 4. Check if the viewport is part of a scene, if yes, add the available
    // volume Actors to the viewport too
    const viewportUID = viewportInputEntry.viewportUID
    const viewport = this.getViewport(viewportUID)

    // 4.a Only volumeViewports have scenes
    if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      const volActors = scene.getVolumeActors()
      const viewportActors = viewport.getActors()
      // add the volume actor if not the same as the viewport actor
      if (!isEqual(volActors, viewportActors)) {
        scene.addVolumeActors(viewportUID)
      }
    }
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

    // 3. Remove viewport from scene if scene exists
    if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      if (scene) {
        // 3.a Remove the viewport UID from the scene
        scene.removeViewportByUID(viewportUID)
        // 3.b If scene doesn't have any more viewports after this removal delete it
        if (!scene.getViewportUIDs().length) {
          this.removeScene(scene.uid)
        }
      }
    }
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
  private _addViewport(
    viewportInputEntry: InternalViewportInput,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number,
    _xOffset: number
  ): void {
    const { element, canvas, sceneUID, viewportUID, type, defaultOptions } =
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
      element, // div
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

    // 4. Create a proper viewport based on the type of the viewport
    let viewport
    if (type === VIEWPORT_TYPE.STACK) {
      // 4.a Create stack viewport
      viewport = new StackViewport(viewportInput)
    } else if (type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
      // 4.a Create volume viewport
      // 4.b Check if the provided scene already exists
      let scene = this.getScene(sceneUID)

      // 4.b Create a scene if does not exists and add to scenes
      // Note: A scene will ALWAYS be created for a volume viewport.
      // If a sceneUID is provided, it will get used for creating a scene.
      // if the sceneUID is not provided, we create an internal scene by
      // generating a random UID. However, the getScene API will not return
      // internal scenes.
      if (!scene) {
        scene = new Scene(sceneUID, this.uid)
        this._scenes.set(sceneUID, scene)
      }

      // 4.b Create a scene if does not exists and add to scenes
      viewportInput.sceneUID = scene.uid

      // 4.b Create a volume viewport and adds it to the scene
      viewport = new VolumeViewport(viewportInput)
      scene.addViewportByUID(viewportUID)
    } else {
      throw new Error(`Viewport Type ${type} is not supported`)
    }

    // 5. Storing the viewports
    this._viewports.set(viewportUID, viewport)

    const eventData = {
      element, // div
      viewportUID,
      sceneUID,
      renderingEngineUID: this.uid,
    }

    triggerEvent(eventTarget, EVENTS.ELEMENT_ENABLED, eventData)
  }

  /**
   * @method addCustomViewport Adds a viewport using a custom rendering pipeline
   * to the `RenderingEngine`.
   *
   * @param {PublicViewportInput} viewportInputEntry Information object used to
   * construct and enable the viewport.
   */
  private addCustomViewport(viewportInputEntry: PublicViewportInput): void {
    const { canvas, sceneUID, viewportUID, type, defaultOptions } =
      viewportInputEntry

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
      viewportUID,
      sceneUID,
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

      const vtkDrivenCanvases = viewportInputEntries.map((vp) => vp.canvas)

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

        const { canvas } = vtkDrivenViewportInputEntry
        this.addVtkjsDrivenViewport(vtkDrivenViewportInputEntry, {
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

      // Todo: Since element and canvas are the same thing the following can
      // be both on element and canvas, I guess ...?
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
   * @method _renderScenes setup for rendering the provided Scene UIDs.
   *
   * @returns{void}
   */
  private _renderScenes(scenes: Array<Scene>) {
    this._throwIfDestroyed()

    const viewportUIDs = []

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const sceneViewportUIDs = scene.getViewportUIDs()

      viewportUIDs.push(...sceneViewportUIDs)
    }

    this._setViewportsToBeRenderedNextFrame(viewportUIDs)
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
    canvas: HTMLCanvasElement
    viewportUID: string
    sceneUID: string
    renderingEngineUID: string
  } {
    const {
      element,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      uid,
      sceneUID,
      renderingEngineUID,
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
      canvas,
      viewportUID: uid,
      sceneUID,
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
      //sceneUID, // todo: where to get this now?
      renderingEngineUID,
    }

    // Trigger first before removing the data attributes, as we need the enabled
    // element to remove tools associated with the viewport
    triggerEvent(eventTarget, EVENTS.ELEMENT_DISABLED, eventData)

    element.removeAttribute('data-viewport-uid')
    element.removeAttribute('data-scene-uid')
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
    this._scenes = new Map()
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
    // Renders all scenes
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
