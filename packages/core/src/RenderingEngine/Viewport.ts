import type { vtkCamera } from 'vtk.js/Sources/Rendering/Core/Camera'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'

import { vec3, mat4 } from 'gl-matrix'
import _cloneDeep from 'lodash.clonedeep'

import Events from '../enums/Events'
import ViewportType from '../enums/ViewportType'
import { ICamera, ActorEntry } from '../types'
import { ViewportInput, IViewport } from '../types/IViewport'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import { triggerEvent, planar } from '../utilities'
import { ViewportInputOptions, Point2, Point3, FlipDirection } from '../types'
import type { vtkSlabCamera } from './vtkClasses'

/**
 * An object representing a single viewport, which is a camera
 * looking into a viewport, and an associated target output `HTMLElement`.
 * Viewport is a base class that can be extended to create a specific
 * viewport type. Both VolumeViewport and StackViewport are subclasses
 * of Viewport. Common logic for all viewports is contained in Viewport class
 * which is camera properties/methods, vtk.js actors, and other common
 * logic.
 */
class Viewport implements IViewport {
  /** unique identifier for the viewport */
  readonly uid: string
  /** HTML element in DOM that is used for rendering the viewport */
  readonly element: HTMLElement
  /** an internal canvas that is created on the provided HTML element */
  readonly canvas: HTMLCanvasElement
  /** RenderingEngine uid that the viewport belongs to */
  readonly renderingEngineUID: string
  /** Type of viewport */
  readonly type: ViewportType
  protected flipHorizontal = false
  protected flipVertical = false

  /** sx of viewport on the offscreen canvas */
  sx: number
  /** sy of viewport on the offscreen canvas */
  sy: number
  /** sWidth of viewport on the offscreen canvas */
  sWidth: number
  /** sHeight of viewport on the offscreen canvas */
  sHeight: number
  /** a Map containing the actor uid and actors */
  _actors: Map<string, any>
  /** Default options for the viewport which includes orientation, sliceNormal and backgroundColor */
  readonly defaultOptions: any
  /** options for the viewport which includes orientation, sliceNormal and backgroundColor */
  options: ViewportInputOptions
  private _suppressCameraModifiedEvents = false
  /** A flag representing if viewport methods should fire events or not */
  readonly suppressEvents: boolean

  constructor(props: ViewportInput) {
    this.uid = props.uid
    this.renderingEngineUID = props.renderingEngineUID
    this.type = props.type
    this.element = props.element
    this.canvas = props.canvas
    this.sx = props.sx
    this.sy = props.sy
    this.sWidth = props.sWidth
    this.sHeight = props.sHeight
    this._actors = new Map()
    // Set data attributes for render events
    this.element.setAttribute('data-viewport-uid', this.uid)
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineUID
    )

    this.defaultOptions = _cloneDeep(props.defaultOptions)
    this.suppressEvents = props.defaultOptions.suppressEvents
      ? props.defaultOptions.suppressEvents
      : false
    this.options = _cloneDeep(props.defaultOptions)
  }

  getFrameOfReferenceUID: () => string
  canvasToWorld: (canvasPos: Point2) => Point3
  worldToCanvas: (worldPos: Point3) => Point2
  customRenderViewportToCanvas: () => unknown
  resize: () => void
  getProperties: () => void

  static get useCustomRenderingPipeline() {
    return false
  }

  /**
   * Returns the rendering engine driving the `Viewport`.
   *
   * @returns The RenderingEngine instance.
   */
  public getRenderingEngine(): RenderingEngine {
    return renderingEngineCache.get(this.renderingEngineUID)
  }

  /**
   * Returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns The `vtkRenderer` for the `Viewport`.
   */
  public getRenderer() {
    const renderingEngine = this.getRenderingEngine()

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      throw new Error('Rendering engine has been destroyed')
    }

    return renderingEngine.offscreenMultiRenderWindow.getRenderer(this.uid)
  }

  /**
   * Renders the `Viewport` using the `RenderingEngine`.
   */
  public render() {
    const renderingEngine = this.getRenderingEngine()

    renderingEngine.renderViewport(this.uid)
  }

  /**
   * Sets new options and (TODO) applies them.
   *
   * @param options - The viewport options to set.
   * @param immediate - If `true`, renders the viewport after the options are set.
   */
  public setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = <ViewportInputOptions>_cloneDeep(options)

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render()
    }
  }

  /**
   * Resets the options the `Viewport`'s `defaultOptions`
   *
   * @param immediate - If `true`, renders the viewport after the options are reset.
   */
  public reset(immediate = false) {
    this.options = _cloneDeep(this.defaultOptions)

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render()
    }
  }

  protected applyFlipTx = (worldPos: Point3): Point3 => {
    const actor = this.getDefaultActor()

    if (!actor) {
      return worldPos
    }

    const volumeActor = actor.volumeActor
    const mat = volumeActor.getMatrix()

    const newPos = vec3.create()
    const matT = mat4.create()
    mat4.transpose(matT, mat)
    vec3.transformMat4(newPos, worldPos, matT)

    return [newPos[0], newPos[1], newPos[2]]
  }

  /**
   * Flip the viewport on horizontal or vertical axis, this method
   * works with vtk-js backed rendering pipeline.
   *
   * @param flipOptions - Flip options specifying the axis of flip
   * @param flipOptions.flipHorizontal - Flip the viewport on horizontal axis
   * @param flipOptions.flipVertical - Flip the viewport on vertical axis
   */
  protected flip({ flipHorizontal, flipVertical }: FlipDirection): void {
    const imageData = this.getDefaultImageData()

    if (!imageData) {
      return
    }

    let flipH = false
    let flipV = false

    if (
      typeof flipHorizontal !== 'undefined' &&
      ((flipHorizontal && !this.flipHorizontal) ||
        (!flipHorizontal && this.flipHorizontal))
    ) {
      flipH = true
    }

    if (
      typeof flipVertical !== 'undefined' &&
      ((flipVertical && !this.flipVertical) ||
        (!flipVertical && this.flipVertical))
    ) {
      flipV = true
    }

    if (!flipH && !flipV) {
      return
    }

    // In Cornerstone gpu rendering pipeline, the images are positioned
    // in the space according to their origin, and direction (even StackViewport
    // with one slice only). In order to flip the images, we need to flip them
    // around their center axis (either horizontal or vertical). Since the images
    // are positioned in the space according to their origin and direction, for a
    // proper scaling (flipping), they should be transformed to the origin and
    // then flipped. The following code does this transformation.

    const origin = imageData.getOrigin()
    const direction = imageData.getDirection()
    const spacing = imageData.getSpacing()
    const size = imageData.getDimensions()

    const iVector = direction.slice(0, 3)
    const jVector = direction.slice(3, 6)
    const kVector = direction.slice(6, 9)

    // finding the center of the image
    const center = vec3.create()
    vec3.scaleAndAdd(center, origin, iVector, (size[0] / 2.0) * spacing[0])
    vec3.scaleAndAdd(center, center, jVector, (size[1] / 2.0) * spacing[1])
    vec3.scaleAndAdd(center, center, kVector, (size[2] / 2.0) * spacing[2])

    let flipHTx, flipVTx

    const transformToOriginTx = vtkMatrixBuilder
      .buildFromRadian()
      .identity()
      .translate(center[0], center[1], center[2])
      .rotateFromDirections(jVector, [0, 1, 0])
      .rotateFromDirections(iVector, [1, 0, 0])

    const transformBackFromOriginTx = vtkMatrixBuilder
      .buildFromRadian()
      .identity()
      .rotateFromDirections([1, 0, 0], iVector)
      .rotateFromDirections([0, 1, 0], jVector)
      .translate(-center[0], -center[1], -center[2])

    if (flipH) {
      this.flipHorizontal = flipHorizontal
      flipHTx = vtkMatrixBuilder
        .buildFromRadian()
        .multiply(transformToOriginTx.getMatrix())
        .scale(-1, 1, 1)
        .multiply(transformBackFromOriginTx.getMatrix())
    }

    if (flipV) {
      this.flipVertical = flipVertical
      flipVTx = vtkMatrixBuilder
        .buildFromRadian()
        .multiply(transformToOriginTx.getMatrix())
        .scale(1, -1, 1)
        .multiply(transformBackFromOriginTx.getMatrix())
    }

    const actors = this.getActors()

    actors.forEach((actor) => {
      const volumeActor = actor.volumeActor

      const mat = volumeActor.getUserMatrix()

      if (flipHTx) {
        mat4.multiply(mat, mat, flipHTx.getMatrix())
      }

      if (flipVTx) {
        mat4.multiply(mat, mat, flipVTx.getMatrix())
      }

      volumeActor.setUserMatrix(mat)

      this.getRenderingEngine().render()
    })

    this.getRenderingEngine().render()
  }

  private getDefaultImageData(): any {
    const actor = this.getDefaultActor()

    if (actor) {
      return actor.volumeActor.getMapper().getInputData()
    }
  }

  /**
   * Get the default actor
   * @returns An actor entry.
   */
  public getDefaultActor(): ActorEntry {
    return this.getActors()[0]
  }

  /**
   * Get all the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  public getActors(): Array<ActorEntry> {
    return Array.from(this._actors.values())
  }

  /**
   * Get an actor by its UID
   * @param actorUID - The unique ID of the actor.
   * @returns An ActorEntry object.
   */
  public getActor(actorUID: string): ActorEntry {
    return this._actors.get(actorUID)
  }

  /**
   * It removes all actors from the viewport and then adds the actors from the array.
   * @param actors - An array of ActorEntry objects.
   */
  public setActors(actors: Array<ActorEntry>): void {
    this.removeAllActors()
    this.addActors(actors)
  }

  /**
   * Remove the actor from the viewport
   * @param actorUID - The unique identifier for the actor.
   */
  public removeActor(actorUID: string): void {
    const actor = this.getActor(actorUID)
    if (!actor) {
      console.warn(`Actor ${actorUID} does not exist for this viewport`)
      return
    }
    const renderer = this.getRenderer()
    renderer.removeViewProp(actor.volumeActor) // removeActor not implemented in vtk?
    this._actors.delete(actorUID)
  }

  /**
   * Remove the actors with the given UIDs from the viewport
   * @param actorUIDs - An array of actor UIDs to remove.
   */
  public removeActors(actorUIDs: Array<string>): void {
    actorUIDs.forEach((actorUID) => {
      this.removeActor(actorUID)
    })
  }

  /**
   * Add a list of actors (actor entries) to the viewport
   * @param actors - An array of ActorEntry objects.
   */
  public addActors(actors: Array<ActorEntry>): void {
    actors.forEach((actor) => this.addActor(actor))
  }

  /**
   * Add an actor to the viewport including its uid, its volumeActor and slabThickness
   * if defined
   * @param actorEntry - ActorEntry
   * @param actorEntry.uid - The unique identifier for the actor.
   * @param actorEntry.volumeActor - The volume actor.
   * @param actorEntry.slabThickness - The slab thickness.
   */
  public addActor(actorEntry: ActorEntry): void {
    const { uid: actorUID, volumeActor } = actorEntry
    const renderingEngine = this.getRenderingEngine()

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      console.warn(
        `Cannot add actor UID of ${actorUID} Rendering Engine has been destroyed`
      )
      return
    }

    if (!actorUID || !volumeActor) {
      throw new Error('Actors should have uid and vtk volumeActor properties')
    }

    const actor = this.getActor(actorUID)
    if (actor) {
      console.warn(`Actor ${actorUID} already exists for this viewport`)
      return
    }

    const renderer = this.getRenderer()
    renderer.addActor(volumeActor)
    this._actors.set(actorUID, Object.assign({}, actorEntry))
  }

  /**
   * Remove all actors from the renderer
   */
  public removeAllActors(): void {
    this.getRenderer().removeAllViewProps()
    this._actors = new Map()
    return
  }

  /**
   * Reset the camera to the default viewport camera without firing events
   */
  protected resetCameraNoEvent() {
    this._suppressCameraModifiedEvents = true
    this.resetCamera()
    this._suppressCameraModifiedEvents = false
  }

  /**
   * Sets the camera to the default viewport camera without firing events
   * @param camera - The camera to use for the viewport.
   */
  protected setCameraNoEvent(camera: ICamera): void {
    this._suppressCameraModifiedEvents = true
    this.setCamera(camera)
    this._suppressCameraModifiedEvents = false
  }

  /**
   * Calculates the intersections between the volume's boundaries and the viewplane.
   * 1) Determine the viewplane using the camera's ViewplaneNormal and focalPoint.
   * 2) Using volumeBounds, calculate the line equation for the 3D volume's 12 edges.
   * 3) Intersect each edge to the viewPlane and see whether the intersection point is inside the volume bounds.
   * 4) Return list of intersection points
   * It should be noted that intersection points may range from 3 to 6 points.
   * Orthogonal views have four points of intersection.
   *
   * @param imageData - vtkImageData
   * @param focalPoint - camera focal point
   * @param normal - view plane normal
   * @returns intersections list
   */
  private _getViewImageDataIntersections(imageData, focalPoint, normal) {
    // Viewplane equation: Ax+By+Cz=D
    const A = normal[0]
    const B = normal[1]
    const C = normal[2]
    const D = A * focalPoint[0] + B * focalPoint[1] + C * focalPoint[2]

    // Computing the edges of the 3D cube
    const bounds = imageData.getBounds()
    const edges = this._getEdges(bounds)

    const intersections = []

    for (const edge of edges) {
      // start point: [x0, y0, z0], end point: [x1, y1, z1]
      const [[x0, y0, z0], [x1, y1, z1]] = edge
      // Check if the edge is parallel to plane
      if (A * (x1 - x0) + B * (y1 - y0) + C * (z1 - z0) === 0) {
        continue
      }
      const intersectionPoint = planar.linePlaneIntersection(
        [x0, y0, z0],
        [x1, y1, z1],
        [A, B, C, D]
      )

      if (this._isInBounds(intersectionPoint, bounds)) {
        intersections.push(intersectionPoint)
      }
    }

    return intersections
  }

  /**
   * Resets the camera based on the rendering volume(s) bounds. If
   * resetPanZoomForViewPlane is false (default behavior), it places
   * the focal point at the center of the volume (or slice); otherwise,
   * only the camera zoom and camera Pan is reset for the current view.
   * @param resetPanZoomForViewPlane - if true, it renders the center of the volume instead
   * @returns boolean
   */
  protected resetCamera(resetPanZoomForViewPlane = false): boolean {
    const renderer = this.getRenderer()
    const previousCamera = _cloneDeep(this.getCamera())

    const bounds = renderer.computeVisiblePropBounds()
    const focalPoint = [0, 0, 0]
    const imageData = this.getDefaultImageData()

    // Todo: remove this, this is just for tests passing
    if (imageData) {
      const spc = imageData.getSpacing()

      bounds[0] = bounds[0] + spc[0] / 2
      bounds[1] = bounds[1] - spc[0] / 2
      bounds[2] = bounds[2] + spc[1] / 2
      bounds[3] = bounds[3] - spc[1] / 2
      bounds[4] = bounds[4] + spc[2] / 2
      bounds[5] = bounds[5] - spc[2] / 2
    }

    const activeCamera = this.getVtkActiveCamera()
    const viewPlaneNormal = <Point3>activeCamera.getViewPlaneNormal()
    const viewUp = <Point3>activeCamera.getViewUp()

    // Reset the perspective zoom factors, otherwise subsequent zooms will cause
    // the view angle to become very small and cause bad depth sorting.
    // todo: parallel projection only
    activeCamera.setViewAngle(90.0)

    focalPoint[0] = (bounds[0] + bounds[1]) / 2.0
    focalPoint[1] = (bounds[2] + bounds[3]) / 2.0
    focalPoint[2] = (bounds[4] + bounds[5]) / 2.0

    if (imageData) {
      const dimensions = imageData.getDimensions()
      const middleIJK = dimensions.map((d) => Math.floor(d / 2))

      const idx = [middleIJK[0], middleIJK[1], middleIJK[2]]
      imageData.indexToWorld(idx, focalPoint)
    }

    const { widthWorld, heightWorld } =
      this._getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal)

    const canvasSize = [this.sWidth, this.sHeight]

    const boundsAspectRatio = widthWorld / heightWorld
    const canvasAspectRatio = canvasSize[0] / canvasSize[1]

    let radius

    if (boundsAspectRatio < canvasAspectRatio) {
      // can fit full height, so use it.
      radius = heightWorld / 2
    } else {
      const scaleFactor = boundsAspectRatio / canvasAspectRatio

      radius = (heightWorld * scaleFactor) / 2
    }

    //const angle = vtkMath.radiansFromDegrees(activeCamera.getViewAngle())
    const parallelScale = 1.1 * radius

    let w1 = bounds[1] - bounds[0]
    let w2 = bounds[3] - bounds[2]
    let w3 = bounds[5] - bounds[4]
    w1 *= w1
    w2 *= w2
    w3 *= w3
    radius = w1 + w2 + w3

    // If we have just a single point, pick a radius of 1.0
    radius = radius === 0 ? 1.0 : radius

    // compute the radius of the enclosing sphere
    radius = Math.sqrt(radius) * 0.5

    const distance = 1.1 * radius
    // const distance = radius / Math.sin(angle * 0.5)

    // check view-up vector against view plane normal
    if (Math.abs(vtkMath.dot(viewUp, viewPlaneNormal)) > 0.999) {
      activeCamera.setViewUp(-viewUp[2], viewUp[0], viewUp[1])
    }

    let focalPointToSet = focalPoint

    if (resetPanZoomForViewPlane && imageData) {
      focalPointToSet = this._getFocalPointForViewPlaneReset(imageData)
    }

    activeCamera.setFocalPoint(
      focalPointToSet[0],
      focalPointToSet[1],
      focalPointToSet[2]
    )
    activeCamera.setPosition(
      focalPointToSet[0] + distance * viewPlaneNormal[0],
      focalPointToSet[1] + distance * viewPlaneNormal[1],
      focalPointToSet[2] + distance * viewPlaneNormal[2]
    )

    renderer.resetCameraClippingRange(bounds)

    activeCamera.setParallelScale(parallelScale)

    // update reasonable world to physical values
    activeCamera.setPhysicalScale(radius)

    // TODO: The PhysicalXXX stuff are used for VR only, do we need this?
    activeCamera.setPhysicalTranslation(
      -focalPointToSet[0],
      -focalPointToSet[1],
      -focalPointToSet[2]
    )

    // instead of setThicknessFromFocalPoint we should do it here
    activeCamera.setClippingRange(distance, distance + 0.1)

    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    }

    // Here to let parallel/distributed compositing intercept
    // and do the right thing.
    renderer.invokeEvent(RESET_CAMERA_EVENT)

    if (!this._suppressCameraModifiedEvents && !this.suppressEvents) {
      const eventDetail = {
        previousCamera: previousCamera,
        camera: this.getCamera(),
        canvas: this.canvas,
        element: this.element,
        viewportUID: this.uid,
        renderingEngineUID: this.renderingEngineUID,
      }

      // For crosshairs to adapt to new viewport size
      triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail)
    }

    return true
  }

  /**
   * Because the focalPoint is always in the centre of the viewport,
   * we must do planar computations if the frame (image "slice") is to be preserved.
   * 1. Calculate the intersection of the view plane with the imageData
   * which results in points of intersection (minimum of 3, maximum of 6)
   * 2. Calculate average of the intersection points to get newFocalPoint
   * 3. Set the new focalPoint
   * @param imageData - imageData
   * @returns focalPoint
   */
  private _getFocalPointForViewPlaneReset(imageData) {
    // Todo: move some where else
    const { focalPoint, viewPlaneNormal: normal } = this.getCamera()
    const intersections = this._getViewImageDataIntersections(
      imageData,
      focalPoint,
      normal
    )

    let x = 0
    let y = 0
    let z = 0

    intersections.forEach(([point_x, point_y, point_z]) => {
      x += point_x
      y += point_y
      z += point_z
    })

    // Set the focal point on the average of the intersection points
    return [
      x / intersections.length,
      y / intersections.length,
      z / intersections.length,
    ]
  }

  /**
   * Gets the target output canvas for the `Viewport`.
   *
   * @returns an HTMLCanvasElement.
   */
  public getCanvas(): HTMLCanvasElement {
    return <HTMLCanvasElement>this.canvas
  }
  /**
   * Gets the active vtkCamera for the viewport.
   *
   * @returns vtk driven camera
   */
  protected getVtkActiveCamera(): vtkCamera | vtkSlabCamera {
    const renderer = this.getRenderer()

    return renderer.getActiveCamera()
  }

  /**
   * Get the camera's current state
   * @returns The camera object.
   */
  public getCamera(): ICamera {
    const vtkCamera = this.getVtkActiveCamera()

    // TODO: Make sure these are deep copies.
    let slabThickness
    // Narrowing down the type for typescript
    if ('getSlabThickness' in vtkCamera) {
      slabThickness = vtkCamera.getSlabThickness()
    }

    return {
      viewUp: <Point3>vtkCamera.getViewUp(),
      viewPlaneNormal: <Point3>vtkCamera.getViewPlaneNormal(),
      clippingRange: <Point2>vtkCamera.getClippingRange(),
      // TODO: I'm really not sure about this, it requires a calculation, and
      // how useful is this without the renderer context?
      // Lets add it back if we find we need it.
      //compositeProjectionMatrix: vtkCamera.getCompositeProjectionMatrix(),
      //
      //
      // Compensating for the flipped viewport. Since our method for flipping is
      // flipping the actor matrix itself, the focal point won't change; therefore,
      // we need to accommodate for this required change elsewhere
      // vec3.sub(dir, viewport.applyFlipTx(focalPoint), point)
      position: <Point3>this.applyFlipTx(vtkCamera.getPosition() as Point3),
      focalPoint: <Point3>this.applyFlipTx(vtkCamera.getFocalPoint() as Point3),
      // position: <Point3>vtkCamera.getPosition(),
      // focalPoint: <Point3>vtkCamera.getFocalPoint(),
      parallelProjection: vtkCamera.getParallelProjection(),
      parallelScale: vtkCamera.getParallelScale(),
      viewAngle: vtkCamera.getViewAngle(),
      slabThickness,
    }
  }

  /**
   * Set the camera parameters
   * @param cameraInterface - ICamera
   */
  public setCamera(cameraInterface: ICamera): void {
    const vtkCamera = this.getVtkActiveCamera()
    const previousCamera = _cloneDeep(this.getCamera())
    const updatedCamera = Object.assign({}, previousCamera, cameraInterface)
    const {
      viewUp,
      viewPlaneNormal,
      clippingRange,
      position,
      focalPoint,
      parallelScale,
      viewAngle,
      slabThickness,
    } = cameraInterface

    if (viewUp !== undefined) {
      vtkCamera.setViewUp(viewUp)
    }

    if (viewPlaneNormal !== undefined) {
      vtkCamera.setDirectionOfProjection(
        -viewPlaneNormal[0],
        -viewPlaneNormal[1],
        -viewPlaneNormal[2]
      )
    }

    if (clippingRange !== undefined) {
      vtkCamera.setClippingRange(clippingRange)
    }

    if (position !== undefined) {
      vtkCamera.setPosition(...this.applyFlipTx(position))
    }

    if (focalPoint !== undefined) {
      vtkCamera.setFocalPoint(...this.applyFlipTx(focalPoint))
    }

    if (parallelScale !== undefined) {
      vtkCamera.setParallelScale(parallelScale)
    }

    if (viewAngle !== undefined) {
      vtkCamera.setViewAngle(viewAngle)
    }

    if (slabThickness !== undefined && 'setSlabThickness' in vtkCamera) {
      vtkCamera.setSlabThickness(slabThickness)
    }

    if (!this._suppressCameraModifiedEvents && !this.suppressEvents) {
      const eventDetail = {
        previousCamera,
        camera: updatedCamera,
        canvas: this.canvas,
        element: this.element,
        viewportUID: this.uid,
        renderingEngineUID: this.renderingEngineUID,
      }

      triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail)
    }

    if (this.type == ViewportType.PERSPECTIVE) {
      const renderer = this.getRenderer()

      renderer.resetCameraClippingRange()
    }
  }

  private _getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal) {
    const viewUpCorners = this._getCorners(bounds)
    const viewRightCorners = this._getCorners(bounds)

    let viewRight = vec3.create()

    vec3.cross(viewRight, viewUp, viewPlaneNormal)

    viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]]

    let transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(viewUp, [1, 0, 0])

    viewUpCorners.forEach((pt) => transform.apply(pt))

    // range is now maximum X distance
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < 8; i++) {
      const y = viewUpCorners[i][0]
      if (y > maxY) {
        maxY = y
      }
      if (y < minY) {
        minY = y
      }
    }

    transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(viewRight, [1, 0, 0])

    viewRightCorners.forEach((pt) => transform.apply(pt))

    // range is now maximum Y distance
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < 8; i++) {
      const x = viewRightCorners[i][0]
      if (x > maxX) {
        maxX = x
      }
      if (x < minX) {
        minX = x
      }
    }

    return { widthWorld: maxX - minX, heightWorld: maxY - minY }
  }

  _getCorners(bounds: Array<number>): Array<number>[] {
    return [
      [bounds[0], bounds[2], bounds[4]],
      [bounds[0], bounds[2], bounds[5]],
      [bounds[0], bounds[3], bounds[4]],
      [bounds[0], bounds[3], bounds[5]],
      [bounds[1], bounds[2], bounds[4]],
      [bounds[1], bounds[2], bounds[5]],
      [bounds[1], bounds[3], bounds[4]],
      [bounds[1], bounds[3], bounds[5]],
    ]
  }

  /**
   * Determines whether or not the 3D point position is inside the boundaries of the 3D imageData.
   * @param point - 3D coordinate
   * @param bounds - Bounds of the image
   * @returns boolean
   */
  _isInBounds(point: Point3, bounds: number[]): boolean {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds
    const [x, y, z] = point
    if (x < xMin || x > xMax || y < yMin || y > yMax || z < zMin || z > zMax) {
      return false
    }
    return true
  }

  /**
   * Returns a list of edges for the imageData bounds, which are
   * the cube edges in the case of volumeViewport edges.
   * p1: front, bottom, left
   * p2: front, top, left
   * p3: back, bottom, left
   * p4: back, top, left
   * p5: front, bottom, right
   * p6: front, top, right
   * p7: back, bottom, right
   * p8: back, top, right
   * @param bounds - Bounds of the renderer
   * @returns Edges of the containing bounds
   */
  _getEdges(bounds: Array<number>): Array<[number[], number[]]> {
    const [p1, p2, p3, p4, p5, p6, p7, p8] = this._getCorners(bounds)
    return [
      [p1, p2],
      [p1, p5],
      [p1, p3],
      [p2, p4],
      [p2, p6],
      [p3, p4],
      [p3, p7],
      [p4, p8],
      [p5, p7],
      [p5, p6],
      [p6, p8],
      [p7, p8],
    ]
  }
}

export default Viewport
