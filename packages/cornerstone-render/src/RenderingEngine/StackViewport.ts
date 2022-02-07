import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import _cloneDeep from 'lodash.clonedeep'
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera'
import { vec2, vec3 } from 'gl-matrix'

import metaData from '../metaData'
import Viewport from './Viewport'
import eventTarget from '../eventTarget'
import EVENTS from '../enums/events'
import {
  triggerEvent,
  isEqual,
  invertRgbTransferFunction,
  windowLevel as windowLevelUtil,
} from '../utilities'
import {
  Point2,
  Point3,
  ViewportInput,
  VOIRange,
  ICamera,
  IImage,
  ScalingParameters,
  IImageData,
  CPUIImageData,
  PetScaling,
  Scaling,
  StackProperties,
  FlipDirection,
  ActorEntry,
  CPUFallbackEnabledElement,
  CPUFallbackColormapData,
} from '../types'
import drawImageSync from './helpers/cpuFallback/drawImageSync'
import { getColormap } from './helpers/cpuFallback/colors/index'

import { loadAndCacheImage } from '../imageLoader'
import requestPoolManager from '../requestPool/requestPoolManager'
import ERROR_CODES from '../enums/errorCodes'
import INTERPOLATION_TYPE from '../constants/interpolationType'
import canvasToPixel from './helpers/cpuFallback/rendering/canvasToPixel'
import pixelToCanvas from './helpers/cpuFallback/rendering/pixelToCanvas'
import getDefaultViewport from './helpers/cpuFallback/rendering/getDefaultViewport'
import calculateTransform from './helpers/cpuFallback/rendering/calculateTransform'
import resize from './helpers/cpuFallback/rendering/resize'

import resetCamera from './helpers/cpuFallback/rendering/resetCamera'
import { Transform } from './helpers/cpuFallback/rendering/transform'
import { getShouldUseCPURendering } from '../init'

const EPSILON = 1 // Slice Thickness

interface ImageDataMetaData {
  bitsAllocated: number
  numComps: number
  origin: Point3
  direction: Float32Array
  dimensions: Point3
  spacing: Point3
  numVoxels: number
  imagePlaneModule: unknown
  imagePixelModule: unknown
}

// TODO This needs to be exposed as its published to consumers.
type CalibrationEvent = {
  rowScale: number
  columnScale: number
}

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal scene, and an associated target output `canvas`.
 */
class StackViewport extends Viewport {
  // Viewport Data
  private imageIds: Array<string>
  private currentImageIdIndex: number

  // Viewport Properties
  private voiRange: VOIRange
  private invert = false
  private interpolationType: number
  private rotation = 0

  // Helpers
  private _imageData: vtkImageData
  private cameraPosOnRender: Point3
  private stackInvalidated = false // if true -> new actor is forced to be created for the stack
  private panCache: Point3
  private shouldFlip = false
  private voiApplied = false
  private rotationCache = 0
  private _publishCalibratedEvent = false
  private _calibrationEvent: CalibrationEvent
  private _cpuFallbackEnabledElement?: CPUFallbackEnabledElement
  // CPU fallback
  private useCPURendering: boolean
  private cpuImagePixelData: number[]
  private cpuRenderingInvalidated: boolean

  // TODO: These should not be here and will be nuked
  public modality: string // this is needed for tools
  public scaling: Scaling

  constructor(props: ViewportInput) {
    super(props)
    this.scaling = {}
    this.modality = null
    this.useCPURendering = getShouldUseCPURendering()

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement = {
        canvas: this.canvas,
        renderingTools: {},
        transform: new Transform(),
        viewport: {},
      }
    } else {
      const renderer = this.getRenderer()
      const camera = vtkCamera.newInstance()
      renderer.setActiveCamera(camera)

      const sliceNormal = <Point3>[0, 0, -1]
      const viewUp = <Point3>[0, -1, 0]

      camera.setDirectionOfProjection(
        -sliceNormal[0],
        -sliceNormal[1],
        -sliceNormal[2]
      )
      camera.setViewUp(...viewUp)
      camera.setParallelProjection(true)
      // @ts-ignore: vtkjs incorrect typing
      camera.setFreezeFocalPoint(true)
    }

    this.imageIds = []
    this.currentImageIdIndex = 0
    this.panCache = [0, 0, 0]
    this.cameraPosOnRender = [0, 0, 0]
    this.resetCamera()
  }

  /**
   * Custom resize method
   */
  public resize = (): void => {
    // GPU viewport resize is handled inside the RenderingEngine
    if (this.useCPURendering) {
      this._resizeCPU()
    }
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(): IImageData | CPUIImageData {
    if (this.useCPURendering) {
      return this.getImageDataCPU()
    } else {
      return this.getImageDataGPU()
    }
  }

  private _resizeCPU = (): void => {
    if (this._cpuFallbackEnabledElement.viewport) {
      resize(this._cpuFallbackEnabledElement)
    }
  }

  private getImageDataGPU(): IImageData | undefined {
    const actor = this.getDefaultActor()

    if (!actor) {
      return
    }

    const { volumeActor } = actor
    const vtkImageData = volumeActor.getMapper().getInputData()
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      imageData: volumeActor.getMapper().getInputData(),
      metadata: { Modality: this.modality },
      scaling: this.scaling,
    }
  }

  private getImageDataCPU(): CPUIImageData | undefined {
    const { metadata } = this._cpuFallbackEnabledElement

    return {
      dimensions: metadata.dimensions as Point3,
      spacing: metadata.spacing as Point3,
      origin: metadata.origin as Point3,
      direction: metadata.direction as Float32Array,
      metadata: { Modality: this.modality },
      scaling: this.scaling,
      imageData: {
        worldToIndex: (point: Point3) => {
          const canvasPoint = this.worldToCanvasCPU(point)
          const pixelCoord = canvasToPixel(
            this._cpuFallbackEnabledElement,
            canvasPoint
          )
          return [pixelCoord[0], pixelCoord[1], 0]
        },
        indexToWorld: (point: Point3) => {
          const canvasPoint = pixelToCanvas(this._cpuFallbackEnabledElement, [
            point[0],
            point[1],
          ])
          return this.canvasToWorldCPU(canvasPoint)
        },
      },
      scalarData: this.cpuImagePixelData,
    }
  }

  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   * @returns frameOfReferenceUID : string representing frame of reference id
   */
  public getFrameOfReferenceUID = (): string | undefined => {
    // Get the current image that is displayed in the viewport
    const imageId = this.getCurrentImageId()

    if (!imageId) {
      return
    }

    // Use the metadata provider to grab its imagePlaneModule metadata
    const imagePlaneModule = metaData.get('imagePlaneModule', imageId)

    // If nothing exists, return undefined
    if (!imagePlaneModule) {
      return
    }

    // Otherwise, provide the FrameOfReferenceUID so we can map
    // annotations made on VolumeViewports back to StackViewports
    // and vice versa
    return imagePlaneModule.frameOfReferenceUID
  }

  /**
   * Creates a volume actor and volume mapper based on the provided vtkImageData
   * It sets the sampleDistance for the volumeMapper, and sets the actor VOI range
   * initially, and assigns it to the class property to be saved for future slices.
   * For color stack images, it sets the independent components to be false which
   * is required in vtk.
   *
   * @param imageData vtkImageData for the viewport
   * @returns actor vtkActor
   */
  private createActorMapper = (imageData) => {
    const mapper = vtkVolumeMapper.newInstance()
    mapper.setInputData(imageData)

    const actor = vtkVolume.newInstance()
    actor.setMapper(mapper)

    // We set the sample distance to vSize to not get warning
    const [xSize, ySize, zSize] = imageData.getDimensions()
    const [xSpacing, ySpacing, zSpacing] = imageData.getSpacing()
    const vSize = vec3.length([
      xSize * xSpacing,
      ySize * ySpacing,
      zSize * zSpacing,
    ])
    mapper.setSampleDistance(vSize / mapper.getMaximumSamplesPerRay())

    if (imageData.getPointData().getNumberOfComponents() > 1) {
      // @ts-ignore: vtkjs incorrect typing
      actor.getProperty().setIndependentComponents(false)
    }

    return actor
  }

  /**
   * Retrieves the metadata from the metadata provider, and optionally adds the
   * scaling to the viewport if modality is PET and scaling metadata is provided.
   *
   * @param imageId a string representing the imageId for the image
   * @returns imagePlaneModule and imagePixelModule containing the metadata for the image
   */
  private buildMetadata(imageId: string) {
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
    const imageIdScalingFactor = metaData.get('scalingModule', imageId)

    if (modality === 'PT' && imageIdScalingFactor) {
      this._addScalingToViewport(imageIdScalingFactor)
    }

    // todo: some tools rely on the modality
    this.modality = modality
    // Compute the image size and spacing given the meta data we already have available.
    // const metaDataMap = new Map()
    // imageIds.forEach((imageId) => {
    //   metaDataMap.set(imageId, metaData.get('imagePlaneModule', imageId))
    // })

    let imagePlaneModule = metaData.get('imagePlaneModule', imageId)

    // Todo: for now, it gives error for getImageData
    if (!this.useCPURendering) {
      imagePlaneModule = this.calibrateIfNecessary(imageId, imagePlaneModule)
    }

    return {
      imagePlaneModule,
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

  /**
   * Checks the metadataProviders to see if a calibratedPixelSpacing is
   * given. If so, checks the actor to see if it needs to be modified, and
   * set the flags for imageCalibration if a new actor needs to be created
   * @param imageId imageId
   * @param imagePlaneModule imaagePlaneModule
   * @returns modified imagePlaneModule with the calibrated spacings
   */
  private calibrateIfNecessary(imageId, imagePlaneModule) {
    const calibratedPixelSpacing = metaData.get(
      'calibratedPixelSpacing',
      imageId
    )

    if (!calibratedPixelSpacing) {
      return imagePlaneModule
    }

    const [calibratedRowSpacing, calibratedColumnSpacing] =
      calibratedPixelSpacing

    // Check if there is already an actor
    const imageDataMetadata = this.getImageData()

    // If no actor (first load) and calibration matches the dicom header
    if (
      !imageDataMetadata &&
      imagePlaneModule.rowPixelSpacing === calibratedRowSpacing &&
      imagePlaneModule.columnPixelSpacing === calibratedColumnSpacing
    ) {
      return imagePlaneModule
    }

    // If no actor (first load) and calibration doesn't match headers
    // -> needs calibration
    if (
      !imageDataMetadata &&
      (imagePlaneModule.rowPixelSpacing !== calibratedRowSpacing ||
        imagePlaneModule.columnPixelSpacing !== calibratedColumnSpacing)
    ) {
      this._publishCalibratedEvent = true

      this._calibrationEvent = <CalibrationEvent>{
        rowScale: calibratedRowSpacing / imagePlaneModule.rowPixelSpacing,
        columnScale:
          calibratedColumnSpacing / imagePlaneModule.columnPixelSpacing,
      }

      // modify imagePlaneModule for actor to use calibrated spacing
      imagePlaneModule.rowPixelSpacing = calibratedRowSpacing
      imagePlaneModule.columnPixelSpacing = calibratedColumnSpacing
      return imagePlaneModule
    }

    // If there is already an actor, check if calibration is needed for the current actor
    const { imageData } = imageDataMetadata
    const [columnPixelSpacing, rowPixelSpacing] = imageData.getSpacing()

    imagePlaneModule.rowPixelSpacing = calibratedRowSpacing
    imagePlaneModule.columnPixelSpacing = calibratedColumnSpacing

    // If current actor spacing matches the calibrated spacing
    if (
      rowPixelSpacing === calibratedRowSpacing &&
      columnPixelSpacing === calibratedPixelSpacing
    ) {
      // No calibration is required
      return imagePlaneModule
    }

    // Calibration is required
    this._publishCalibratedEvent = true

    this._calibrationEvent = <CalibrationEvent>{
      rowScale: calibratedRowSpacing / rowPixelSpacing,
      columnScale: calibratedColumnSpacing / columnPixelSpacing,
    }

    return imagePlaneModule
  }

  /**
   * Sets the properties for the viewport on the default actor. Properties include
   * setting the VOI, inverting the colors and setting the interpolation type
   * @param voiRange Sets the lower and upper voi
   * @param invert Inverts the colors
   * @param interpolationType Changes the interpolation type (1:linear, 0: nearest)
   */
  public setProperties({
    voiRange,
    invert,
    interpolationType,
    rotation,
    flipHorizontal,
    flipVertical,
  }: StackProperties = {}): void {
    // if voi is not applied for the first time, run the setVOI function
    // which will apply the default voi
    if (typeof voiRange !== 'undefined' || !this.voiApplied) {
      this.setVOI(voiRange)
    }

    if (typeof invert !== 'undefined') {
      this.setInvertColor(invert)
    }

    if (typeof interpolationType !== 'undefined') {
      this.setInterpolationType(interpolationType)
    }

    if (typeof rotation !== 'undefined') {
      if (this.rotationCache !== rotation) {
        this.setRotation(this.rotationCache, rotation)
      }
    }

    if (
      typeof flipHorizontal !== 'undefined' ||
      typeof flipVertical !== 'undefined'
    ) {
      this.setFlipDirection({ flipHorizontal, flipVertical })
    }
  }

  /**
   * Retrieve the viewport properties
   */
  public getProperties = (): StackProperties => {
    return {
      voiRange: this.voiRange,
      rotation: this.rotationCache,
      interpolationType: this.interpolationType,
      invert: this.invert,
      flipHorizontal: this.flipHorizontal,
      flipVertical: this.flipVertical,
    }
  }

  /**
   * Reset the viewport properties
   */
  public resetProperties(): void {
    this.cpuRenderingInvalidated = true

    this.fillWithBackgroundColor()

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement.renderingTools = {}
    }

    this._resetProperties()

    this.render()
  }

  public getCamera(): ICamera {
    if (this.useCPURendering) {
      return this.getCameraCPU()
    } else {
      return super.getCamera()
    }
  }

  public setCamera(cameraInterface: ICamera): void {
    if (this.useCPURendering) {
      this.setCameraCPU(cameraInterface)
    } else {
      super.setCamera(cameraInterface)
    }
  }

  private _resetProperties() {
    // to force the default voi to be applied on the next render
    this.voiApplied = false

    this.setProperties({
      voiRange: undefined,
      rotation: 0,
      interpolationType: INTERPOLATION_TYPE.LINEAR,
      invert: false,
      flipHorizontal: false,
      flipVertical: false,
    })
  }

  private _setPropertiesFromCache(): void {
    this.setProperties({
      voiRange: this.voiRange,
      rotation: this.rotation,
      interpolationType: this.interpolationType,
      invert: this.invert,
      flipHorizontal: this.flipHorizontal,
      flipVertical: this.flipVertical,
    })
  }

  private getCameraCPU(): Partial<ICamera> {
    const { metadata, viewport } = this._cpuFallbackEnabledElement

    const { direction } = metadata

    // focalPoint and position of CPU camera is just a placeholder since
    // tools need focalPoint to be defined
    const viewPlaneNormal = direction.slice(6, 9).map((x) => -x)
    const viewUp = direction.slice(3, 6).map((x) => -x)
    return {
      parallelProjection: true,
      focalPoint: [0, 0, 0],
      position: [0, 0, 0],
      parallelScale: viewport.scale,
      viewPlaneNormal: [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ],
      viewUp: [viewUp[0], viewUp[1], viewUp[2]],
    }
  }

  private setCameraCPU(cameraInterface: ICamera): void {
    const { viewport } = this._cpuFallbackEnabledElement
    const previousCamera = this.getCameraCPU()

    const { focalPoint, viewUp, parallelScale } = cameraInterface

    if (focalPoint) {
      const focalPointCanvas = this.worldToCanvasCPU(cameraInterface.focalPoint)
      const previousFocalPointCanvas = this.worldToCanvasCPU(
        previousCamera.focalPoint
      )

      const deltaCanvas = vec2.create()

      vec2.subtract(
        deltaCanvas,
        vec2.fromValues(
          previousFocalPointCanvas[0],
          previousFocalPointCanvas[1]
        ),
        vec2.fromValues(focalPointCanvas[0], focalPointCanvas[1])
      )

      viewport.translation.x += deltaCanvas[0] / previousCamera.parallelScale
      viewport.translation.y += deltaCanvas[1] / previousCamera.parallelScale
    }

    // If manipulating scale
    if (parallelScale && previousCamera.parallelScale !== parallelScale) {
      // Note: as parallel scale is defined differently to the GPU version,
      // We instead need to find the difference and move the camera in
      // the other direction in this adapter.

      const diff = previousCamera.parallelScale - parallelScale

      viewport.scale += diff // parallelScale; //viewport.scale < 0.1 ? 0.1 : viewport.scale;
    }

    const updatedCamera = {
      ...previousCamera,
      focalPoint,
      viewUp,
      parallelScale,
    }

    const eventDetail = {
      previousCamera,
      camera: updatedCamera,
      canvas: this.canvas,
      viewportUID: this.uid,
      renderingEngineUID: this.renderingEngineUID,
    }

    triggerEvent(this.canvas, EVENTS.CAMERA_MODIFIED, eventDetail)
  }

  private setFlipDirection(flipDirection: FlipDirection): void {
    if (this.useCPURendering) {
      this.setFlipCPU(flipDirection)
    } else {
      super.flip(flipDirection)
    }
    this.shouldFlip = false
  }

  private setFlipCPU({ flipHorizontal, flipVertical }: FlipDirection): void {
    const { viewport } = this._cpuFallbackEnabledElement

    if (typeof flipHorizontal !== 'undefined') {
      viewport.hflip = flipHorizontal
      this.flipHorizontal = viewport.hflip
    }

    if (typeof flipVertical !== 'undefined') {
      viewport.vflip = flipVertical
      this.flipVertical = viewport.vflip
    }
  }

  private setVOI(voiRange: VOIRange): void {
    if (this.useCPURendering) {
      this.setVOICPU(voiRange)
      return
    }

    this.setVOIGPU(voiRange)
  }

  private setRotation(rotationCache: number, rotation: number): void {
    if (this.useCPURendering) {
      this.setRotationCPU(rotationCache, rotation)
      return
    }

    this.setRotationGPU(rotationCache, rotation)
  }
  private setInterpolationType(interpolationType: number): void {
    if (this.useCPURendering) {
      this.setInterpolationTypeCPU(interpolationType)
      return
    }

    this.setInterpolationTypeGPU(interpolationType)
  }
  private setInvertColor(invert: boolean): void {
    if (this.useCPURendering) {
      this.setInvertColorCPU(invert)
      return
    }

    this.setInvertColorGPU(invert)
  }

  public setRotationCPU(rotationCache: number, rotation: number): void {
    const { viewport } = this._cpuFallbackEnabledElement

    viewport.rotation = rotation
    this.rotationCache = rotation
    this.rotation = rotation
  }

  public setRotationGPU(rotationCache: number, rotation: number): void {
    // Moving back to zero rotation, for new scrolled slice rotation is 0 after camera reset
    this.getVtkActiveCamera().roll(rotationCache)

    // rotating camera to the new value
    this.getVtkActiveCamera().roll(-rotation)
    this.rotationCache = rotation
    this.rotation = rotation
  }

  private setInterpolationTypeGPU(interpolationType: number): void {
    const actor = this.getDefaultActor()

    if (!actor) {
      return
    }

    const { volumeActor } = actor
    const volumeProperty = volumeActor.getProperty()
    volumeProperty.setInterpolationType(interpolationType)
    this.interpolationType = interpolationType
  }

  private setInterpolationTypeCPU(interpolationType: number): void {
    const { viewport } = this._cpuFallbackEnabledElement

    if (interpolationType === INTERPOLATION_TYPE.LINEAR) {
      viewport.pixelReplication = false
    } else {
      viewport.pixelReplication = true
    }
    this.interpolationType = interpolationType
  }

  private setInvertColorCPU(invert: boolean): void {
    const { viewport } = this._cpuFallbackEnabledElement

    if (!viewport) {
      return
    }

    viewport.invert = invert
    this.invert = invert
  }

  private setInvertColorGPU(invert: boolean): void {
    const actor = this.getDefaultActor()

    if (!actor) {
      return
    }

    const { volumeActor } = actor
    const tfunc = volumeActor.getProperty().getRGBTransferFunction(0)

    if ((!this.invert && invert) || (this.invert && !invert)) {
      invertRgbTransferFunction(tfunc)
    }
    this.invert = invert
  }

  private setVOICPU(voiRange: VOIRange): void {
    const { viewport, image } = this._cpuFallbackEnabledElement

    if (!viewport || !image) {
      return
    }

    if (typeof voiRange === 'undefined') {
      const { windowWidth: ww, windowCenter: wc } = image

      const wwToUse = Array.isArray(ww) ? ww[0] : ww
      const wcToUse = Array.isArray(wc) ? wc[0] : wc
      viewport.voi = {
        windowWidth: wwToUse,
        windowCenter: wcToUse,
      }

      const { lower, upper } = windowLevelUtil.toLowHighRange(wwToUse, wcToUse)
      this.voiRange = { lower, upper }
    } else {
      const { lower, upper } = voiRange
      const { windowCenter, windowWidth } = windowLevelUtil.toWindowLevel(
        lower,
        upper
      )

      if (!viewport.voi) {
        viewport.voi = {
          windowWidth: 0,
          windowCenter: 0,
        }
      }

      viewport.voi.windowWidth = windowWidth
      viewport.voi.windowCenter = windowCenter
      this.voiRange = voiRange
    }

    this.voiApplied = true
  }

  private setVOIGPU(voiRange: VOIRange): void {
    const actor = this.getDefaultActor()
    if (!actor) {
      return
    }

    const { volumeActor } = actor
    const tfunc = volumeActor.getProperty().getRGBTransferFunction(0)

    if (typeof voiRange === 'undefined') {
      const imageData = volumeActor.getMapper().getInputData()
      const range = imageData.getPointData().getScalars().getRange()
      tfunc.setRange(range[0], range[1])
      this.voiRange = { lower: range[0], upper: range[1] }
    } else {
      const { lower, upper } = voiRange
      tfunc.setRange(lower, upper)
      this.voiRange = voiRange
    }
    this.voiApplied = true
  }

  /**
   * Adds scaling parameters to the viewport to be used along all slices
   *
   * @param imageIdScalingFactor suvbw, suvlbm, suvbsa
   */
  private _addScalingToViewport(imageIdScalingFactor) {
    if (!this.scaling.PET) {
      // These ratios are constant across all frames, so only need one.
      const { suvbw, suvlbm, suvbsa } = imageIdScalingFactor

      const petScaling = <PetScaling>{}

      if (suvlbm) {
        petScaling.suvbwToSuvlbm = suvlbm / suvbw
      }

      if (suvbsa) {
        petScaling.suvbwToSuvbsa = suvbsa / suvbw
      }

      this.scaling.PET = petScaling
    }
  }

  /**
   * Calculates number of components based on the dicom metadata
   *
   * @param photometricInterpretation string dicom tag
   * @returns number representing number of components
   */
  private _getNumCompsFromPhotometricInterpretation(
    photometricInterpretation: string
  ): number {
    // TODO: this function will need to have more logic later
    // see http://dicom.nema.org/medical/Dicom/current/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.2
    let numberOfComponents = 1
    if (photometricInterpretation === 'RGB') {
      numberOfComponents = 3
    }

    return numberOfComponents
  }

  /**
   * Calculates image metadata based on the image object. It calculates normal
   * axis for the images, and output image metadata
   *
   * @param image stack image containing cornerstone image
   * @returns image metadata: { bitsAllocated, number of components, origin,
   *  direction, dimensions, spacing, number of voxels.}
   */
  private _getImageDataMetadata(image: IImage): ImageDataMetaData {
    // TODO: Creating a single image should probably not require a metadata provider.
    // We should define the minimum we need to display an image and it should live on
    // the Image object itself. Additional stuff (e.g. pixel spacing, direction, origin, etc)
    // should be optional and used if provided through a metadata provider.

    const { imagePlaneModule, imagePixelModule } = this.buildMetadata(
      image.imageId
    )

    let rowCosines, columnCosines

    rowCosines = <Point3>imagePlaneModule.rowCosines
    columnCosines = <Point3>imagePlaneModule.columnCosines

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = <Point3>[1, 0, 0]
      columnCosines = <Point3>[0, 1, 0]
    }

    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    )
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    )
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    let origin = imagePlaneModule.imagePositionPatient
    // if null or undefined
    if (origin == null) {
      origin = [0, 0, 0]
    }

    const xSpacing =
      imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing
    const ySpacing = imagePlaneModule.rowPixelSpacing || image.rowPixelSpacing
    const xVoxels = image.columns
    const yVoxels = image.rows

    const zSpacing = image.sliceThickness || EPSILON
    const zVoxels = 1

    const numComps =
      image.numComps ||
      this._getNumCompsFromPhotometricInterpretation(
        imagePixelModule.photometricInterpretation
      )

    return {
      bitsAllocated: imagePixelModule.bitsAllocated,
      numComps,
      origin,
      direction: new Float32Array([
        ...rowCosineVec,
        ...colCosineVec,
        ...scanAxisNormal,
      ]),
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
      imagePixelModule,
    }
  }

  /**
   * Converts the image direction to camera viewup and viewplaneNornaml
   *
   * @param imageDataDirection vtkImageData direction
   * @returns viewplane normal and viewUp of the camera
   */
  private _getCameraOrientation(imageDataDirection: Float32Array): {
    viewPlaneNormal: Point3
    viewUp: Point3
  } {
    const viewPlaneNormal = imageDataDirection.slice(6, 9).map((x) => -x)

    const viewUp = imageDataDirection.slice(3, 6).map((x) => -x)
    return {
      viewPlaneNormal: [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ],
      viewUp: [viewUp[0], viewUp[1], viewUp[2]],
    }
  }

  /**
   * Creates vtkImagedata based on the image object, it creates
   * and empty scalar data for the image based on the metadata
   * tags (e.g., bitsAllocated)
   *
   * @param image cornerstone Image object
   */
  private _createVTKImageData(image: IImage): void {
    const {
      origin,
      direction,
      dimensions,
      spacing,
      bitsAllocated,
      numComps,
      numVoxels,
    } = this._getImageDataMetadata(image)
    let pixelArray
    switch (bitsAllocated) {
      case 8:
        pixelArray = new Uint8Array(numVoxels)
        break

      case 16:
        pixelArray = new Float32Array(numVoxels)

        break
      case 24:
        pixelArray = new Uint8Array(numVoxels * 3)

        break
      default:
        console.debug('bit allocation not implemented')
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: numComps,
      values: pixelArray,
    })

    this._imageData = vtkImageData.newInstance()

    this._imageData.setDimensions(dimensions)
    this._imageData.setSpacing(spacing)
    this._imageData.setDirection(direction)
    this._imageData.setOrigin(origin)
    this._imageData.getPointData().setScalars(scalarArray)
  }

  /**
   * Sets the imageIds to be visualized inside the stack viewport. It accepts
   * list of imageIds, the index of the first imageId to be viewed, and the callbacks
   * to be run on the volume actors upon creaction. Invalidated property of
   * the viewport is set to be true so that a new actor is forced to be created
   *
   *
   * @param imageIds list of strings, that represents list of image Ids
   * @param currentImageIdIndex number representing the index of the initial image to be displayed
   * @param callbacks list of function that runs on the volume actor
   */
  public async setStack(
    imageIds: Array<string>,
    currentImageIdIndex = 0
  ): Promise<string> {
    this.imageIds = imageIds
    this.currentImageIdIndex = currentImageIdIndex
    this.stackInvalidated = true
    this.rotationCache = 0
    this.flipVertical = false
    this.flipHorizontal = false

    this._resetProperties()

    this.fillWithBackgroundColor()

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement.renderingTools = {}
      delete this._cpuFallbackEnabledElement.viewport.colormap
    }

    const imageId = await this._setImageIdIndex(currentImageIdIndex)
    return imageId
  }

  /**
   * It checks if the new image object matches the dimensions, spacing,
   * and direction of the previously displayed image in the viewport or not.
   * It returns a boolean
   *
   * @param image Cornerstone Image object
   * @param imageData vtkImageData
   * @returns boolean
   */
  private _checkVTKImageDataMatchesCornerstoneImage(
    image: IImage,
    imageData: vtkImageData
  ): boolean {
    if (!imageData) {
      return false
    }

    const [xSpacing, ySpacing, zSpacing] = imageData.getSpacing()
    const [xVoxels, yVoxels, zVoxels] = imageData.getDimensions()
    const imagePlaneModule = metaData.get('imagePlaneModule', image.imageId)
    const direction = imageData.getDirection()
    const rowCosines = direction.slice(0, 3)
    const columnCosines = direction.slice(3, 6)

    // using spacing, size, and direction only for now
    if (
      xSpacing !== image.rowPixelSpacing ||
      ySpacing !== image.columnPixelSpacing ||
      xVoxels !== image.columns ||
      yVoxels !== image.rows ||
      !isEqual(imagePlaneModule.rowCosines, <Point3>rowCosines) ||
      !isEqual(imagePlaneModule.columnCosines, <Point3>columnCosines)
    ) {
      return false
    }
    return true
  }

  /**
   * It Updates the vtkImageData of the viewport with the new pixel data
   * from the provided image object.
   *
   * @param image Cornerstone Image object
   */
  private _updateVTKImageDataFromCornerstoneImage(image: IImage): void {
    const imagePlaneModule = metaData.get('imagePlaneModule', image.imageId)
    let origin = imagePlaneModule.imagePositionPatient

    if (origin == null) {
      origin = [0, 0, 0]
    }

    this._imageData.setOrigin(origin)
    // 1. Update the pixel data in the vtkImageData object with the pixelData
    //    from the loaded Cornerstone image
    const pixelData = image.getPixelData()
    const scalars = this._imageData.getPointData().getScalars()
    const scalarData = scalars.getData() as Uint8Array | Float32Array

    // Handle cases where Cornerstone is providing an RGBA array, but we need RGB
    // for VTK.
    // TODO: This conversion from Cornerstone to VTK may take many forms?
    //       We need to nail down the types for Cornerstone Images
    if (image.color) {
      // RGB case
      let j = 0
      for (let i = 0; i < pixelData.length; i += 4) {
        scalarData[j] = pixelData[i]
        scalarData[j + 1] = pixelData[i + 1]
        scalarData[j + 2] = pixelData[i + 2]
        j += 3
      }
    } else {
      // In the general case, just set the VTK Image Data TypedArray data
      // from the pixel data array provided from the Cornerstone Image
      // TODO: What about Rescale Slope and Intercept?
      // TODO: What about SUV computation?
      scalarData.set(pixelData)
    }

    // Set origin, direction, spacing, etc...

    // Trigger modified on the VTK Object so the texture is updated
    // TODO: evaluate directly changing things with texSubImage3D later
    this._imageData.modified()
  }

  /**
   * It uses requestPoolManager to add request for the imageId. It loadsAndCache
   * the image and triggers the STACK_NEW_IMAGE when the request successfully retrieves
   * the image. Next, the volume actor gets updated with the new new retrieved image.
   *
   * @param imageId string representing the imageId
   * @param imageIdIndex index of the imageId in the imageId list
   */
  private async _loadImage(
    imageId: string,
    imageIdIndex: number
  ): Promise<string> {
    if (this.useCPURendering) {
      await this._loadImageCPU(imageId, imageIdIndex)
    } else {
      await this._loadImageGPU(imageId, imageIdIndex)
    }

    return imageId
  }

  private async _loadImageCPU(
    imageId: string,
    imageIdIndex: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 1. Load the image using the Image Loader
      function successCallback(image, imageIdIndex, imageId) {
        const eventData = {
          image,
          imageId,
          viewportUID: this.uid,
          renderingEngineUID: this.renderingEngineUID,
        }

        triggerEvent(this.canvas, EVENTS.STACK_NEW_IMAGE, eventData)

        const metadata = this._getImageDataMetadata(image)

        const viewport = getDefaultViewport(
          this.canvas,
          image,
          this.modality,
          this._cpuFallbackEnabledElement.viewport.colormap
        )

        this._cpuFallbackEnabledElement.image = image
        this._cpuFallbackEnabledElement.metadata = {
          ...metadata,
        }
        this.cpuImagePixelData = image.getPixelData()

        const viewportSettingToUse = Object.assign(
          {},
          viewport,
          this._cpuFallbackEnabledElement.viewport
        )

        // Important: this.stackInvalidated is different than cpuRenderingInvalidated. The
        // former is being used to maintain the previous state of the viewport
        // in the same stack, the latter is used to trigger drawImageSync
        this._cpuFallbackEnabledElement.viewport = this.stackInvalidated
          ? viewport
          : viewportSettingToUse

        // used the previous state of the viewport, then stackInvalidated is set to false
        this.stackInvalidated = false

        // new viewport is set to the current viewport, then cpuRenderingInvalidated is set to true
        this.cpuRenderingInvalidated = true

        this._cpuFallbackEnabledElement.transform = calculateTransform(
          this._cpuFallbackEnabledElement
        )

        // Todo: trigger an event to allow applications to hook into END of loading state
        // Currently we use loadHandlerManagers for this

        // Perform this check after the image has finished loading
        // in case the user has already scrolled away to another image.
        // In that case, do not render this image.
        if (this.currentImageIdIndex !== imageIdIndex) {
          return
        }

        // Trigger the image to be drawn on the next animation frame
        this.render()

        // Update the viewport's currentImageIdIndex to reflect the newly
        // rendered image
        this.currentImageIdIndex = imageIdIndex
        resolve(imageId)
      }

      function errorCallback(error, imageIdIndex, imageId) {
        const eventData = {
          error,
          imageIdIndex,
          imageId,
        }

        triggerEvent(eventTarget, ERROR_CODES.IMAGE_LOAD_ERROR, eventData)
        reject(error)
      }

      function sendRequest(imageId, imageIdIndex, options) {
        return loadAndCacheImage(imageId, options).then(
          (image) => {
            successCallback.call(this, image, imageIdIndex, imageId)
          },
          (error) => {
            errorCallback.call(this, error, imageIdIndex, imageId)
          }
        )
      }

      const modalityLutModule = metaData.get('modalityLutModule', imageId) || {}
      const suvFactor = metaData.get('scalingModule', imageId) || {}

      const generalSeriesModule =
        metaData.get('generalSeriesModule', imageId) || {}

      const scalingParameters: ScalingParameters = {
        rescaleSlope: modalityLutModule.rescaleSlope,
        rescaleIntercept: modalityLutModule.rescaleIntercept,
        modality: generalSeriesModule.modality,
        suvbw: suvFactor.suvbw,
      }

      // Todo: Note that eventually all viewport data is converted into Float32Array,
      // we use it here for the purpose of scaling for now.
      const type = 'Float32Array'

      const priority = -5
      const requestType = 'interaction'
      const additionalDetails = { imageId }
      const options = {
        targetBuffer: {
          type,
          offset: null,
          length: null,
        },
        preScale: {
          scalingParameters,
        },
      }

      requestPoolManager.addRequest(
        sendRequest.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority
      )
    })
  }

  private async _loadImageGPU(imageId: string, imageIdIndex: number) {
    return new Promise((resolve, reject) => {
      // 1. Load the image using the Image Loader
      function successCallback(image, imageIdIndex, imageId) {
        const eventData = {
          image,
          imageId,
          viewportUID: this.uid,
          renderingEngineUID: this.renderingEngineUID,
        }

        triggerEvent(this.canvas, EVENTS.STACK_NEW_IMAGE, eventData)

        this._updateActorToDisplayImageId(image)

        // Todo: trigger an event to allow applications to hook into END of loading state
        // Currently we use loadHandlerManagers for this

        // Perform this check after the image has finished loading
        // in case the user has already scrolled away to another image.
        // In that case, do not render this image.
        if (this.currentImageIdIndex !== imageIdIndex) {
          return
        }

        // Trigger the image to be drawn on the next animation frame
        this.render()

        // Update the viewport's currentImageIdIndex to reflect the newly
        // rendered image
        this.currentImageIdIndex = imageIdIndex
        resolve(imageId)
      }

      function errorCallback(error, imageIdIndex, imageId) {
        const eventData = {
          error,
          imageIdIndex,
          imageId,
        }

        triggerEvent(eventTarget, ERROR_CODES.IMAGE_LOAD_ERROR, eventData)
        reject(error)
      }

      function sendRequest(imageId, imageIdIndex, options) {
        return loadAndCacheImage(imageId, options).then(
          (image) => {
            successCallback.call(this, image, imageIdIndex, imageId)
          },
          (error) => {
            errorCallback.call(this, error, imageIdIndex, imageId)
          }
        )
      }

      const modalityLutModule = metaData.get('modalityLutModule', imageId) || {}
      const suvFactor = metaData.get('scalingModule', imageId) || {}

      const generalSeriesModule =
        metaData.get('generalSeriesModule', imageId) || {}

      const scalingParameters: ScalingParameters = {
        rescaleSlope: modalityLutModule.rescaleSlope,
        rescaleIntercept: modalityLutModule.rescaleIntercept,
        modality: generalSeriesModule.modality,
        suvbw: suvFactor.suvbw,
      }

      // Todo: Note that eventually all viewport data is converted into Float32Array,
      // we use it here for the purpose of scaling for now.
      const type = 'Float32Array'

      const priority = -5
      const requestType = 'interaction'
      const additionalDetails = { imageId }
      const options = {
        targetBuffer: {
          type,
          offset: null,
          length: null,
        },
        preScale: {
          scalingParameters,
        },
      }

      requestPoolManager.addRequest(
        sendRequest.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority
      )
    })
  }

  /**
   * It updates the volume actor with the retrieved cornerstone image.
   * It first checks if the new image has the same dimensions, spacings, and
   * dimensions of the previous one: 1) If yes, it updates the pixel data 2) if not,
   * it creates a whole new volume actor for the image.
   * Note: Camera gets reset for both situations. Therefore, each image renders at
   * its exact 3D location in the space, and both image and camera moves while scrolling.
   *
   * @param image Cornerstone image
   * @returns
   */
  private _updateActorToDisplayImageId(image) {
    // This function should do the following:
    // - Get the existing actor's vtkImageData that is being used to render the current image and check if we can reuse the vtkImageData that is in place (i.e. do the image dimensions and data type match?)
    // - If we can reuse it, replace the scalar data under the hood
    // - If we cannot reuse it, create a new actor, remove the old one, and reset the camera

    // 2. Check if we can reuse the existing vtkImageData object, if one is present.
    const sameImageData = this._checkVTKImageDataMatchesCornerstoneImage(
      image,
      this._imageData
    )

    const activeCamera = this.getRenderer().getActiveCamera()

    // Cache camera props so we can trigger one camera changed event after
    // The full transition.
    const previousCameraProps = _cloneDeep(this.getCamera())
    if (sameImageData && !this.stackInvalidated) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._updateVTKImageDataFromCornerstoneImage(image)

      // Adjusting the camera based on slice axis. this is required if stack
      // contains various image orientations (axial ct, sagittal xray)
      const direction = this._imageData.getDirection() as Float32Array
      const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction)

      this.setCameraNoEvent({ viewUp, viewPlaneNormal })

      // Since the 3D location of the imageData is changing as we scroll, we need
      // to modify the camera position to render this properly. However, resetting
      // causes problem related to zoom and pan tools: upon rendering of a new slice
      // the pan and zoom will get reset. To solve this, 1) we store the camera
      // properties related to pan and zoom 2) reset the camera to correctly place
      // it in the space 3) restore the pan, zoom props.
      const cameraProps = this.getCamera()

      this.panCache[0] = this.cameraPosOnRender[0] - cameraProps.position[0]
      this.panCache[1] = this.cameraPosOnRender[1] - cameraProps.position[1]
      this.panCache[2] = this.cameraPosOnRender[2] - cameraProps.position[2]

      // Reset the camera to point to the new slice location, reset camera doesn't
      // modify the direction of projection and viewUp
      this.resetCameraNoEvent()
      const { position } = this.getCamera()
      this.cameraPosOnRender = position

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      // activeCamera.setThicknessFromFocalPoint(0.1)
      activeCamera.setFreezeFocalPoint(true)

      // We shouldn't restore the focalPoint, position and parallelScale after reset
      // if it is the first render or we have completely re-created the vtkImageData
      this._restoreCameraProps(cameraProps, previousCameraProps)

      // Restore rotation for the new slice of the image
      this.rotationCache = 0
      this._setPropertiesFromCache()

      return
    }

    // 3b. If we cannot reuse the vtkImageData object (either the first render
    // or the size has changed), create a new one
    this._createVTKImageData(image)

    // Set the scalar data of the vtkImageData object from the Cornerstone
    // Image's pixel data
    this._updateVTKImageDataFromCornerstoneImage(image)

    // Create a VTK Volume actor to display the vtkImageData object
    const stackActor = this.createActorMapper(this._imageData)

    this.setActors([{ uid: this.uid, volumeActor: stackActor }])
    // Adjusting the camera based on slice axis. this is required if stack
    // contains various image orientations (axial ct, sagittal xray)
    const direction = this._imageData.getDirection() as Float32Array
    const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction)

    this.setCameraNoEvent({ viewUp, viewPlaneNormal })

    // Reset the camera to point to the new slice location, reset camera doesn't
    // modify the direction of projection and viewUp
    this.resetCameraNoEvent()

    this.triggerCameraEvent(this.getCamera(), previousCameraProps)

    // This is necessary to initialize the clipping range and it is not related
    // to our custom slabThickness.
    // activeCamera.setThicknessFromFocalPoint(0.1)
    activeCamera.setFreezeFocalPoint(true)

    // set voi for the first time
    this.setProperties()

    // Saving position of camera on render, to cache the panning
    const { position } = this.getCamera()
    this.cameraPosOnRender = position
    this.stackInvalidated = false

    if (this._publishCalibratedEvent) {
      this.triggerCalibrationEvent()
    }
  }

  /**
   * Loads the image based on the provided imageIdIndex
   * @param imageIdIndex number represents imageId index
   */
  private async _setImageIdIndex(imageIdIndex: number): Promise<string> {
    if (imageIdIndex >= this.imageIds.length) {
      throw new Error(
        `ImageIdIndex provided ${imageIdIndex} is invalid, the stack only has ${this.imageIds.length} elements`
      )
    }

    // Update the state of the viewport to the new imageIdIndex;
    this.currentImageIdIndex = imageIdIndex

    // Get the imageId from the stack
    const imageId = this.imageIds[imageIdIndex]

    // Todo: trigger an event to allow applications to hook into START of loading state
    // Currently we use loadHandlerManagers for this

    await this._loadImage(imageId, imageIdIndex)
    return imageId
  }

  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  public resetCamera(resetPanZoomForViewPlane = true): void {
    if (this.useCPURendering) {
      this.resetCameraCPU(resetPanZoomForViewPlane)
    } else {
      this.resetCameraGPU()
    }
  }

  private resetCameraCPU(resetPanZoomForViewPlane: boolean) {
    const { image } = this._cpuFallbackEnabledElement

    if (!image) {
      return
    }

    resetCamera(this._cpuFallbackEnabledElement, resetPanZoomForViewPlane)
  }

  private resetCameraGPU() {
    // Todo: this doesn't work for resetPanZoomForViewPlane = true
    const resetPanZoomForViewPlane = false
    this.resetViewportCamera(resetPanZoomForViewPlane)
  }

  /**
   * Loads the image based on the provided imageIdIndex
   *
   * @param imageIdIndex number represents imageId index in the list of
   * provided imageIds in setStack
   */
  public setImageIdIndex(imageIdIndex: number): void {
    // If we are already on this imageId index, stop here
    if (this.currentImageIdIndex === imageIdIndex) {
      return
    }

    // Otherwise, get the imageId and attempt to display it
    this._setImageIdIndex(imageIdIndex)
  }

  /**
   * Calibrates the actor with new metadata that has been added for imageId. To calibrate
   * a viewport, you should add your calibration data manually to
   * calibratedPixelSpacingMetadataProvider and call viewport.calibrateSpacing
   * for it get applied.
   *
   * @param imageId imageId to be calibrated
   */
  public calibrateSpacing(imageId: string): void {
    const imageIdIndex = this.getImageIds().indexOf(imageId)
    this.stackInvalidated = true
    this._loadImage(imageId, imageIdIndex)
  }

  /**
   * Restores the camera props such zooming and panning after an image is
   * changed, if needed (after scroll)
   *
   * @param parallelScale camera parallel scale
   */
  private _restoreCameraProps(
    { parallelScale: prevScale }: ICamera,
    previousCamera: ICamera
  ): void {
    const renderer = this.getRenderer()

    // get the focalPoint and position after the reset
    const { position, focalPoint } = this.getCamera()

    const newPosition = <Point3>[
      position[0] - this.panCache[0],
      position[1] - this.panCache[1],
      position[2] - this.panCache[2],
    ]

    const newFocal = <Point3>[
      focalPoint[0] - this.panCache[0],
      focalPoint[1] - this.panCache[1],
      focalPoint[2] - this.panCache[2],
    ]

    // Restoring previous state x,y and scale, keeping the new z
    this.setCameraNoEvent({
      parallelScale: prevScale,
      position: newPosition,
      focalPoint: newFocal,
    })

    const camera = this.getCamera()

    this.triggerCameraEvent(camera, previousCamera)

    // Invoking render
    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    }

    renderer.invokeEvent(RESET_CAMERA_EVENT)
  }

  private triggerCameraEvent(camera: ICamera, previousCamera: ICamera) {
    // Finally emit event for the full camera change cause during load image.
    const eventDetail = {
      previousCamera,
      camera,
      canvas: this.canvas,
      viewportUID: this.uid,
      sceneUID: this.sceneUID,
      renderingEngineUID: this.renderingEngineUID,
    }

    // For crosshairs to adapt to new viewport size
    triggerEvent(this.canvas, EVENTS.CAMERA_MODIFIED, eventDetail)
  }

  private triggerCalibrationEvent() {
    // Update the indexToWorld and WorldToIndex for viewport
    const { imageData } = this.getImageData()
    // Finally emit event for the full camera change cause during load image.
    const eventDetail = {
      canvas: this.canvas,
      viewportUID: this.uid,
      sceneUID: this.sceneUID,
      renderingEngineUID: this.renderingEngineUID,
      imageId: this.getCurrentImageId(),
      imageData,
      ...this._calibrationEvent,
      indexToWorld: imageData.getIndexToWorld(),
      worldToIndex: imageData.getWorldToIndex(),
    }

    // Let the tools know the image spacing has been calibrated
    triggerEvent(this.canvas, EVENTS.IMAGE_SPACING_CALIBRATED, eventDetail)

    this._publishCalibratedEvent = false
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
    if (this.useCPURendering) {
      return this.canvasToWorldCPU(canvasPos)
    }

    return this.canvasToWorldGPU(canvasPos)
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
    if (this.useCPURendering) {
      return this.worldToCanvasCPU(worldPos)
    }

    return this.worldToCanvasGPU(worldPos)
  }

  private canvasToWorldCPU = (canvasPos: Point2): Point3 => {
    if (!this._cpuFallbackEnabledElement.image) {
      return
    }
    // compute the pixel coordinate in the image
    const [px, py] = canvasToPixel(this._cpuFallbackEnabledElement, canvasPos)

    // convert pixel coordinate to world coordinate
    const { origin, spacing, direction } = this.getImageData()

    const worldPos = vec3.fromValues(0, 0, 0)

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3)
    const jVector = direction.slice(3, 6)

    // Calculate the world coordinate of the pixel
    vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0])
    vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1])

    return worldPos as Point3
  }

  private worldToCanvasCPU = (worldPos: Point3): Point2 => {
    // world to pixel
    const { spacing, direction, origin } = this.getImageData()

    const iVector = direction.slice(0, 3)
    const jVector = direction.slice(3, 6)

    const diff = vec3.subtract(vec3.create(), worldPos, origin)

    const worldPoint = [
      vec3.dot(diff, iVector) / spacing[0],
      vec3.dot(diff, jVector) / spacing[1],
    ]

    // pixel to canvas
    const canvasPoint = pixelToCanvas(
      this._cpuFallbackEnabledElement,
      worldPoint
    )
    return canvasPoint
  }

  private canvasToWorldGPU = (canvasPos: Point2): Point3 => {
    const renderer = this.getRenderer()
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const size = openGLRenderWindow.getSize()
    const displayCoord = [canvasPos[0] + this.sx, canvasPos[1] + this.sy]

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1]

    let worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    )

    worldCoord = this.applyFlipTx(worldCoord)

    return worldCoord
  }

  private worldToCanvasGPU = (worldPos: Point3) => {
    const renderer = this.getRenderer()
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const size = openGLRenderWindow.getSize()
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...this.applyFlipTx(worldPos),
      renderer
    )

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1]

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ]

    return canvasCoord
  }

  /**
   * Returns the index of the imageId being renderer
   *
   * @returns currently shown imageId index
   */
  public getCurrentImageIdIndex = (): number => {
    return this.currentImageIdIndex
  }

  /**
   * Returns the list of image Ids for the current viewport
   * @returns list of strings for image Ids
   */
  public getImageIds = (): Array<string> => {
    return this.imageIds
  }

  /**
   * Returns the currently rendered imageId
   * @returns string for imageId
   */
  public getCurrentImageId = (): string => {
    return this.imageIds[this.currentImageIdIndex]
  }

  /**
   * @method getRenderer Returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns {object} The `vtkRenderer` for the `Viewport`.
   */
  public getRenderer() {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('getRenderer')
    }

    return super.getRenderer()
  }

  public getDefaultActor(): ActorEntry {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('getDefaultActor')
    }

    return super.getDefaultActor()
  }

  public getActors(): Array<ActorEntry> {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('getActors')
    }

    return super.getActors()
  }

  public getActor(actorUID: string): ActorEntry {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('getActor')
    }

    return super.getActor(actorUID)
  }

  public setActors(actors: Array<ActorEntry>): void {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('setActors')
    }

    return super.setActors(actors)
  }

  public addActors(actors: Array<ActorEntry>): void {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('addActors')
    }

    return super.addActors(actors)
  }

  public addActor(actorEntry: ActorEntry): void {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('addActor')
    }

    return super.addActor(actorEntry)
  }

  public removeAllActors(): void {
    if (this.useCPURendering) {
      throw this.getCPUFallbackError('removeAllActors')
    }

    return super.removeAllActors()
  }

  private getCPUFallbackError(method: string): Error {
    return new Error(`method ${method} cannot be used during CPU Fallback mode`)
  }

  static get useCustomRenderingPipeline() {
    return getShouldUseCPURendering()
  }

  private fillWithBackgroundColor() {
    const { canvas, options } = this
    const ctx = canvas.getContext('2d')

    // Default to black if no background color is set
    let fillStyle
    if (options && options.background) {
      const rgb = options.background.map((f) => Math.floor(255 * f))
      fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    } else {
      fillStyle = 'black'
    }

    // We draw over the previous stack with the background color while we
    // wait for the next stack to load
    ctx.fillStyle = fillStyle
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  customRenderViewportToCanvas = () => {
    if (!this.useCPURendering) {
      throw new Error(
        'Custom cpu rendering pipeline should only be hit in CPU rendering mode'
      )
    }

    if (this._cpuFallbackEnabledElement.image) {
      drawImageSync(
        this._cpuFallbackEnabledElement,
        this.cpuRenderingInvalidated
      )
      // reset flags
      this.cpuRenderingInvalidated = false
    } else {
      this.fillWithBackgroundColor()
    }

    return {
      canvas: this.canvas,
      viewportUID: this.uid,
      sceneUID: this.sceneUID,
      renderingEngineUID: this.renderingEngineUID,
    }
  }

  public setColormap(colormap: CPUFallbackColormapData) {
    if (this.useCPURendering) {
      this.setColormapCPU(colormap)
    } else {
      this.setColormapGPU(colormap)
    }
  }

  public unsetColormap() {
    if (this.useCPURendering) {
      this.unsetColormapCPU()
    } else {
      this.unsetColormapGPU()
    }
  }

  private unsetColormapCPU() {
    delete this._cpuFallbackEnabledElement.viewport.colormap
    this._cpuFallbackEnabledElement.renderingTools = {}

    this.cpuRenderingInvalidated = true

    this.fillWithBackgroundColor()

    this.render()
  }

  private setColormapCPU(colormapData: CPUFallbackColormapData) {
    const colormap = getColormap(colormapData.name, colormapData)

    this._cpuFallbackEnabledElement.viewport.colormap = colormap
    this._cpuFallbackEnabledElement.renderingTools = {}

    this.fillWithBackgroundColor()
    this.cpuRenderingInvalidated = true

    this.render()
  }

  private setColormapGPU(colormap: CPUFallbackColormapData) {
    // TODO -> vtk has full colormaps which are piecewise and frankly better?
    // Do we really want a pre defined 256 color map just for the sake of harmonization?
    throw new Error('setColorMapGPU not implemented.')
  }

  private unsetColormapGPU() {
    // TODO -> vtk has full colormaps which are piecewise and frankly better?
    // Do we really want a pre defined 256 color map just for the sake of harmonization?
    throw new Error('unsetColormapGPU not implemented.')
  }
}

export default StackViewport
