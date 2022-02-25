import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import { ImageVolume } from '../index'
import {
  getVerticalBarRGBVolume,
  getVerticalBarVolume,
  getExactRegionVolume,
} from './testUtilsPixelData'

const fakeVolumeLoader = (volumeId) => {
  const volumeURI = volumeId.split(':')[1]
  const uriName = volumeURI.split('_')[0]
  const [
    _,
    rows,
    columns,
    slices,
    x_spacing,
    y_spacing,
    z_spacing,
    rgb,
    startX,
    startY,
    startZ,
    endX,
    endY,
    endZ,
    valueForSegmentIndex,
  ] = volumeURI.split('_').map((v) => parseFloat(v))

  // If uri name is volumeURIExact, it means that the metadata provided
  // has the start and end indices of the region of interest.
  let useExactRegion = false
  if (uriName === 'volumeURIExact') {
    useExactRegion = true
  }

  const dimensions = [rows, columns, slices]

  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2'

  const volumeMetadata = {
    BitsAllocated: rgb ? 24 : 8,
    BitsStored: rgb ? 24 : 8,
    SamplesPerPixel: rgb ? 3 : 1,
    HighBit: rgb ? 24 : 8,
    PixelRepresentation: 0,
    PhotometricInterpretation: photometricInterpretation,
    FrameOfReferenceUID: 'Volume_Frame_Of_Reference',
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [x_spacing, y_spacing, z_spacing],
    Columns: columns,
    Rows: rows,
  }

  let pixelData
  if (rgb) {
    pixelData = getVerticalBarRGBVolume(rows, columns, slices)
  } else if (useExactRegion) {
    pixelData = getExactRegionVolume(
      rows,
      columns,
      slices,
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      valueForSegmentIndex
    )
  } else {
    pixelData = getVerticalBarVolume(rows, columns, slices)
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: rgb ? 3 : 1,
    values: pixelData,
  })

  const imageData = vtkImageData.newInstance()
  imageData.setDimensions(dimensions)
  imageData.setSpacing([1, 1, 1])
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1])
  imageData.setOrigin([0, 0, 0])
  imageData.getPointData().setScalars(scalarArray)

  const imageVolume = new ImageVolume({
    uid: volumeId,
    metadata: volumeMetadata,
    dimensions: dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    scalarData: pixelData,
    sizeInBytes: pixelData.byteLength,
    imageData: imageData,
    imageIds: [],
  })

  return {
    promise: Promise.resolve(imageVolume),
  }
}

export { fakeVolumeLoader }
