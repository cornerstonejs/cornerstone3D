import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

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
function annotationModifiedListener(evt): void {
  const { viewportId } = evt.detail;
  triggerAnnotationRenderForViewportIds([viewportId]);
}

export default annotationModifiedListener;
