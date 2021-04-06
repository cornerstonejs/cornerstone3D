import Events from './../enums/events'
import Viewport from './Viewport'
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
import { ViewportInputOptions, Point2, Point3 } from './../types'
import vtkSlabCamera from './vtkClasses/vtkSlabCamera'

/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
class StackViewport extends Viewport implements IViewport {
  constructor(props: IViewport) {
    super(props)
    const renderer = this.getRenderer()

    const camera = vtkSlabCamera.newInstance()
    renderer.setActiveCamera(camera)

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
   * @method _setVolumeActors Attaches the volume actors to the viewport.
   *
   * @param {Array<VolumeActorEntry>} volumeActorEntries The volume actors to add the viewport.
   *
   * NOTE: overwrites the slab thickness value in the options if one of the actor has a higher value
   */
  // public _setVolumeActors(volumeActorEntries: Array<VolumeActorEntry>) {
  //   const renderer = this.getRenderer()

  //   volumeActorEntries.forEach((va) => renderer.addActor(va.volumeActor))

  //   let slabThickness = null
  //   if (this.type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
  //     volumeActorEntries.forEach((va) => {
  //       if (va.slabThickness && va.slabThickness > slabThickness) {
  //         slabThickness = va.slabThickness
  //       }
  //     })

  //     this.resetCamera()

  //     const activeCamera = renderer.getActiveCamera()

  //     // This is necessary to initialize the clipping range and it is not related
  //     // to our custom slabThickness.
  //     activeCamera.setThicknessFromFocalPoint(0.1)
  //     // This is necessary to give the slab thickness.
  //     // NOTE: our custom camera implementation has an additional slab thickness
  //     // values to handle MIP and non MIP volumes in the same viewport.
  //     activeCamera.setSlabThickness(slabThickness)
  //     activeCamera.setFreezeFocalPoint(true)
  //   } else {
  //     // Use default renderer resetCamera, fits bounding sphere of data.
  //     renderer.resetCamera()

  //     const activeCamera = renderer.getActiveCamera()

  //     activeCamera.setFreezeFocalPoint(true)
  //   }
  // }

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {}

  /**
   * @canvasToWorld Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {}
}

export default StackViewport
