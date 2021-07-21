---
id: images
title: Images
---


# Images

[Image Loaders](imageLoader.md) return an `image load` object.

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
  numComps: number
  columnPixelSpacing: number
  rowPixelSpacing: number
  sliceThickness?: number
  invert: boolean
  sizeInBytes: number
  scaling?: {
    PET?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number
      SUVbsaFactor?: number
      // accessed in ProbeTool
      suvbwToSuvlbm?: number
      suvbwToSuvbsa?: number
    }
  }
}
```












The properties of image in Cornerstone
can be seen in the API [here](../cornerstone-render/interfaces/Types.IImage.md)
