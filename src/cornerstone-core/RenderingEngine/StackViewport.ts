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
    // camera.setFreezeFocalPoint(true)
    this.imageIds = []
    this.currentImageIdIndex = 0
    this.resetCamera()
  }

  private sortDatasetsByImagePosition = (scanAxisNormal, imageMetaDataMap) => {
    // See https://github.com/dcmjs-org/dcmjs/blob/4849ed50db8788741c2773b3d9c75cc52441dbcb/src/normalizers.js#L167
    // TODO: Find a way to make this code generic?

    const datasets = Array.from(imageMetaDataMap.values())
    const referenceDataset = datasets[0]

    const distanceDatasetPairs = datasets.map((dataset) => {
      const positionVector = vec3.sub(
        [],
        referenceDataset.imagePositionPatient,
        dataset.imagePositionPatient
      )
      const distance = vec3.dot(positionVector, scanAxisNormal)

      return {
        distance,
        dataset,
      }
    })

    distanceDatasetPairs.sort((a, b) => b.distance - a.distance)

    const sortedDatasets = distanceDatasetPairs.map((a) => a.dataset)
    const distances = distanceDatasetPairs.map((a) => a.distance)

    // TODO: The way we calculate spacing determines how the volume shows up if
    // we have missing slices.
    // - Should we just bail out for now if missing slices are present?
    // const spacing = mean(diff(distances));
    const spacing = Math.abs(distances[1] - distances[0])

    return {
      spacing,
      origin: distanceDatasetPairs[0].dataset.imagePositionPatient,
      sortedDatasets,
    }
  }

  private createActorMapper = (imageData) => {
    const mapper = vtkVolumeMapper.newInstance()
    mapper.setInputData(imageData)
    mapper.setSampleDistance(1.0)

    const actor = vtkVolume.newInstance()
    actor.setMapper(mapper)

    const sampleDistance =
      1.2 *
      Math.sqrt(
        imageData
          .getSpacing()
          .map((v) => v * v)
          .reduce((a, b) => a + b, 0)
      )

    const range = imageData.getPointData().getScalars().getRange()
    actor.getProperty().getRGBTransferFunction(0).setRange(range[0], range[1])

    mapper.setSampleDistance(sampleDistance)

    return actor
  }

  private buildMetadata(imageIds) {
    const imageId0 = imageIds[0]

    const {
      pixelRepresentation,
      bitsAllocated,
      bitsStored,
      highBit,
      photometricInterpretation,
      samplesPerPixel,
    } = metaData.get('imagePixelModule', imageId0)

    let { windowWidth, windowCenter } = metaData.get('voiLutModule', imageId0)

    // TODO maybe expose voi lut lists?
    if (Array.isArray(windowWidth)) {
      windowWidth = windowWidth[0]
    }

    if (Array.isArray(windowCenter)) {
      windowCenter = windowCenter[0]
    }

    const { modality } = metaData.get('generalSeriesModule', imageId0)

    // Compute the image size and spacing given the meta data we already have available.
    const metaDataMap = new Map()
    imageIds.forEach((imageId) => {
      metaDataMap.set(imageId, metaData.get('imagePlaneModule', imageId))
    })

    return {
      metaData0: metaDataMap.values().next().value,
      metaDataMap,
      imageIds,
      imageMetaData0: {
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
    const { metaData0, metaDataMap, imageMetaData0 } = this.buildMetadata(
      imageIds // TODO: Why doens't this work right if we only give [imageId]? Shader crashes.
    )

    const { rowCosines, columnCosines } = metaData0
    const rowCosineVec = vec3.fromValues(...rowCosines)
    const colCosineVec = vec3.fromValues(...columnCosines)
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    const { spacing, origin } = this.sortDatasetsByImagePosition(
      scanAxisNormal,
      metaDataMap
    )

    const xSpacing = metaData0.columnPixelSpacing
    const ySpacing = metaData0.rowPixelSpacing
    const zSpacing = spacing
    const xVoxels = metaData0.columns
    const yVoxels = metaData0.rows
    const zVoxels = 2 // metaDataMap.size;

    let pixelArray
    switch (imageMetaData0.bitsAllocated) {
      case 8:
        throw new Error('8 Bit images are not yet supported by this plugin.')
      case 16:
        pixelArray = new Float32Array(xVoxels * yVoxels * zVoxels)

        break
      default:
        console.debug('bit allocation not implemented')
    }
    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
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

    // TODO: Question... should setting the stack actually cause a render?
    const image = await loadAndCacheImage(imageId, {})
    const pixels = image.getPixelData()

    // Set the VTK Image Data TypedArray data from the pixel data array
    // provided from the Cornerstone Image
    const scalars = imageData.getPointData().getScalars()
    const scalarData = scalars.getData()
    scalarData.set(pixels)

    const volActor = this.createActorMapper(imageData)
    // Todo : add to actors

    const renderer = this.getRenderer()
    renderer.addActor(volActor)

    this.resetCamera()

    this.render()
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
    // implementation
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
