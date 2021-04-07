import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import metaData from '../metaData'
import Events from './../enums/events'
import Viewport from './Viewport'
import VIEWPORT_TYPE from './../constants/viewportType'
import _cloneDeep from 'lodash.clonedeep'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import Scene, { VolumeActorEntry } from './Scene'
import triggerEvent from '../utilities/triggerEvent'
import { vec3 } from 'gl-matrix'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import {
  ViewportInputOptions,
  Point2,
  Point3,
  ViewportInput,
  IViewport,
  ICamera,
} from './../types'
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera'

import { loadAndCacheImage } from '../imageLoader'

/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
class StackViewport extends Viewport implements IViewport {
  private imageIds: Array<string>
  private currentImageIdIndex: number
  private _stackActors: Array<any>
  private imageData: any // vtk image data
  private windowRange: any // vtk image data

  constructor(props: ViewportInput) {
    super(props)
    const renderer = this.getRenderer()

    const camera = vtkCamera.newInstance()
    renderer.setActiveCamera(camera)

    const { sliceNormal, viewUp } = this.defaultOptions.orientation

    camera.setDirectionOfProjection(
      -sliceNormal[0],
      -sliceNormal[1],
      -sliceNormal[2]
    )
    camera.setViewUp(...viewUp)
    camera.setParallelProjection(true)
    // camera.setFreezeFocalPoint(true)
    this.imageIds = []
    this.currentImageIdIndex = 0
    this._stackActors = []
    this.windowRange = {}
    this.resetCamera()
  }

  // private sortDatasetsByImagePosition = (scanAxisNormal, imageMetaDataMap) => {
  //   // See https://github.com/dcmjs-org/dcmjs/blob/4849ed50db8788741c2773b3d9c75cc52441dbcb/src/normalizers.js#L167
  //   // TODO: Find a way to make this code generic?

  //   const datasets = Array.from(imageMetaDataMap.values())
  //   const referenceDataset = datasets[0]

  //   const distanceDatasetPairs = datasets.map((dataset) => {
  //     const positionVector = vec3.sub(
  //       [],
  //       referenceDataset.imagePositionPatient,
  //       dataset.imagePositionPatient
  //     )
  //     const distance = vec3.dot(positionVector, scanAxisNormal)

  //     return {
  //       distance,
  //       dataset,
  //     }
  //   })

  //   distanceDatasetPairs.sort((a, b) => b.distance - a.distance)

  //   const sortedDatasets = distanceDatasetPairs.map((a) => a.dataset)
  //   const distances = distanceDatasetPairs.map((a) => a.distance)

  //   // TODO: The way we calculate spacing determines how the volume shows up if
  //   // we have missing slices.
  //   // - Should we just bail out for now if missing slices are present?
  //   // const spacing = mean(diff(distances));
  //   const spacing = Math.abs(distances[1] - distances[0])

  //   return {
  //     spacing,
  //     origin: distanceDatasetPairs[0].dataset.imagePositionPatient,
  //     sortedDatasets,
  //   }
  // }

  private createActorMapper = (imageData) => {
    const mapper = vtkVolumeMapper.newInstance()
    mapper.setInputData(imageData)
    mapper.setSampleDistance(1.0)

    const actor = vtkVolume.newInstance()
    actor.setMapper(mapper)

    // const sampleDistance =
    //   1.2 *
    //   Math.sqrt(
    //     imageData
    //       .getSpacing()
    //       .map((v) => v * v)
    //       .reduce((a, b) => a + b, 0)
    //   )

    // mapper.setSampleDistance(sampleDistance)

    if (imageData.getPointData().getNumberOfComponents() !== 3) {
      const tfunc = actor.getProperty().getRGBTransferFunction(0)

      if (!this.windowRange.lower || !this.windowRange.upper) {
        // setting range for the first time
        const range = imageData.getPointData().getScalars().getRange()
        tfunc.setRange(range[0], range[1])
        this.windowRange.lower = range[0]
        this.windowRange.upper = range[1]
      } else {
        // keeping the viewport range for a new image
        tfunc.setRange(this.windowRange.lower, this.windowRange.upper)
      }
    } else {
      actor.getProperty().setIndependentComponents(false)
      actor.getProperty().setInterpolationTypeToNearest()
    }

    return actor
  }

  private buildMetadata(imageId) {
    // const imageId = imageIds[0]

    const {
      pixelRepresentation,
      bitsAllocated,
      bitsStored,
      highBit,
      photometricInterpretation,
      samplesPerPixel,
    } = metaData.get('imagePixelModule', imageId)

    let { windowWidth, windowCenter } = metaData.get('voiLutModule', imageId)

    // TODO maybe expose voi lut lists?
    if (Array.isArray(windowWidth)) {
      windowWidth = windowWidth[0]
    }

    if (Array.isArray(windowCenter)) {
      windowCenter = windowCenter[0]
    }

    const { modality } = metaData.get('generalSeriesModule', imageId)

    // Compute the image size and spacing given the meta data we already have available.
    // const metaDataMap = new Map()
    // imageIds.forEach((imageId) => {
    //   metaDataMap.set(imageId, metaData.get('imagePlaneModule', imageId))
    // })

    return {
      imagePlaneModule: metaData.get('imagePlaneModule', imageId),
      // metaDataMap,
      imagePixelModule: {
        bitsAllocated,
        bitsStored,
        samplesPerPixel,
        highBit,
        photometricInterpretation,
        pixelRepresentation,
        windowWidth,
        windowCenter,
        modality,
      },
    }
  }

  private _createVTKImageData(imageId: string, imageIds) {
    // todo: explore replacing the texture later
    const { imagePlaneModule, imagePixelModule } = this.buildMetadata(imageId)

    const { rowCosines, columnCosines } = imagePlaneModule
    const rowCosineVec = vec3.fromValues(...rowCosines)
    const colCosineVec = vec3.fromValues(...columnCosines)
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    const origin = imagePlaneModule.imagePositionPatient

    // const { spacing, origin } = this.sortDatasetsByImagePosition(
    //   scanAxisNormal,
    //   metaDataMap
    // )

    const xSpacing = imagePlaneModule.columnPixelSpacing
    const ySpacing = imagePlaneModule.rowPixelSpacing
    const zSpacing = 1 // Todo
    const xVoxels = imagePlaneModule.columns
    const yVoxels = imagePlaneModule.rows
    const zVoxels = 2 // metaDataMap.size;

    let numberOfComponents = 1
    if (imagePixelModule.photometricInterpretation === 'RGB') {
      numberOfComponents = 3
    }

    let pixelArray
    switch (imagePixelModule.bitsAllocated) {
      case 8:
        throw new Error('8 Bit images are not yet supported by this plugin.')
      case 16:
        pixelArray = new Float32Array(xVoxels * yVoxels * zVoxels)

        break
      case 24:
        pixelArray = new Uint8ClampedArray(xVoxels * yVoxels * zVoxels * 3)

        break
      default:
        console.debug('bit allocation not implemented')
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: numberOfComponents,
      values: pixelArray,
    })

    const imageData = vtkImageData.newInstance()
    const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal]

    imageData.setDimensions(xVoxels, yVoxels, zVoxels)
    imageData.setSpacing(xSpacing, ySpacing, zSpacing)
    imageData.setDirection(direction)
    imageData.setOrigin(...origin)
    imageData.getPointData().setScalars(scalarArray)
    return imageData
  }

  public async setStack(imageIds: Array<string>, currentImageIdIndex = 0): any {
    this.imageIds = imageIds
    this.currentImageIdIndex = currentImageIdIndex

    const imageId = this.imageIds[currentImageIdIndex]
    const imageData = this._createVTKImageData(imageId, this.imageIds)
    this.imageData = imageData

    // TODO: Question... should setting the stack actually cause a render?
    const image = await loadAndCacheImage(imageId, {})

    const pixels = image.getPixelData()
    // Set the VTK Image Data TypedArray data from the pixel data array
    // provided from the Cornerstone Image
    const scalars = imageData.getPointData().getScalars()
    const scalarData = scalars.getData()

    if (image.color) {
      // RGB case
      let j = 0
      for (let i = 0; i < pixels.length; i += 4) {
        scalarData[j] = pixels[i]
        scalarData[j + 1] = pixels[i + 1]
        scalarData[j + 2] = pixels[i + 2]
        j += 3
      }
    } else {
      scalarData.set(pixels)
    }

    const stackActor = this.createActorMapper(this.imageData)

    const renderer = this.getRenderer()
    renderer.addActor(stackActor)
    this._stackActors.push({ volumeActor: stackActor, uid: this.uid })

    this.resetCamera()

    this.render()
  }

  public setWindowRange(range) {
    this.windowRange = Object.assign({}, range)
  }

  public getStackActors() {
    return this._stackActors
  }

  private _checkIfSameImageData(image, imageData) {
    const [xSpacing, ySpacing, zSpacing] = imageData.getSpacing()
    const [xVoxels, yVoxels, zVoxels] = imageData.getDimensions()

    // using spacing and size only for now
    if (
      xSpacing !== image.rowSpacing ||
      ySpacing !== image.columnSpacing ||
      xVoxels !== image.rows ||
      yVoxels !== image.columns
    ) {
      return false
    }
    return true
  }

  public setImageIdIndex(imageIdIndex: number) {
    if (this.currentImageIdIndex === imageIdIndex) return
    //
    const { imageIds, imageData } = this

    const imageId = this.imageIds[imageIdIndex]

    const imagePromise = loadAndCacheImage(imageId, {})

    // Set the VTK Image Data TypedArray data from the pixel data array
    // provided from the Cornerstone Image
    const scalars = this.imageData.getPointData().getScalars()
    let scalarData = scalars.getData()

    imagePromise.then((image) => {
      // check if the new image is the same size of the previous one
      // window.image = image
      // window.imageData = imageData

      const sameImageData = this._checkIfSameImageData(image, imageData)
      if (!sameImageData) {
        const newImageData = this._createVTKImageData(imageId, imageIds)
        this.imageData = newImageData
        const scalars = this.imageData.getPointData().getScalars()
        scalarData = scalars.getData()
      }

      const pixels = image.getPixelData()
      if (image.color) {
        // RGB case
        let j = 0
        for (let i = 0; i < pixels.length; i += 4) {
          scalarData[j] = pixels[i]
          scalarData[j + 1] = pixels[i + 1]
          scalarData[j + 2] = pixels[i + 2]
          j += 3
        }
      } else {
        scalarData.set(pixels)
      }

      const renderer = this.getRenderer()

      // Todo: handle more than one stack actor by uids
      const volumes = renderer.getVolumes()
      const prevStackActor = volumes[0]

      volumes.forEach((volume) => {
        renderer.removeViewProp(volume)
      })

      // removing previous actor
      const index = this._stackActors.findIndex(
        (stackActor) => stackActor.volumeActor === prevStackActor
      )
      if (index > -1) this._stackActors.splice(index, 1)

      // adding new actor
      const stackActor = this.createActorMapper(this.imageData)
      renderer.addActor(stackActor)
      this._stackActors.push({ volumeActor: stackActor, uid: this.uid })

      if (!sameImageData) {
        this.resetCamera()
      }

      this.render()
      this.currentImageIdIndex = imageIdIndex
    })
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
    // implementation
  }

  public getFrameOfReferenceUID(): string {
    // TODO: Implement this instead of having it at the
    return 'blah'
  }
}

export default StackViewport
