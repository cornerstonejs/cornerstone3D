import { annotationRenderingEngine } from '../stateManagement/annotation/AnnotationRenderingEngine';

/**
 * It triggers the rendering of the annotations for the given HTML element using
 * the `AnnotationRenderingEngine`
 * @param element - The element to render the annotation on.
 */
function triggerAnnotationRender(element: HTMLDivElement): void {
  annotationRenderingEngine.renderViewport(element);
}

export default triggerAnnotationRender;
