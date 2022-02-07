import RenderingEngine from '../RenderingEngine'
import { getRenderingEngine } from '../getRenderingEngine'
import getOrCreateCanvas from './getOrCreateCanvas'
import VIEWPORT_TYPE from '../../constants/viewportType'
import ORIENTATION from '../../constants/orientation'
import StackViewport from '../StackViewport'
import Events from '../../enums/events'

/**
 * Renders an imageId to a Canvas Element. This method will handle creation
 * of a tempporary enabled element, setting the imageId, and rendering the image via
 * a StackViewport, copying the canvas drawing to the given canvas Element, and
 * disabling the created temporary element. SuppressEvents argument is used to
 * prevent events from firing during the render process (e.g. during a series
 * of renders to a thumbnail image).
 * @param {string}imageId - The imageId to render
 * @param {HTMLCanvasElement} canvas - Canvas element to render to
 * @param {string} renderingEngineUID - The rendering engine UID to use
 * @param {boolean} suppressEvents - boolean to suppress events during render
 * @returns {Promise} - A promise that resolves when the image has been rendered with the imageId
 */
export default function renderToCanvas(
  imageId: string,
  canvas: HTMLCanvasElement,
  renderingEngineUID: string,
  suppressEvents = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    let renderingEngine = getRenderingEngine(renderingEngineUID)

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      renderingEngine = new RenderingEngine(renderingEngineUID)
    }

    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('canvas element is required')
    }

    if (!renderingEngine) {
      throw new Error(
        `No rendering engine with UID of ${renderingEngineUID} found`
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

    // Setting the viewportUID to imageId
    const viewportUID = imageId

    const stackViewportInput = {
      viewportUID,
      type: VIEWPORT_TYPE.STACK,
      element,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        suppressEvents,
      },
    }

    renderingEngine.enableElement(stackViewportInput)
    const viewport = renderingEngine.getViewport(viewportUID) as StackViewport

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // get the canvas element that is the child of the div
      const temporaryCanvas = getOrCreateCanvas(element)

      // Copy the temporary canvas to the given canvas
      const context = canvas.getContext('2d')

      context.drawImage(temporaryCanvas, 0, 0)
      renderingEngine.disableElement(viewportUID)
      document.body.removeChild(element)
      resolve(imageId)
    })

    viewport.setStack([imageId])
  })
}
