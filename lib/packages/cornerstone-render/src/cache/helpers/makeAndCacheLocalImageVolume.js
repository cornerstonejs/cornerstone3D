// import cache from '../cache';
// import ImageVolume from '../classes/ImageVolume';
// export default function makeAndCacheLocalImageVolume(
//   properties: any = {},
//   uid: string,
// ): ImageVolume => {
//   if (uid === undefined) {
//     uid = uuidv4()
//   }
//   const cachedVolume = cache._get(uid)
//   if (cachedVolume) {
//     return cachedVolume
//   }
//   let {
//     metadata,
//     dimensions,
//     spacing,
//     origin,
//     direction,
//     scalarData,
//   } = properties
//   const scalarLength = dimensions[0] * dimensions[1] * dimensions[2]
//   // Check if it fits in the cache before we allocate data
//   const currentCacheSize = this.getCacheSize()
//   const byteLength = scalarData
//     ? scalarData.buffer.byteLength
//     : scalarLength * 4
//   cache.checkCacheSizeCanSupportVolume(byteLength);
//   if (scalarData) {
//     if (
//       !(scalarData instanceof Uint8Array) &&
//       !(scalarData instanceof Float32Array)
//     ) {
//       throw new Error(
//         `scalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
//       )
//     }
//   } else {
//     scalarData = new Float32Array(scalarLength)
//   }
//   const scalarArray = vtkDataArray.newInstance({
//     name: 'Pixels',
//     numberOfComponents: 1,
//     values: scalarData,
//   })
//   const imageData = vtkImageData.newInstance()
//   imageData.setDimensions(...dimensions)
//   imageData.setSpacing(...spacing)
//   imageData.setDirection(...direction)
//   imageData.setOrigin(...origin)
//   imageData.getPointData().setScalars(scalarArray)
//   const volume = new ImageVolume({
//     uid,
//     metadata,
//     dimensions,
//     spacing,
//     origin,
//     direction,
//     vtkImageData: imageData,
//     scalarData: scalarData,
//   })
//   this._set(uid, volume)
//   return volume
// }
//# sourceMappingURL=makeAndCacheLocalImageVolume.js.map