import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import metaData from '../metaData'
import Viewport from './Viewport'
import { vec3 } from 'gl-matrix'
import { Point2, Point3, ViewportInput, IViewport } from './../types'
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
  private _imageData: any // vtk image data
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
      // Independent components must be set to false to display colour images
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

  private _createVTKImageData(image, imageId: string) {
    // TODO: Creating a single image should probably not require a metadata provider.
    // We should define the minimum we need to display an image and it should live on
    // the Image object itself. Additional stuff (e.g. pixel spacing, direction, origin, etc)
    // should be optional and used if provided through a metadata provider.
    const { imagePlaneModule, imagePixelModule } = this.buildMetadata(imageId)

    const { rowCosines, columnCosines } = imagePlaneModule
    const rowCosineVec = vec3.fromValues(...rowCosines)
    const colCosineVec = vec3.fromValues(...columnCosines)
    const scanAxisNormal = vec3.create()
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

    const origin = imagePlaneModule.imagePositionPatient
    const xSpacing =
      image.columnPixelSpacing || imagePlaneModule.columnPixelSpacing
    const ySpacing = image.rowPixelSpacing || imagePlaneModule.rowPixelSpacing
    const zSpacing = 1 // Todo
    const xVoxels = image.columns
    const yVoxels = image.rows
    const zVoxels = 2

    const numberOfComponents =
      image.numComps ||
      this._getNumCompsFromPhotometricInterpretation(
        imagePixelModule.photometricInterpretation
      )

    let pixelArray
    switch (imagePixelModule.bitsAllocated) {
      case 8:
        pixelArray = new Uint8Array(xVoxels * yVoxels * zVoxels)
        break

      case 16:
        pixelArray = new Float32Array(xVoxels * yVoxels * zVoxels)

        break
      case 24:
        pixelArray = new Uint8Array(xVoxels * yVoxels * zVoxels * 3)

        break
      default:
        console.debug('bit allocation not implemented')
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents,
      values: pixelArray,
    })

    const imageData = vtkImageData.newInstance()
    const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal]

    imageData.setDimensions(xVoxels, yVoxels, zVoxels)
    imageData.setSpacing(xSpacing, ySpacing, zSpacing)

    // TODO: If we are going to actually set the direction / origin of each slice when
    // we render it, we also need to make sure we move the camera so it can see the slice
    //imageData.setDirection(direction)
    //imageData.setOrigin(...origin)

    imageData.getPointData().setScalars(scalarArray)
    return imageData
  }

  public setStack(imageIds: Array<string>, currentImageIdIndex = 0): any {
    this.imageIds = imageIds
    this.currentImageIdIndex = currentImageIdIndex

    this._setImageIdIndex(currentImageIdIndex)
  }

  public setWindowRange(range) {
    this.windowRange = Object.assign({}, range)
  }

  public getStackActors() {
    return this._stackActors
  }

  private _checkIfSameImageData(image, imageData) {
    if (!imageData) {
      return false
    }

    const [xSpacing, ySpacing, zSpacing] = imageData.getSpacing()
    const [xVoxels, yVoxels, zVoxels] = imageData.getDimensions()

    // using spacing and size only for now
    if (
      xSpacing !== image.rowPixelSpacing ||
      ySpacing !== image.columnPixelSpacing ||
      xVoxels !== image.rows ||
      yVoxels !== image.columns
    ) {
      return false
    }
    return true
  }

  private _setScalarsFromPixelData(image) {
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
    const sameImageData = this._checkIfSameImageData(image, this._imageData)
    if (sameImageData) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._setScalarsFromPixelData(image)
    } else {
      // 3b. If we cannot reuse the vtkImageData object, create a new one
      this._imageData = this._createVTKImageData(image, imageId)

      // Set the scalar data of the vtkImageData object from the Cornerstone
      // Image's pixel data
      this._setScalarsFromPixelData(image)

      // Create a VTK Volume actor to display the vtkImageData object
      const stackActor = this.createActorMapper(this._imageData)

      // Get the VTK renderer for this Viewport
      const renderer = this.getRenderer()

      // Remove the previous volume actor from the renderer
      const volumes = renderer.getVolumes()
      const prevStackActor = volumes[0]

      volumes.forEach((volume) => {
        renderer.removeViewProp(volume)
      })

      // Remove the previous actor from our internal list of actors
      // TODO: Why do we need this at all? Is it just if we have
      // images in a stack of different dimensions?
      const index = this._stackActors.findIndex(
        (stackActor) => stackActor.volumeActor === prevStackActor
      )

      if (index > -1) {
        this._stackActors.splice(index, 1)
      }

      // Adding the new actor to the renderer
      renderer.addActor(stackActor)

      // Add the new actor to the internal list of actors for the viewport
      this._stackActors.push({ volumeActor: stackActor, uid: this.uid })

      // Reset the camera if the actor has changed
      this.resetCamera()
    }
  }

  private _setImageIdIndex(imageIdIndex) {
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
    // implementation
  }

  public getFrameOfReferenceUID(): string {
    // TODO: Implement this instead of having it at the
    return 'blah'
  }
}

export default StackViewport
