import Events from './../enums/events'
import VIEWPORT_TYPE from './../constants/viewportType'
import { IViewport, ICamera } from './../types'
import _cloneDeep from 'lodash.clonedeep'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import Scene, { VolumeActorEntry } from './Scene'
import triggerEvent from '../utilities/triggerEvent'
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math'
import { vec3 } from 'gl-matrix'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import { ViewportInput, Point2, Point3 } from './../types'
import vtkSlabCamera from './vtkClasses/vtkSlabCamera'
import Viewport from './Viewport'

/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
class VolumeViewport extends Viewport implements IViewport {
  constructor(props: ViewportInput) {
    super(props)

    const renderer = this.getRenderer()

    const camera = vtkSlabCamera.newInstance()
    renderer.setActiveCamera(camera)

    switch (this.type) {
      case VIEWPORT_TYPE.ORTHOGRAPHIC:
        camera.setParallelProjection(true)
        break
      case VIEWPORT_TYPE.PERSPECTIVE:
        camera.setParallelProjection(false)
        break
      default:
        throw new Error(`Unrecognized viewport type: ${this.type}`)
    }

    const { sliceNormal, viewUp } = this.defaultOptions.orientation

    camera.setDirectionOfProjection(
      -sliceNormal[0],
      -sliceNormal[1],
      -sliceNormal[2]
    )
    camera.setViewUp(...viewUp)
    camera.setFreezeFocalPoint(true)

    this.resetCamera()
  }

  /**
   * @method Sets the slab thickness option in the `Viewport`'s `options`.
   *
   * @param {number} [slabThickness]
   */
  public setSlabThickness(slabThickness: number): void {
    this.setCamera({
      slabThickness,
    })
  }

  /**
   * @method Gets the slab thickness option in the `Viewport`'s `options`.
   *
   * @returns {number} [slabThickness]
   */
  public getSlabThickness(): number {
    const { slabThickness } = this.getCamera()
    return slabThickness
  }

  /**
   * @method getScene Gets the `Scene` object that the `Viewport` is associated with.
   *
   * @returns {Scene} The `Scene` object.
   */
  public getScene(): Scene {
    const renderingEngine = this.getRenderingEngine()

    return renderingEngine.getScene(this.sceneUID)
  }

  /**
   * @method _setVolumeActors Attaches the volume actors to the viewport.
   *
   * @param {Array<VolumeActorEntry>} volumeActorEntries The volume actors to add the viewport.
   *
   * NOTE: overwrites the slab thickness value in the options if one of the actor has a higher value
   */
  public _setVolumeActors(volumeActorEntries: Array<VolumeActorEntry>): void {
    const renderer = this.getRenderer()

    volumeActorEntries.forEach((va) => renderer.addActor(va.volumeActor))

    let slabThickness = null
    if (this.type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
      volumeActorEntries.forEach((va) => {
        if (va.slabThickness && va.slabThickness > slabThickness) {
          slabThickness = va.slabThickness
        }
      })

      this.resetCamera()

      const activeCamera = renderer.getActiveCamera()

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      activeCamera.setThicknessFromFocalPoint(0.1)
      // This is necessary to give the slab thickness.
      // NOTE: our custom camera implementation has an additional slab thickness
      // values to handle MIP and non MIP volumes in the same viewport.
      activeCamera.setSlabThickness(slabThickness)
      activeCamera.setFreezeFocalPoint(true)
    } else {
      // Use default renderer resetCamera, fits bounding sphere of data.
      renderer.resetCamera()

      const activeCamera = renderer.getActiveCamera()

      activeCamera.setFreezeFocalPoint(true)
    }
  }

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const vtkCamera = this.getVtkActiveCamera()
    const slabThicknessActive = vtkCamera.getSlabThicknessActive()
    // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
    // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
    // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
    // (where we don't need our custom getProjectionMatrix)
    // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper
    vtkCamera.setSlabThicknessActive(false)

    const renderer = this.getRenderer()
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const size = openGLRenderWindow.getSize()
    const displayCoord = [canvasPos[0] + this.sx, canvasPos[1] + this.sy]

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1]

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    )

    vtkCamera.setSlabThicknessActive(slabThicknessActive)

    return worldCoord
  }

  /**
   * @canvasToWorld Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const vtkCamera = this.getVtkActiveCamera()
    const slabThicknessActive = vtkCamera.getSlabThicknessActive()
    // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
    // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
    // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
    // (where we don't need our custom getProjectionMatrix)
    // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper
    vtkCamera.setSlabThicknessActive(false)

    const renderer = this.getRenderer()
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const size = openGLRenderWindow.getSize()
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
      renderer
    )

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1]

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ]

    vtkCamera.setSlabThicknessActive(slabThicknessActive)

    return canvasCoord
  }

  getFrameOfReferenceUID(): string {
    // TODO: Implement this instead of having it at the
    return 'blah'
  }
}

export default VolumeViewport
