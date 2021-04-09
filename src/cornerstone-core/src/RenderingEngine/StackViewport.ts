import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import metaData from '../metaData'
import Viewport from './Viewport'
import { vec3 } from 'gl-matrix'
import {
  Point2,
  Point3,
  ViewportInput,
  IViewport,
  VOIRange,
  ICamera,
} from '../types'
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera'

import { loadAndCacheImage } from '../imageLoader'

/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
class StackViewport extends Viewport implements IViewport {
  private imageIds: Array<string>
  private currentImageIdIndex: number
  // private _stackActors: Map<string, any>
  private _imageData: any // vtk image data
  private stackActorVOI: VOIRange

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
    camera.setFreezeFocalPoint(true)
    this.imageIds = []
    this.currentImageIdIndex = 0
    // this._stackActors = new Map()
    this.resetCamera()
  }

  public getFrameOfReferenceUID = (): string | undefined => {
    // Get the current image that is displayed in the viewport
    const imageId = this.getCurrentImageId()

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

    mapper.setSampleDistance(sampleDistance)

    // Todo: for some reason the following logic led to warning for sampleDistance
    // being greater than the allowed limit

    // const spacing = imageData.getSpacing()
    // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
    // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
    // const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6

    const tfunc = actor.getProperty().getRGBTransferFunction(0)
    if (!this.stackActorVOI!) {
      // setting the range for the first time
      const range = imageData.getPointData().getScalars().getRange()
      tfunc.setRange(range[0], range[1])
      this.stackActorVOI = { lower: range[0], upper: range[1] }
    } else {
      // keeping the viewport range for a new image
      const { lower, upper } = this.stackActorVOI
      tfunc.setRange(lower, upper)
    }

    if (imageData.getPointData().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false)
    }

    return actor
  }

  private buildMetadata(imageId) {
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

  private _getImageDataMetadata(image) {
    // TODO: Creating a single image should probably not require a metadata provider.
    // We should define the minimum we need to display an image and it should live on
    // the Image object itself. Additional stuff (e.g. pixel spacing, direction, origin, etc)
    // should be optional and used if provided through a metadata provider.
    const { imagePlaneModule, imagePixelModule } = this.buildMetadata(
      image.imageId
    )

    const { rowCosines, columnCosines } = imagePlaneModule
    const rowCosineVec = vec3.fromValues(...rowCosines)
    const colCosineVec = vec3.fromValues(...columnCosines)
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    const origin = imagePlaneModule.imagePositionPatient
    const xSpacing =
      imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing
    const ySpacing = imagePlaneModule.rowPixelSpacing || image.rowPixelSpacing
    const zSpacing = 1 // Todo
    const xVoxels = image.columns
    const yVoxels = image.rows
    const zVoxels = 2

    const numComps =
      image.numComps ||
      this._getNumCompsFromPhotometricInterpretation(
        imagePixelModule.photometricInterpretation
      )

    return {
      bitsAllocated: imagePixelModule.bitsAllocated,
      numComps,
      origin,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      numVoxels: xVoxels * yVoxels * zVoxels,
    }
  }

  private _getCameraOrientation(
    imageDataDirection
  ): { viewPlaneNormal: Point3; viewUp: Point3 } {
    // TODO: Not sure why I had to add .map((x) => -x) to this,
    // but otherwise it did not match the volumeviewport display for the
    // same dataset
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

  private _createVTKImageData(image, imageId: string) {
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

    const imageData = vtkImageData.newInstance()

    imageData.setDimensions(...dimensions)
    imageData.setSpacing(...spacing)
    imageData.setDirection(direction)
    imageData.setOrigin(...origin)

    imageData.getPointData().setScalars(scalarArray)
    return imageData
  }

  public setStack(imageIds: Array<string>, currentImageIdIndex = 0): any {
    this.imageIds = imageIds
    this.currentImageIdIndex = currentImageIdIndex

    this._setImageIdIndex(currentImageIdIndex)
  }

  public setStackActorVOI(range: VOIRange): void {
    this.stackActorVOI = Object.assign({}, range)
  }

  private _checkVTKImageDataMatchesCornerstoneImage(image, imageData) {
    if (!imageData) {
      return false
    }

    const [xSpacing, ySpacing, zSpacing] = imageData.getSpacing()
    const [xVoxels, yVoxels, zVoxels] = imageData.getDimensions()

    // using spacing and size only for now
    return (
      xSpacing === image.rowPixelSpacing ||
      ySpacing === image.columnPixelSpacing ||
      xVoxels === image.rows ||
      yVoxels === image.columns
    )
  }

  // Todo: rename since it may do more than set scalars
  private _updateVTKImageDataFromCornerstoneImage(image) {
    const {
      origin,
      direction,
      dimensions,
      spacing,
    } = this._getImageDataMetadata(image)

    this._imageData.setDimensions(...dimensions)
    this._imageData.setSpacing(...spacing)
    this._imageData.setDirection(direction)
    this._imageData.setOrigin(...origin)

    // 3. Update the pixel data in the vtkImageData object with the pixelData
    //    from the loaded Cornerstone image
    const pixelData = image.getPixelData()
    const scalars = this._imageData.getPointData().getScalars()
    const scalarData = scalars.getData()

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

  private async _updateActorToDisplayImageId(imageId) {
    // This function should do the following:
    // - Load the specified Image
    // - Get the existing actor's vtkImageData that is being used to render the current image and check if we can reuse the vtkImageData that is in place (i.e. do the image dimensions and data type match?)
    // - If we can reuse it, replace the scalar data under the hood
    // - If we cannot reuse it, create a new actor, remove the old one, and reset the camera

    // 1. Load the image using the Image Loader
    const image = await loadAndCacheImage(imageId, {})

    // 2. Check if we can reuse the existing vtkImageData object, if one is present.
    const sameImageData = this._checkVTKImageDataMatchesCornerstoneImage(
      image,
      this._imageData
    )

    if (sameImageData) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._updateVTKImageDataFromCornerstoneImage(image)

      // Adjusting the camera based on slice axis. this is required if stack
      // contains various image orientations (axial ct, sagittal xray)
      const direction = this._imageData.getDirection()
      const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction)

      this.setCamera({ viewUp, viewPlaneNormal })

      // Since the 3D location of the imageData is changing as we scroll, we need
      // to modify the camera position to render this properly. However, resetting
      // causes problem related to zoom and pan tools: upon rendering of a new slice
      // the pan and zoom will get reset. To solve this, 1) we store the camera
      // properties related to pan and zoom 2) reset the camera to correctly place
      // it in the space 3) restore the pan, zoom props.
      const cameraProps = this.getCamera()

      // Reset the camera to point to the new slice location, reset camera doesn't
      // modify the direction of projection and viewUp
      this.resetCamera()

      // We shouldn't restore the focalPoint, position and parallelScale after reset
      // if it is the first render or we have completely re-created the vtkImageData
      this._restoreCameraProps(cameraProps)
      return
    }

    // 3b. If we cannot reuse the vtkImageData object (either the first render
    // or the size has changed), create a new one
    this._imageData = this._createVTKImageData(image, imageId)

    // Set the scalar data of the vtkImageData object from the Cornerstone
    // Image's pixel data
    this._updateVTKImageDataFromCornerstoneImage(image)

    // Create a VTK Volume actor to display the vtkImageData object
    const stackActor = this.createActorMapper(this._imageData)

    this.setActors([{ uid: this.uid, volumeActor: stackActor }])
    // Adjusting the camera based on slice axis. this is required if stack
    // contains various image orientations (axial ct, sagittal xray)
    const direction = this._imageData.getDirection()
    const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction)

    this.setCamera({ viewUp, viewPlaneNormal })

    // Reset the camera to point to the new slice location, reset camera doesn't
    // modify the direction of projection and viewUp
    this.resetCamera()
  }

  private _setImageIdIndex(imageIdIndex) {
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

    this._updateActorToDisplayImageId(imageId).then(() => {
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
    })
  }

  public setImageIdIndex(imageIdIndex: number) {
    // If we are already on this imageId index, stop here
    if (this.currentImageIdIndex === imageIdIndex) {
      return
    }

    // Otherwise, get the imageId and attempt to display it
    this._setImageIdIndex(imageIdIndex)
  }

  private _restoreCameraProps({
    focalPoint: prevFocal,
    position: prevPos,
    parallelScale: prevScale,
  }: ICamera): void {
    const renderer = this.getRenderer()

    // get the focalPoint and position after the reset
    const { position, focalPoint } = this.getCamera()

    // Restoring previous state x,y and scale, keeping the new z
    this.setCamera({
      parallelScale: prevScale,
      position: [prevPos[0], prevPos[1], position[2]],
      focalPoint: [prevFocal[0], prevFocal[1], focalPoint[2]],
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
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow()
    const size = openGLRenderWindow.getSize()
    const displayCoord = [canvasPos[0] + this.sx, canvasPos[1] + this.sy]

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1]

    return openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    )
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

    return canvasCoord
  }

  public getCurrentImageIdIndex = (): number => {
    return this.currentImageIdIndex
  }

  public getImageIds = (): Array<string> => {
    return this.imageIds
  }

  public getCurrentImageId = (): string => {
    return this.imageIds[this.currentImageIdIndex]
  }
}

export default StackViewport
