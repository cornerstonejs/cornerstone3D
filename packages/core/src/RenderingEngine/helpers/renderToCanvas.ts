import RenderingEngine from '../RenderingEngine'
import { getRenderingEngine } from '../getRenderingEngine'
import getOrCreateCanvas from './getOrCreateCanvas'
import ViewportType from '../../enums/ViewportType'
import ORIENTATION from '../../constants/orientation'
import StackViewport from '../StackViewport'
import Events from '../../enums/Events'

/**
 * Renders an imageId to a Canvas. This method will handle creation
 * of a temporary enabledElement, setting the imageId, and rendering the image via
 * a StackViewport, copying the canvas drawing to the given canvas Element, and
 * disabling the created temporary element. SuppressEvents argument is used to
 * prevent events from firing during the render process (e.g. during a series
 * of renders to a thumbnail image).
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 * const imageId = 'myImageId'
 *
 * renderToCanvas(canvas, imageId)
 * ```
 * @param imageId - The imageId to render
 * @param canvas - Canvas element to render to
 * @param renderingEngineId - [Default=null] The rendering engine Id
 * to use, if not provided, will create a new rendering engine with a random UID (this is preferred)
 * @param suppressEvents - [Default = true] boolean to suppress events during render,
 * if undefined, events will be suppressed
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function renderToCanvas(
  imageId: string,
  canvas: HTMLCanvasElement,
  renderingEngineId = null,
  suppressEvents = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If specific rendering engine is specified use that, otherwise create a
    // new one with random uid and use that.
    //
    // !!!!!IMPORTANT NOTE!!!!
    // using the same rendering engine for multiple renders
    // is tricky since here we are listening to IMAGE_RENDERED event to copy
    // the canvas contents to the given canvas element. This is not ideal since
    // many things can trigger IMAGE_RENDERED including: disabling of another
    // element (which would cause a resize event and consequently a render), or
    // a resize event by itself (which would cause a render).
    let renderingEngine = getRenderingEngine(renderingEngineId)

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      // Use a new renderingEngine with random uid
      renderingEngine = new RenderingEngine()
    }

    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('canvas element is required')
    }

    if (!renderingEngine) {
      throw new Error(
        `No rendering engine with UID of ${renderingEngineId} found`
      )
    }

    // Creating a temporary HTML element so that we can
    // enable it and later disable it without loosing the canvas context
    const element = document.createElement('div')
    element.style.width = `${canvas.width}px`
    element.style.height = `${canvas.height}px`

    // Todo: we should be able to use the temporary element without appending
    // it to the DOM
    element.style.visibility = 'hidden'
    document.body.appendChild(element)

    // Setting the viewportId to imageId
    const viewportId = imageId

    const stackViewportInput = {
      viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        suppressEvents,
      },
    }

    renderingEngine.enableElement(stackViewportInput)
    const viewport = renderingEngine.getViewport(viewportId) as StackViewport

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // get the canvas element that is the child of the div
      const temporaryCanvas = getOrCreateCanvas(element)

      // Copy the temporary canvas to the given canvas
      const context = canvas.getContext('2d')

      context.drawImage(temporaryCanvas, 0, 0)
      renderingEngine.disableElement(viewportId)
      document.body.removeChild(element)
      renderingEngine.destroy()
      resolve(imageId)
    })

    viewport.setStack([imageId])
  })
}
