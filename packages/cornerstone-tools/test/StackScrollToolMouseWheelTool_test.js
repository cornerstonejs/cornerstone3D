import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_scrolled from './groundTruth/volumeURI_100_100_10_1_1_1_0_scrolled.png'
import * as imageURI_64_64_0_20_1_1_0_scrolled from './groundTruth/imageURI_64_64_0_20_1_1_0_scrolled.png'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  INTERPOLATION_TYPE,
  EVENTS,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  createAndCacheVolume,
  registerVolumeLoader,
} = cornerstone3D

const { StackScrollMouseWheelTool, ToolGroupManager } = csTools3d

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  createNormalizedMouseEvent,
  compareImages,
} = Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID22'

const scene1UID = 'SCENE_12'
const viewportUID = 'VIEWPORT22'

const AXIAL = 'AXIAL'

const DOMElements = []

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`

function createCanvas(renderingEngine, viewportType, width, height) {
  // TODO: currently we need to have a parent div on the canvas with
  // position of relative for the svg layer to be set correctly
  const viewportPane = document.createElement('div')
  viewportPane.style.width = `${width}px`
  viewportPane.style.height = `${height}px`

  document.body.appendChild(viewportPane)

  const canvas = document.createElement('canvas')

  canvas.style.width = '100%'
  canvas.style.height = '100%'
  viewportPane.appendChild(canvas)

  DOMElements.push(canvas)
  DOMElements.push(viewportPane)

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: viewportType,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION[AXIAL],
      },
    },
  ])
  return canvas
}

describe('Cornerstone Tools Scroll Wheel: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(StackScrollMouseWheelTool, {})
    cache.purgeCache()
    this.stackToolGroup = ToolGroupManager.createToolGroup('StackScroll')
    this.stackToolGroup.addTool('StackScrollMouseWheel', {})
    this.stackToolGroup.setToolActive('StackScrollMouseWheel')

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    csTools3d.destroy()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupById('StackScroll')

    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully scroll through a volume', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.ORTHOGRAPHIC,
      512,
      128
    )

    const vp = this.renderingEngine.getViewport(viewportUID)

    const renderEventHandler = () => {
      const index1 = [50, 50, 4]

      const { imageData } = vp.getImageData()

      const { pageX: pageX1, pageY: pageY1 } = createNormalizedMouseEvent(
        imageData,
        index1,
        canvas,
        vp
      )

      let evt = new WheelEvent('wheel', {
        target: canvas,
        pageX: pageX1,
        pageY: pageY1,
        deltaX: 0,
        deltaY: 12,
        deltaMode: 0,
        wheelDelta: -36,
        wheelDeltaX: 0,
        wheelDeltaY: -36,
      })

      attachEventHandler()

      // Note: I don't know why I need this setTimeOut here
      canvas.dispatchEvent(evt)
    }

    const attachEventHandler = () => {
      canvas.removeEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png')
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_scrolled,
          'volumeURI_100_100_10_1_1_1_0_scrolled'
        ).then(done, done.fail)
      })
    }

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    )

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        const ctScene = this.renderingEngine.getScene(scene1UID)
        ctScene.setVolumes([{ volumeUID: volumeId }])
        ctScene.render()
      })
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully scroll through stack of images', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      256,
      256
    )

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const imageId2 = 'fakeImageLoader:imageURI_64_64_0_20_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    const renderEventHandler = () => {
      // First render is the actual image render
      const index1 = [50, 50, 4]

      const { imageData } = vp.getImageData()

      const { pageX: pageX1, pageY: pageY1 } = createNormalizedMouseEvent(
        imageData,
        index1,
        canvas,
        vp
      )

      let evt = new WheelEvent('wheel', {
        target: canvas,
        pageX: pageX1,
        pageY: pageY1,
        deltaX: 0,
        deltaY: 12,
        deltaMode: 0,
        wheelDelta: -36,
        wheelDeltaX: 0,
        wheelDeltaY: -36,
      })

      attachEventHandler()
      canvas.dispatchEvent(evt)
    }

    const attachEventHandler = () => {
      canvas.removeEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        // Second render is as a result of scrolling
        const image = canvas.toDataURL('image/png')
        compareImages(
          image,
          imageURI_64_64_0_20_1_1_0_scrolled,
          'imageURI_64_64_0_20_1_1_0_scrolled'
        ).then(done, done.fail)
      })
    }

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    )

    try {
      vp.setStack([imageId1, imageId2], 0).then(() => {
        vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
        vp.render()
      })
    } catch (e) {
      done.fail(e)
    }
  })
})
