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
  public removeViewportElement(viewportId: string, element: HTMLDivElement) {
    this._viewportElements.delete(viewportId);

    // delete element from needsRender if element exist
    this._needsRender.delete(element);

    // I don' think there is any disadvantage to canceling the animation frame
    // and resetting the flags on viewport's element removal, since the removeVIewportElement
    // might be as a result of reEnabling the element (in re-enable we disable first), hence the need to render the
    // new one while removing the old one
    this._reset();
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
          break;
        }
      }
    }

    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    // Call render again which will use RAF to call this function asynchronously
    // if there is any viewport that needs to be rendered because when
    // `triggerRender` is called inside the render loop a listener can flag new
    // viewports that need to be rendered and some of the viewports that were
    // already rendered can be added back to `_needsRender`.
    this._render();
  };

  private _setAllViewportsToBeRenderedNextFrame() {
    const elements = [...this._viewportElements.values()];

    elements.forEach((element) => {
      this._needsRender.add(element);
    });

    this._renderFlaggedViewports();
  }

  private _setViewportsToBeRenderedNextFrame(elements: HTMLDivElement[]) {
    const elementsEnabled = [...this._viewportElements.values()];

    // Add the viewports to the set of flagged viewports
    elements.forEach((element) => {
      // only enabledElement need to render
      if (elementsEnabled.indexOf(element) !== -1) {
        this._needsRender.add(element);
      }
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
    //   const annotations = getAnnotations(tool.getToolName(), {FrameOfReferenceUID});
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

    this._setAllViewportsToBeRenderedNextFrame();
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
