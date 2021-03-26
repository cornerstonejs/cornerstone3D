import cache from '../cache';

export default function makeAndCacheDerivedVolume (
  referencedVolumeUID,
  options: any = {}
): ImageVolume => {
  const referencedVolume = cache._get(referencedVolumeUID)

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with UID ${referencedVolumeUID} does not exist.`
    )
  }

  let { volumeScalarData, uid } = options

  if (uid === undefined) {
    uid = uuidv4()
  }

  const {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
  } = referencedVolume

  const scalarLength = scalarData.length

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = this.getCacheSize()

  let byteLength

  if (volumeScalarData) {
    byteLength = volumeScalarData.buffer.byteLength
  } else {
    byteLength = scalarLength * 4
  }

  cache.checkCacheSizeCanSupportVolume(byteLength);

  if (volumeScalarData) {
    if (volumeScalarData.length !== scalarLength) {
      throw new Error(
        `volumeScalarData has incorrect length compared to source data. Length: ${volumeScalarData.length}, expected:scalarLength`
      )
    }

    if (
      !(volumeScalarData instanceof Uint8Array) &&
      !(volumeScalarData instanceof Float32Array)
    ) {
      throw new Error(
        `volumeScalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
      )
    }
  } else {
    volumeScalarData = new Float32Array(scalarLength)
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  })

  const derivedImageData = vtkImageData.newInstance()

  derivedImageData.setDimensions(...dimensions)
  derivedImageData.setSpacing(...spacing)
  derivedImageData.setDirection(...direction)
  derivedImageData.setOrigin(...origin)
  derivedImageData.getPointData().setScalars(scalarArray)

  const derivedVolume = new ImageVolume({
    uid,
    metadata: _cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing: [...spacing],
    origin: [...spacing],
    direction: [...direction],
    vtkImageData: derivedImageData,
    scalarData: volumeScalarData,
  })

  this._set(uid, derivedVolume)

  return derivedVolume
}
