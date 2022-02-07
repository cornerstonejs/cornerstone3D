import CPUFallbackLUT from './CPUFallbackLUT'
import CPUFallbackColormap from './CPUFallbackColormap'
import CPUFallbackEnabledElement from './CPUFallbackEnabledElement'

interface IImage {
  imageId: string
  sharedCacheKey?: string
  minPixelValue: number
  maxPixelValue: number
  slope: number
  intercept: number
  windowCenter: number[] | number
  windowWidth: number[] | number
  getPixelData: () => Array<number>
  getCanvas: () => HTMLCanvasElement
  rows: number
  columns: number
  height: number
  width: number
  color: boolean
  rgba: boolean
  numComps: number
  render?: (
    enabledElement: CPUFallbackEnabledElement,
    invalidated: boolean
  ) => unknown
  columnPixelSpacing: number
  rowPixelSpacing: number
  sliceThickness?: number
  invert: boolean
  sizeInBytes: number
  modalityLUT?: CPUFallbackLUT
  voiLUT?: CPUFallbackLUT
  colormap?: CPUFallbackColormap
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
  stats?: {
    lastStoredPixelDataToCanvasImageDataTime?: number
    lastGetPixelDataTime?: number
    lastPutImageDataTime?: number
    lastLutGenerateTime?: number
    lastRenderedViewport?: unknown
    lastRenderTime?: number
  }
  cachedLut?: {
    windowWidth?: number | number[]
    windowCenter?: number | number[]
    invert?: boolean
    lutArray?: Uint8ClampedArray
    modalityLUT?: unknown
    voiLUT?: CPUFallbackLUT
  }
}

export default IImage
