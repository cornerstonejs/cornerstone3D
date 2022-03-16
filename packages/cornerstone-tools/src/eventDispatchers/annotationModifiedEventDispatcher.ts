import {
  eventTarget,
  getRenderingEngine,
} from '@precisionmetrics/cornerstone-render'
import EVENTS from '../enums/CornerstoneTools3DEvents'
import triggerAnnotationRenderForViewportUIDs from '../util/triggerAnnotationRenderForViewportUIDs'
import { AnnotationModifiedEventType } from '../types/EventTypes'

/**
 * This is a callback function that is called when an annotation is modified.
 * Since we are throttling the cachedStats calculation for annotation tools,
 * we need to trigger a final render for the annotation. so that the annotation
 * textBox is updated.
 * Todo: This will trigger all the annotation tools to re-render, although DOM
 * will update those that have changed, but more efficient would be to only
 * update the changed annotation.
 * Todo: A better way is to extract the textBox render logic from the renderAnnotation
 * of all tools and just trigger a render for that (instead of the entire annotation., even if
 * no svg update happens since the attributes for handles are the same)
 */
const onAnnotationModified = function (evt: AnnotationModifiedEventType) {
  const { viewportUID, renderingEngineUID } = evt.detail
  const renderingEngine = getRenderingEngine(renderingEngineUID)
  triggerAnnotationRenderForViewportUIDs(renderingEngine, [viewportUID])
}

const enable = function () {
  eventTarget.addEventListener(EVENTS.ANNOTATION_MODIFIED, onAnnotationModified)
}

const disable = function () {
  eventTarget.removeEventListener(
    EVENTS.ANNOTATION_MODIFIED,
    onAnnotationModified
  )
}

export default {
  enable,
  disable,
}
