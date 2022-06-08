import {
  getEnabledElement,
  triggerEvent,
  getRenderingEngine,
} from '@cornerstonejs/core';
import { Events, ToolModes } from '../enums';
import { draw as drawSvg } from '../drawingSvg';
import getToolsWithModesForElement from './getToolsWithModesForElement';
import { AnnotationRenderedEventDetail } from '../types/EventTypes';
const { Active, Passive, Enabled } = ToolModes;

/**
 * AnnotationRenderingEngine is a class that is responsible for rendering
 * annotations defined in the renderAnnotation method of annotation tools on the page.
 * It mimics the RenderingEngine in the Cornerstone Core. Here it uses requestAnimationFrame
 * is used to render annotations by calling renderAnnotations() on each enabled tool. Note: This
 * is a Singleton class and should not be instantiated directly. To trigger
 * an annotation render for an HTML element containing a viewport you can use
 *
 * ```
 * triggerAnnotationRender(element)
 * ```
 */
class AnnotationRenderingEngine {
  public hasBeenDestroyed: boolean;
  private _needsRender: Set<HTMLDivElement> = new Set();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  private _viewportElements: Map<string, HTMLDivElement>;

  constructor() {
    this._viewportElements = new Map();
  }

  /**
   * Add the viewport's HTMLDivElement to the viewports for rendering. This method
   * just informs the annotationRenderingEngine about the viewport and
   * does not initiate a render.
   * @param viewportId - Viewport Unique identifier
   * @param element - HTMLDivElement
   */
  public addViewportElement(viewportId: string, element: HTMLDivElement) {
    this._viewportElements.set(viewportId, element);
  }

  /**
   * Remove the viewport's HTMLDivElement from subsequent annotation renders
   * @param viewportId - Viewport Unique identifier
   */
  public removeViewportElement(viewportId: string) {
    this._viewportElements.delete(viewportId);

    // Reset the request animation frame if no enabled elements
    if (this._viewportElements.size === 0) {
      this._reset();
    }
  }

  /**
   * It tells the AnnotationRenderingEngine to render the viewport element the next
   * time it renders.
   *
   * @param element - The element to render.
   */
  public renderViewport(element: HTMLDivElement): void {
    this._setViewportsToBeRenderedNextFrame([element]);
  }

  /**
   * _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  private _renderFlaggedViewports = () => {
    this._throwIfDestroyed();

    const elements = Array.from(this._viewportElements.values());

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (this._needsRender.has(element)) {
        this._triggerRender(element);

        // This viewport has been rendered, we can remove it from the set
        this._needsRender.delete(element);

        // If there is nothing left that is flagged for rendering, stop here
        // and allow RAF to be called again
        if (this._needsRender.size === 0) {
          this._animationFrameSet = false;
          this._animationFrameHandle = null;
          return;
        }
      }
    }
  };

  private _setViewportsToBeRenderedNextFrame(elements: HTMLDivElement[]) {
    // Add the viewports to the set of flagged viewports
    elements.forEach((element) => {
      this._needsRender.add(element);
    });

    // Render any flagged viewports
    this._render();
  }

  /**
   * _render Sets up animation frame if necessary
   */
  private _render() {
    // If we have viewports that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      );

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true;
    }
  }

  _triggerRender(element) {
    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      console.warn('Element has been disabled');
      return;
    }

    const renderingEngine = getRenderingEngine(
      enabledElement.renderingEngineId
    );
    if (!renderingEngine) {
      console.warn('rendering Engine has been destroyed');
      return;
    }

    const enabledTools = getToolsWithModesForElement(element, [
      Active,
      Passive,
      Enabled,
    ]);

    const { renderingEngineId, viewportId } = enabledElement;
    const eventDetail: AnnotationRenderedEventDetail = {
      element,
      renderingEngineId,
      viewportId,
    };

    // const enabledToolsWithAnnotations = enabledTools.filter((tool) => {
    //   const annotations = getAnnotations(element, tool.getToolName());
    //   return annotations && annotations.length;
    // });

    drawSvg(element, (svgDrawingHelper) => {
      let anyRendered = false;
      const handleDrawSvg = (tool) => {
        if (tool.renderAnnotation) {
          const rendered = tool.renderAnnotation(
            enabledElement,
            svgDrawingHelper
          );
          anyRendered = anyRendered || rendered;
        }
      };

      /**
       * We should be able to filter tools that don't have annotations, but
       * currently some of tools have renderAnnotation method BUT
       * don't keep annotation in the state, so if we do so, the tool will not be
       * rendered.
       */
      enabledTools.forEach(handleDrawSvg);

      if (anyRendered) {
        triggerEvent(element, Events.ANNOTATION_RENDERED, { ...eventDetail });
      }
    });
  }

  /**
   * _reset Resets the `RenderingEngine`
   */
  private _reset() {
    window.cancelAnimationFrame(this._animationFrameHandle);

    this._needsRender.clear();
    this._animationFrameSet = false;
    this._animationFrameHandle = null;
  }
}

const annotationRenderingEngine = new AnnotationRenderingEngine();

/**
 * It triggers the rendering of the annotations for the given HTML element using
 * the `AnnotationRenderingEngine`
 * @param element - The element to render the annotation on.
 */
function triggerAnnotationRender(element: HTMLDivElement): void {
  annotationRenderingEngine.renderViewport(element);
}

export { annotationRenderingEngine, triggerAnnotationRender };

export default triggerAnnotationRender;
