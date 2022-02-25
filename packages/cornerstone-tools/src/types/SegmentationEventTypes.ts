import { Types } from '@precisionmetrics/cornerstone-render'

export type SegmentationDataModifiedEvent = Types.CustomEventType<{
  toolGroupUID: string
  segmentationDataUID: string
}>

export type SegmentationStateModifiedEvent = Types.CustomEventType<{
  toolGroupUID: string
}>
