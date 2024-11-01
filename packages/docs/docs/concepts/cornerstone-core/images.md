---
id: images
title: Image Object
---

# Image Object

Cornerstone [Image Loaders](./imageLoader.md) return `Image Load Objects` which contain a Promise. The reason we have chosen to use an Object instead of solely returning a Promise is because now Image Loaders can also return other properties in their Image Load Objects. As an example, we intend to implement support for `cancelling` pending or ongoing requests using a `cancelFn` passed back by an Image Loader within an Image Load Object.

Here is an interface of such Image Load Object. You can read more about each
field in the [IImage section](/api/core/namespace/Types#IImage) of API reference.

```js
interface IImage {
  imageId: string
  sharedCacheKey?: string
  minPixelValue: number
  maxPixelValue: number
  slope: number
  intercept: number
  windowCenter: number[]
  windowWidth: number[]
  getPixelData: () => Array<number>
  getCanvas: () => HTMLCanvasElement
  rows: number
  columns: number
  height: number
  width: number
  color: boolean
  rgba: boolean
  numberOfComponents: number
  columnPixelSpacing: number
  rowPixelSpacing: number
  sliceThickness?: number
  invert: boolean
  sizeInBytes: number
  scaling?: {
    PET?: {
      SUVlbmFactor?: number
      SUVbsaFactor?: number
      suvbwToSuvlbm?: number
      suvbwToSuvbsa?: number
    }
  }
}
```
