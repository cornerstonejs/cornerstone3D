import React, { Component, useRef, useEffect, useState } from 'react'
import vtkGenericRenderWindow from 'vtk.js/Sources/Rendering/Misc/GenericRenderWindow'
import { vec3 } from 'gl-matrix'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import { api } from 'dicomweb-client'
import { requestPoolManager } from '@ohif/cornerstone-render'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'

const requestType = 'prefetch'
const preventCache = false

const wadoRsRoot = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs'
const studyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463'
const seriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561'

// Reasonable defaults
const PIXEL_STEP = 10
const LINE_HEIGHT = 40
const PAGE_HEIGHT = 800

let currentSliceIndex = 0
const pixelDataCache = []

const canvasWidth = 500
const canvasHeight = 500

// const volumeElement = document.getElementById("volumeViewer");
const volumeViewer = vtkGenericRenderWindow.newInstance({
  background: [0, 0, 0],
})

const volumeRenderWindow = volumeViewer.getRenderWindow()
const volumeRenderer = volumeViewer.getRenderer()

// volumeElement.innerHTML = "";
// volumeViewer.setContainer(volumeElement);

function getWorldDistanceViewupAndViewRight(bounds, viewUp, viewPlaneNormal) {
  const viewUpCorners = _getCorners(bounds)
  const viewRightCorners = _getCorners(bounds)

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

function _getCorners(bounds) {
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

function normalizeWheel(event) {
  let spinX = 0,
    spinY = 0,
    pixelX = 0,
    pixelY = 0

  // Legacy
  if ('detail' in event) {
    spinY = event.detail
  }
  if ('wheelDelta' in event) {
    spinY = -event.wheelDelta / 120
  }
  if ('wheelDeltaY' in event) {
    spinY = -event.wheelDeltaY / 120
  }
  if ('wheelDeltaX' in event) {
    spinX = -event.wheelDeltaX / 120
  }

  pixelX = spinX * PIXEL_STEP
  pixelY = spinY * PIXEL_STEP

  if ('deltaY' in event) {
    pixelY = event.deltaY
  }
  if ('deltaX' in event) {
    pixelX = event.deltaX
  }

  if ((pixelX || pixelY) && event.deltaMode) {
    if (event.deltaMode === 1) {
      // Delta in LINE units
      pixelX *= LINE_HEIGHT
      pixelY *= LINE_HEIGHT
    } else {
      // Delta in PAGE units
      pixelX *= PAGE_HEIGHT
      pixelY *= PAGE_HEIGHT
    }
  }

  // Fall-back if spin cannot be determined
  if (pixelX && !spinX) {
    spinX = pixelX < 1 ? -1 : 1
  }
  if (pixelY && !spinY) {
    spinY = pixelY < 1 ? -1 : 1
  }

  return {
    spinX,
    spinY,
    pixelX,
    pixelY,
  }
}

function sortDatasetsByImagePosition(scanAxisNormal, imageMetaDataMap) {
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

function buildMetadata(imageIds) {
  // Retrieve the Cornerstone imageIds from the display set
  // TODO: In future, we want to get the metadata independently from Cornerstone
  const imageId0 = imageIds[0]

  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    samplesPerPixel,
  } = cornerstone.metaData.get('imagePixelModule', imageId0)

  let { windowWidth, windowCenter } = cornerstone.metaData.get(
    'voiLutModule',
    imageId0
  )

  // TODO maybe expose voi lut lists?
  if (Array.isArray(windowWidth)) {
    windowWidth = windowWidth[0]
  }

  if (Array.isArray(windowCenter)) {
    windowCenter = windowCenter[0]
  }

  const { modality } = cornerstone.metaData.get('generalSeriesModule', imageId0)

  // Compute the image size and spacing given the meta data we already have available.
  const metaDataMap = new Map()
  imageIds.forEach((imageId) => {
    // TODO: Retrieve this from somewhere other than Cornerstone
    const metaData = cornerstone.metaData.get('imagePlaneModule', imageId)

    metaDataMap.set(imageId, metaData)
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

function resetCamera() {
  const renderer = volumeRenderer

  const bounds = renderer.computeVisiblePropBounds()
  const focalPoint = [0, 0, 0]

  const activeCamera = renderer.getActiveCamera()
  const viewPlaneNormal = activeCamera.getViewPlaneNormal()
  const viewUp = activeCamera.getViewUp()

  // Reset the perspective zoom factors, otherwise subsequent zooms will cause
  // the view angle to become very small and cause bad depth sorting.
  activeCamera.setViewAngle(30.0)

  focalPoint[0] = (bounds[0] + bounds[1]) / 2.0
  focalPoint[1] = (bounds[2] + bounds[3]) / 2.0
  focalPoint[2] = (bounds[4] + bounds[5]) / 2.0

  const { widthWorld, heightWorld } = getWorldDistanceViewupAndViewRight(
    bounds,
    viewUp,
    viewPlaneNormal
  )

  const canvasSize = [canvasWidth, canvasHeight]

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

  const angle = vtkMath.radiansFromDegrees(activeCamera.getViewAngle())
  const parallelScale = radius

  let distance

  if (activeCamera.getParallelProjection()) {
    // Stick the camera just outside of the bounding sphere of all the volumeData so that MIP behaves correctly.

    let w1 = bounds[1] - bounds[0]
    let w2 = bounds[3] - bounds[2]
    let w3 = bounds[5] - bounds[4]

    w1 *= w1
    w2 *= w2
    w3 *= w3

    distance = w1 + w2 + w3

    // If we have just a single point, pick a radius of 1.0
    distance = distance === 0 ? 1.0 : distance

    // compute the radius of the enclosing sphere
    distance = 1.1 * (Math.sqrt(distance) / 2)
  } else {
    distance = radius / Math.sin(angle * 0.5)
  }

  // check view-up vector against view plane normal

  if (Math.abs(vtkMath.dot(viewUp, viewPlaneNormal)) > 0.999) {
    activeCamera.setViewUp(-viewUp[2], viewUp[0], viewUp[1])
  }

  // update the camera
  activeCamera.setFocalPoint(...focalPoint)
  activeCamera.setPosition(
    focalPoint[0] + distance * viewPlaneNormal[0],
    focalPoint[1] + distance * viewPlaneNormal[1],
    focalPoint[2] + distance * viewPlaneNormal[2]
  )

  renderer.resetCameraClippingRange(bounds)

  // setup default parallel scale
  activeCamera.setParallelScale(parallelScale)

  // update reasonable world to physical values
  activeCamera.setPhysicalScale(radius)
  activeCamera.setPhysicalTranslation(
    -focalPoint[0],
    -focalPoint[1],
    -focalPoint[2]
  )

  const RESET_CAMERA_EVENT = {
    type: 'ResetCameraEvent',
    renderer,
  }

  // Here to let parallel/distributed compositing intercept
  // and do the right thing.
  renderer.invokeEvent(RESET_CAMERA_EVENT)
  volumeRenderWindow.render()
  return true
}

async function createStudyImageIds() {
  const client = new api.DICOMwebClient({ url: wadoRsRoot })
  const SOP_INSTANCE_UID = '00080018'

  const promises = []
  const seriesInstances = await client.retrieveSeriesMetadata({
    studyInstanceUID,
    seriesInstanceUID,
  })
  const imageIds = seriesInstances.map((metaData) => {
    const sopInstanceUID = metaData[SOP_INSTANCE_UID].Value[0]
    const imageId = `wadors:${wadoRsRoot}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}/frames/1`
    promises.push(
      cornerstoneWADOImageLoader.wadors.metaDataManager.add(imageId, metaData)
    )
    return imageId
  })

  await Promise.all(promises)
  return imageIds
}

function prefetchImageIds(
  imageIds,
  insertPixelData,
  insertPixelDataErrorHandler
) {
  imageIds.forEach((imageId) => {
    requestPoolManager.addRequest(
      {},
      imageId,
      requestType,
      preventCache,
      insertPixelData,
      insertPixelDataErrorHandler
    )
  })

  requestPoolManager.startGrabbing()
}

async function createImageDataObject() {
  const imageIds = await createStudyImageIds()
  const { metaData0, metaDataMap, imageMetaData0 } = buildMetadata(imageIds)

  const { rowCosines, columnCosines } = metaData0
  const rowCosineVec = vec3.fromValues(...rowCosines)
  const colCosineVec = vec3.fromValues(...columnCosines)
  const scanAxisNormal = vec3.cross([], rowCosineVec, colCosineVec)

  const { spacing, origin, sortedDatasets } = sortDatasetsByImagePosition(
    scanAxisNormal,
    metaDataMap
  )

  const xSpacing = metaData0.columnPixelSpacing
  const ySpacing = metaData0.rowPixelSpacing
  const zSpacing = spacing
  const xVoxels = metaData0.columns
  const yVoxels = metaData0.rows
  const zVoxels = 2 // metaDataMap.size;
  const signed = imageMetaData0.pixelRepresentation === 1

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

  return {
    imageIds,
    imageData,
    metaDataMap,
    sortedDatasets,
  }
}

function createActorMapper(imageData) {
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

function loadImageData({ imageIds, imageData, metaDataMap, sortedDatasets }) {
  const numberOfFrames = imageIds.length
  const middleSliceIndex = Math.floor(numberOfFrames / 2)
  // If no seriesModule is present will default to linear scaling function.
  const scalars = imageData.getPointData().getScalars()
  const scalarData = scalars.getData()
  scalarData[0] = 1
  let numberProcessed = 0

  const insertPixelData = (image) => {
    const { imageId } = image

    const { imagePositionPatient } = metaDataMap.get(imageId)

    const sliceIndex = sortedDatasets.findIndex(
      (dataset) => dataset.imagePositionPatient === imagePositionPatient
    )

    const pixels = image.getPixelData()

    if (!pixelDataCache[sliceIndex]) {
      pixelDataCache[sliceIndex] = pixels
    }

    if (numberProcessed === middleSliceIndex) {
      currentSliceIndex = middleSliceIndex
      const scalars = imageData.getPointData().getScalars()
      const scalarData = scalars.getData()
      for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex++) {
        scalarData[pixelIndex] = pixels[pixelIndex]
        // scalarData[pixelIndex + pixels.length] = pixels[pixelIndex];
      }
      renderAll(imageData)
    }
    numberProcessed++
  }

  // const insertPixelData = (image) => {
  //   const { imagePositionPatient } = metaDataMap.get(image.imageId);

  //   const sliceIndex = sortedDatasets.findIndex(
  //     (dataset) => dataset.imagePositionPatient === imagePositionPatient,
  //   );

  //   const scalars = imageData.getPointData().getScalars();
  //   const scalarData = scalars.getData();

  //   const pixels = image.getPixelData();
  //   const sliceLength = pixels.length;
  //   for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex++) {
  //     const destIdx = pixelIndex + sliceIndex * sliceLength;
  //     const pixel = pixels[pixelIndex];
  //     const pixelValue = pixel;
  //     scalarData[destIdx] = pixelValue;
  //   }
  //   numberProcessed++;
  //   if (numberProcessed === numberOfFrames) {
  //     renderAll(imageData);
  //   }
  // };

  const insertPixelDataErrorHandler = () => {}

  prefetchImageIds(imageIds, insertPixelData, insertPixelDataErrorHandler)
}

function renderAll(imageData) {
  const volActor = createActorMapper(imageData)
  const volumes = volumeRenderer.getVolumes()
  volumes.forEach((volume) => {
    volumeRenderer.removeViewProp(volume)
  })
  // volumeRenderer.removeAllActors();
  // volumeRenderer.removeAllVolumes();
  volumeRenderer.addActor(volActor)

  const camera = volumeRenderer.getActiveCamera()
  camera.setDirectionOfProjection(0, 0, 1)
  camera.setViewUp(0, -1, 0)
  resetCamera()

  volumeRenderWindow.render() // second render displays correct colors
}

function VolumeMapper2DExample() {
  const viewRef = useRef()
  const [imageDataObject, setImageDataObject] = useState(null)

  useEffect(() => {
    const load = async () => {
      const imageDataObject = await createImageDataObject()
      setImageDataObject(imageDataObject)
    }

    volumeViewer.setContainer(viewRef.current)
    load()
  }, [])

  useEffect(() => {
    if (!imageDataObject) return
    loadImageData(imageDataObject)
    const { imageData } = imageDataObject
    // renderAll();

    viewRef.current.addEventListener('wheel', (evt) => {
      evt.stopPropagation()
      evt.preventDefault()
      const { spinY } = normalizeWheel(evt)
      const direction = spinY < 0 ? -1 : 1

      let newSliceIndex = currentSliceIndex + direction
      const { length: numberOfSlices } = pixelDataCache

      if (newSliceIndex >= numberOfSlices) newSliceIndex = numberOfSlices - 1
      if (newSliceIndex < 0) newSliceIndex = 0
      const scalars = imageData.getPointData().getScalars()
      const scalarData = scalars.getData()
      const pixels = pixelDataCache[newSliceIndex]
      for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex++) {
        scalarData[pixelIndex] = pixels[pixelIndex]
        // scalarData[pixelIndex + pixels.length] = pixels[pixelIndex];
      }
      currentSliceIndex = newSliceIndex
      volumeRenderer.removeAllVolumes()
      renderAll(imageData)
    })
  }, [imageDataObject])

  return (
    <div>
      <div className="container">
        <div
          ref={viewRef}
          id="volumeViewer"
          style={{ width: canvasWidth, height: canvasHeight }}
        ></div>
      </div>
    </div>
  )
}

export default VolumeMapper2DExample

// window.volumeRenderWindow = volumeRenderWindow;
// window.volumeRenderer = volumeRenderer;
