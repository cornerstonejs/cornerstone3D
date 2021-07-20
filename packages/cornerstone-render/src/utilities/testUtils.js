import resemble from 'resemblejs'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import { ImageVolume } from '../index'

// 10 slice, 10 colors
const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [128, 0, 0],
  [0, 0, 255],
  [0, 128, 0],
  [255, 255, 0],
  [0, 255, 255],
  [0, 0, 0],
  [0, 0, 128],
  [255, 0, 255],
]

Object.freeze(colors)

const imageIds = [
  'fakeSharedBufferImageLoader:imageId1',
  'fakeSharedBufferImageLoader:imageId2',
  'fakeSharedBufferImageLoader:imageId3',
  'fakeSharedBufferImageLoader:imageId4',
  'fakeSharedBufferImageLoader:imageId5',
]

function makeTestImage1(rows, columns, barStart, barWidth) {
  const pixelData = new Uint8Array(rows * columns)

  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      pixelData[i * columns + j] = 255
    }
  }

  return pixelData
}

function makeTestRGB(rows, columns, barStart, barWidth) {
  let start = barStart

  const pixelData = new Uint8Array(rows * columns * 3)

  colors.forEach((color) => {
    for (let i = 0; i < rows; i++) {
      for (let j = start; j < start + barWidth; j++) {
        pixelData[(i * columns + j) * 3] = color[0]
        pixelData[(i * columns + j) * 3 + 1] = color[1]
        pixelData[(i * columns + j) * 3 + 2] = color[2]
      }
    }

    start += barWidth
  })

  return pixelData
}

/**
 * It creates an image based on the imageId name. It splits the imageId
 * based on "_" and deciphers each field of rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb
 * fakeLoader: myImage_64_64_10_20_1_1_0 will create a grayscale test image of size 64 by
 * 64 and with a vertical bar which starts at 10th pixel from right and span 20 pixels
 * width, with pixel spacing of 1 mm and 1 mm in x and y direction.
 * @param {imageId} imageId
 * @returns
 */
const fakeImageLoader = (imageId) => {
  const imageURI = imageId.split(':')[1]
  const [_, rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb] =
    imageURI.split('_').map((v) => parseFloat(v))

  let pixelData

  if (rgb) {
    pixelData = makeTestRGB(rows, columns, barStart, barWidth)
  } else {
    pixelData = makeTestImage1(rows, columns, barStart, barWidth)
  }

  const image = {
    rows,
    columns,
    imageId,
    getPixelData: () => pixelData,
    sizeInBytes: rows * columns * 1, // 1 byte for now
  }

  return {
    promise: Promise.resolve(image),
  }
}

function fakeMetaDataProvider(type, imageId) {
  const imageURI = imageId.split(':')[1]
  const [_, rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb] =
    imageURI.split('_').map((v) => parseFloat(v))

  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2'
  if (type === 'imagePixelModule') {
    const imagePixelModule = {
      photometricInterpretation,
      rows,
      columns,
      samplesPerPixel: rgb ? 3 : 1,
      bitsAllocated: rgb ? 24 : 8,
      bitsStored: rgb ? 24 : 8,
      highBit: rgb ? 24 : 8,
      pixelRepresentation: 0,
    }

    return imagePixelModule
  } else if (type === 'generalSeriesModule') {
    const generalSeriesModule = {
      modality: 'MR',
    }
    return generalSeriesModule
  } else if (type === 'imagePlaneModule') {
    const imagePlaneModule = {
      rows,
      columns,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
      pixelSpacing: [x_spacing, y_spacing],
      rowPixelSpacing: x_spacing,
      columnPixelSpacing: y_spacing,
    }

    return imagePlaneModule
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: undefined,
      windowCenter: undefined,
    }
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: undefined,
      rescaleIntercept: undefined,
    }
  }
}

const volumeLoader = (volumeId) => {
  const volumeURI = volumeId.split(':')[1]
  const [_, rows, columns, slices, x_spacing, y_spacing, z_spacing, rgb] =
    volumeURI.split('_').map((v) => parseFloat(v))

  const dimensions = [rows, columns, slices]

  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2'

  const volumeMetadata = {
    BitsAllocated: rgb ? 24 : 8,
    BitsStored: rgb ? 24 : 8,
    SamplesPerPixel: rgb ? 3 : 1,
    HighBit: rgb ? 24 : 8,
    PixelRepresentation: 0,
    PhotometricInterpretation: photometricInterpretation,
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [x_spacing, y_spacing, z_spacing],
    Columns: columns,
    Rows: rows,
  }

  const yMultiple = rows
  const zMultiple = rows * columns

  let barStart = 0
  const barWidth = Math.floor(rows / slices)
  let pixelData, index

  if (!rgb) {
    pixelData = new Uint8Array(rows * columns * slices)
    for (let z = 0; z < slices; z++) {
      for (let i = 0; i < rows; i++) {
        for (let j = barStart; j < barStart + barWidth; j++) {
          pixelData[z * zMultiple + i * yMultiple + j] = 255
        }
      }
      barStart += barWidth
    }
  } else {
    pixelData = new Uint8Array(rows * columns * slices * 3)

    for (let z = 0; z < slices; z++) {
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
          index = z * zMultiple + i * yMultiple + j
          pixelData[index * 3] = colors[z][0]
          pixelData[index * 3 + 1] = colors[z][1]
          pixelData[index * 3 + 2] = colors[z][2]
        }
      }
    }
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
    vtkImageData: imageData,
    imageIds: [],
  })

  return {
    promise: Promise.resolve(imageVolume),
  }
}

function downloadURI(uri, name) {
  const link = document.createElement('a')

  link.download = `${name}.png`
  link.href = uri
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function compareImages(imageDataURL, baseline, outputName) {
  return new Promise((resolve, reject) => {
    resemble.outputSettings({
      useCrossOrigin: false,
      errorColor: {
        red: 0,
        green: 255,
        blue: 0,
      },
      // errorType: 'movement',
      transparency: 0.5,
      largeImageThreshold: 1200,
      outputDiff: true,
    })

    resemble(baseline.default)
      .compareTo(imageDataURL)
      .onComplete((data) => {
        const mismatch = parseFloat(data.misMatchPercentage)
        // If the error is greater than 1%, fail the test
        // and download the difference image
        if (mismatch > 1) {
          console.debug(mismatch)
          const diff = data.getImageDataUrl()

          //downloadURI(diff, outputName)

          reject(new Error(`mismatch between images for ${outputName}`))
        } else {
          console.debug(`Images match for ${outputName}`)
          resolve()
        }
      })
  })
}

const testUtils = {
  makeTestImage1,
  fakeImageLoader,
  volumeLoader,
  fakeMetaDataProvider,
  compareImages,
  downloadURI,
}

export default testUtils
