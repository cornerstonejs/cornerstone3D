import { vec3 } from 'gl-matrix';
import cache from '../cache/cache';
import makeVolumeMetadata from '../cache/helpers/makeVolumeMetadata';
import sortImageIdsAndGetSpacing from '../cache/helpers/sortImageIdsAndGetSpacing';
import StreamingImageVolume from './StreamingImageVolume';

function makeAndCacheImageVolume = (
  imageIds: Array<string>,
  volumeId: string
): StreamingImageVolume => {
  if (volumeId === undefined) {
    volumeId = uuidv4()
  }

  const volumeLoadObject = cache.getVolumeLoadObject(volumeId)

  if (cachedVolume) {
    return volumeLoadObject.promise
  }

  const volumeMetadata = makeVolumeMetadata(imageIds)

  const {
    BitsAllocated,
    PixelRepresentation,
    ImageOrientationPatient,
    PixelSpacing,
    Columns,
    Rows,
  } = volumeMetadata

  const rowCosineVec = vec3.fromValues(
    ImageOrientationPatient[0],
    ImageOrientationPatient[1],
    ImageOrientationPatient[2]
  )
  const colCosineVec = vec3.fromValues(
    ImageOrientationPatient[3],
    ImageOrientationPatient[4],
    ImageOrientationPatient[5]
  )

  const scanAxisNormal = vec3.create()

  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  )

  const numFrames = imageIds.length

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const spacing = [PixelSpacing[1], PixelSpacing[0], zSpacing]
  const dimensions = <Point3>[Columns, Rows, numFrames]
  const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal]
  const signed = PixelRepresentation === 1

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = this.getCacheSize()

  // TODO Improve this when we have support for more types
  const bytesPerVoxel = BitsAllocated === 16 ? 4 : 1

  const byteLength =
    bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2]

  cache.checkCacheSizeCanSupportVolume(byteLength);

  let scalarData

  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        )
      } else {
        scalarData = createUint8SharedArray(
          dimensions[0] * dimensions[1] * dimensions[2]
        )
      }

      break

    case 16:
      scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      )

      break
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  })

  const imageData = vtkImageData.newInstance()

  imageData.setDimensions(...dimensions)
  imageData.setSpacing(...spacing)
  imageData.setDirection(...direction)
  imageData.setOrigin(...origin)
  imageData.getPointData().setScalars(scalarArray)

  const streamingImageVolume = new StreamingImageVolume(
    // ImageVolume properties
    {
      uid,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      vtkImageData: imageData,
      scalarData,
    },
    // Streaming properties
    {
      imageIds: sortedImageIds,
      loadStatus: {
        loaded: false,
        loading: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  )

  cache.putVolumeLoadObject(volumeId,{
    promise: Promise.resolve(streamingImageVolume)
    //decache
    //cancel: cancelLoadStreamingVolume
  });

  return streamingImageVolume
}

