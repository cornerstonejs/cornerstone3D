import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'

import metaData from '../metaData'
import Viewport from './Viewport'
import { vec3 } from 'gl-matrix'
import eventTarget from '../eventTarget'
import EVENTS from '../enums/events'
import { triggerEvent, isEqual, invertRgbTransferFunction } from '../utilities'
import {
  Point2,
  Point3,
  ViewportInput,
  VOIRange,
  ICamera,
  IImage,
  ScalingParameters,
  IImageData,
  PetScaling,
  Scaling,
  StackProperties,
} from '../types'
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera'

import { loadAndCacheImage } from '../imageLoader'
import requestPoolManager from '../requestPool/requestPoolManager'
import ERROR_CODES from '../enums/errorCodes'
import INTERPOLATION_TYPE from '../constants/interpolationType'

const EPSILON = 1

interface ImageDataMetaData {
  bitsAllocated: number
  numComps: number
  origin: Point3
  direction: Float32Array
  dimensions: Point3
  spacing: Point3
  numVoxels: number
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
  private invalidated = false // if true -> new actor is forced to be created for the stack
  private panCache: Point3
  private shouldInvert = false // since invert is getting applied on the actor we should track it
  private rotationCache = 0

  // TODO: These should not be here and will be nuked
  public modality: string // this is needed for tools
  public scaling: Scaling

  constructor(props: ViewportInput) {
    super(props)
    this.scaling = {}
    this.modality = null
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
    this.imageIds = []
    this.currentImageIdIndex = 0
    this.panCache = [0, 0, 0]
    this.cameraPosOnRender = [0, 0, 0]
    this.resetCamera()
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(): IImageData | undefined {
    const actor = this.getDefaultActor()

    if (!actor) {
      return
    }

    const { volumeActor } = actor
    const vtkImageData = volumeActor.getMapper().getInputData()
    return {
      dimensions: vtkImageData.getDimensions(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      vtkImageData: volumeActor.getMapper().getInputData(),
      metadata: { Modality: this.modality },
      scaling: this.scaling,
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

    const spacing = imageData.getSpacing()
    // We set the sample distance to be equal to zSpacing
    mapper.setSampleDistance(spacing[2])

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

  /**
   * Applies the properties to the volume actor.
   * @param actor VolumeActor
   */
  private applyProperties(volumeActor) {
    const tfunc = volumeActor.getProperty().getRGBTransferFunction(0)

    // apply voiRange if defined
    if (typeof this.voiRange !== 'undefined') {
      const { lower, upper } = this.voiRange
      tfunc.setRange(lower, upper)
    } else {
      const imageData = volumeActor.getMapper().getInputData()
      const range = imageData.getPointData().getScalars().getRange()
      tfunc.setRange(range[0], range[1])
      this.voiRange = { lower: range[0], upper: range[1] }
    }

    // apply invert if defined
    if (this.shouldInvert) {
      invertRgbTransferFunction(tfunc)
      this.shouldInvert = false
    }

    // change interpolation if defined
    if (typeof this.interpolationType !== 'undefined') {
      const volumeProperty = volumeActor.getProperty()
      volumeProperty.setInterpolationType(this.interpolationType)
    }

    // apply rotation
    if (this.rotationCache !== this.rotation) {
      // Moving back to zero rotation, for new scrolled slice rotation is 0 after camera reset
      this.getVtkActiveCamera().roll(-this.rotationCache)

      // rotating camera to the new value
      this.getVtkActiveCamera().roll(this.rotation)
      this.rotationCache = this.rotation
    }
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
  }: StackProperties = {}): void {
    if (typeof voiRange !== 'undefined') {
      this.voiRange = voiRange
    }

    if (typeof invert !== 'undefined') {
      this.shouldInvert = invert !== this.invert
      this.invert = invert
    }

    if (typeof interpolationType !== 'undefined') {
      this.interpolationType = interpolationType
    }

    if (typeof rotation !== 'undefined') {
      this.rotation = rotation
    }

    const actor = this.getDefaultActor()
    if (actor?.volumeActor) {
      this.applyProperties(actor.volumeActor)
    }
  }

  /**
   * Retrieve the viewport properties
   */
  public getProperties(): StackProperties {
    return {
      voiRange: this.voiRange,
      rotation: this.rotation,
      interpolationType: this.interpolationType,
      invert: this.invert
    };
  }

  /**
   * Reset the viewport properties
   */
  public resetProperties(): void {
    this.voiRange = undefined;
    this.rotation = 0;
    this.interpolationType = INTERPOLATION_TYPE.LINEAR;

    // Ensure that the invert setting is applied properly
    this.shouldInvert = this.invert === true
    this.invert = false;

    const actor = this.getDefaultActor()
    if (actor?.volumeActor) {
      this.applyProperties(actor.volumeActor)
    }
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

    const {
      rowCosines,
      columnCosines,
    }: {
      rowCosines: Point3
      columnCosines: Point3
    } = imagePlaneModule

    const rowCosineVec = vec3.fromValues(...rowCosines)
    const colCosineVec = vec3.fromValues(...columnCosines)
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    const origin = imagePlaneModule.imagePositionPatient
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
  public setStack(imageIds: Array<string>, currentImageIdIndex = 0): void {
    this.imageIds = imageIds
    this.currentImageIdIndex = currentImageIdIndex
    this.invalidated = true

    const { canvas, options } = this
    const ctx = canvas.getContext("2d")

    // Default to black if no background color is set
    let fillStyle;
    if (options && options.background) {
      const rgb = options.background.map(f => Math.floor(255 * f));
      fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    } else {
      fillStyle = 'black'
    }

    // We draw over the previous stack with the background color while we
    // wait for the next stack to load
    ctx.fillStyle = fillStyle
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    this._setImageIdIndex(currentImageIdIndex)
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
      xVoxels !== image.rows ||
      yVoxels !== image.columns ||
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
    const origin = imagePlaneModule.imagePositionPatient

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
  private _loadImage(imageId: string, imageIdIndex: number) {
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
    }

    function errorCallback(error, imageIdIndex, imageId) {
      const eventData = {
        error,
        imageIdIndex,
        imageId,
      }

      triggerEvent(eventTarget, ERROR_CODES.IMAGE_LOAD_ERROR, eventData)
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

    if (sameImageData && !this.invalidated) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._updateVTKImageDataFromCornerstoneImage(image)

      // Adjusting the camera based on slice axis. this is required if stack
      // contains various image orientations (axial ct, sagittal xray)
      const direction = this._imageData.getDirection() as Float32Array
      const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction)

      this.setCamera({ viewUp, viewPlaneNormal })

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
      this.resetCamera()
      const { position } = this.getCamera()
      this.cameraPosOnRender = position

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      // activeCamera.setThicknessFromFocalPoint(0.1)
      activeCamera.setFreezeFocalPoint(true)

      // We shouldn't restore the focalPoint, position and parallelScale after reset
      // if it is the first render or we have completely re-created the vtkImageData
      this._restoreCameraProps(cameraProps)

      // Restore rotation for the new slice of the image
      this.rotationCache = 0
      const stackActor = this.getDefaultActor().volumeActor
      this.applyProperties(stackActor)

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

    this.setCamera({ viewUp, viewPlaneNormal })

    // Reset the camera to point to the new slice location, reset camera doesn't
    // modify the direction of projection and viewUp
    this.resetCamera()

    // This is necessary to initialize the clipping range and it is not related
    // to our custom slabThickness.
    // activeCamera.setThicknessFromFocalPoint(0.1)
    activeCamera.setFreezeFocalPoint(true)

    // Restore rotation for the new actor
    this.rotationCache = 0
    this.shouldInvert = this.invert
    this.applyProperties(stackActor)

    // Saving position of camera on render, to cache the panning
    const { position } = this.getCamera()
    this.cameraPosOnRender = position
    this.invalidated = false
  }

  /**
   * Loads the image based on the provided imageIdIndex
   * @param imageIdIndex number represents imageId index
   */
  private _setImageIdIndex(imageIdIndex: number): void {
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

    this._loadImage(imageId, imageIdIndex)
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
   * Restores the camera props such zooming and panning after an image is
   * changed, if needed (after scroll)
   *
   * @param parallelScale camera parallel scale
   */
  private _restoreCameraProps({ parallelScale: prevScale }: ICamera): void {
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
    this.setCamera({
      parallelScale: prevScale,
      position: newPosition,
      focalPoint: newFocal,
    })

    // Invoking render
    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    }

    renderer.invokeEvent(RESET_CAMERA_EVENT)
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

  /**
   * @canvasToWorld Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
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
}

export default StackViewport
