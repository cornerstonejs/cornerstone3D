import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  EVENTS,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  getEnabledElement,
  eventTarget,
  createAndCacheVolume,
  registerVolumeLoader,
} = cornerstone3D

const {
  EllipticalRoiTool,
  ToolGroupManager,
  getToolState,
  removeToolState,
  CornerstoneTools3DEvents,
  cancelActiveManipulations,
} = csTools3d

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const DOMElements = []

function createCanvas(renderingEngine, viewportType, width, height) {
  // TODO: currently we need to have a parent div on the canvas with
  // position of relative for the svg layer to be set correctly
  const viewportPane = document.createElement('div')
  viewportPane.style.position = 'relative'
  viewportPane.style.width = `${width}px`
  viewportPane.style.height = `${height}px`

  document.body.appendChild(viewportPane)

  const canvas = document.createElement('canvas')

  canvas.style.position = 'absolute'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  viewportPane.appendChild(canvas)

  DOMElements.push(canvas)
  DOMElements.push(viewportPane)

  renderingEngine.enableElement(
    {
      sceneUID: scene1UID,
      viewportUID,
      type: viewportType,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION[AXIAL],
      },
    },
  )

  return canvas
}

const volumeId = `fakeVolumeLoader:volumeURI_100_100_4_1_1_1_0`

describe('Cornerstone Tools: ', () => {
  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(EllipticalRoiTool, {})
    cache.purgeCache()
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
    this.stackToolGroup.addTool('EllipticalRoi', {
      configuration: { volumeUID: volumeId },
    })
    this.stackToolGroup.setToolActive('EllipticalRoi', {
      bindings: [{ mouseButton: 1 }],
    })

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    this.renderingEngine.disableElement(viewportUID)

    csTools3d.destroy()
    eventTarget.reset()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupById('stack')

    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully create a ellipse tool on a canvas with mouse drag - 512 x 128', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      128
    )

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas)
          const ellipseToolState = getToolState(enabledElement, 'EllipticalRoi')
          // Can successfully add Length tool to toolStateManager
          expect(ellipseToolState).toBeDefined()
          expect(ellipseToolState.length).toBe(1)

          const ellipseToolData = ellipseToolState[0]
          expect(ellipseToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )

          expect(ellipseToolData.metadata.toolName).toBe('EllipticalRoi')
          expect(ellipseToolData.data.invalidated).toBe(false)

          const data = ellipseToolData.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          // the rectangle is drawn on the strip
          expect(data[targets[0]].mean).toBe(255)

          removeToolState(canvas, ellipseToolData)
          done()
        }
      )
    }

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      // Since ellipse draws from center to out, we are picking a very center
      // point in the image  (strip is 255 from 10-15 in X and from 0-64 in Y)
      const index1 = [12, 30, 0]
      const index2 = [14, 40, 0]

      const { vtkImageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(vtkImageData, index1, canvas, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(vtkImageData, index2, canvas, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      canvas.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      })
      document.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')

      addEventListenerForAnnotationRendered()
      document.dispatchEvent(evt)
    })

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    )

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully create a ellipse tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.ORTHOGRAPHIC,
      512,
      128
    )

    const vp = this.renderingEngine.getViewport(viewportUID)

    const addEventListenerForAnnotationRendered = () => {
      canvas.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const enabledElement = getEnabledElement(canvas)
          const ellipseToolState = getToolState(enabledElement, 'EllipticalRoi')
          // Can successfully add Length tool to toolStateManager
          expect(ellipseToolState).toBeDefined()
          expect(ellipseToolState.length).toBe(1)

          const ellipseToolData = ellipseToolState[0]
          expect(ellipseToolData.metadata.toolName).toBe('EllipticalRoi')
          expect(ellipseToolData.data.invalidated).toBe(false)

          const data = ellipseToolData.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          expect(data[targets[0]].mean).toBe(255)
          expect(data[targets[0]].stdDev).toBe(0)

          removeToolState(canvas, ellipseToolData)
          done()
        }
      )
    }

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const index1 = [60, 50, 2]
      const index2 = [65, 60, 2]

      const { vtkImageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(vtkImageData, index1, canvas, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(vtkImageData, index2, canvas, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      canvas.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      })
      document.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')

      addEventListenerForAnnotationRendered()
      document.dispatchEvent(evt)
    })

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
})

describe('Should successfully cancel a EllipseTool', () => {
  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(EllipticalRoiTool, {})
    cache.purgeCache()
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
    this.stackToolGroup.addTool('EllipticalRoi', {
      configuration: { volumeUID: volumeId },
    })
    this.stackToolGroup.setToolActive('EllipticalRoi', {
      bindings: [{ mouseButton: 1 }],
    })

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    csTools3d.destroy()
    eventTarget.reset()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupById('stack')

    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should cancel drawing of a EllipseTool annotation', function (done) {
    const canvas = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.STACK,
      512,
      128
    )

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    let p1, p2

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      // Since ellipse draws from center to out, we are picking a very center
      // point in the image  (strip is 255 from 10-15 in X and from 0-64 in Y)
      const index1 = [12, 30, 0]
      const index2 = [14, 40, 0]

      const { vtkImageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(vtkImageData, index1, canvas, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(vtkImageData, index2, canvas, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      canvas.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      })
      document.dispatchEvent(evt)

      // Cancel the drawing
      let e = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Esc',
        char: 'Esc',
      })
      canvas.dispatchEvent(e)

      e = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
      })
      canvas.dispatchEvent(e)
    })

    const cancelToolDrawing = () => {
      const canceledDataUID = cancelActiveManipulations(canvas)
      expect(canceledDataUID).toBeDefined()

      setTimeout(() => {
        const enabledElement = getEnabledElement(canvas)
        const ellipseToolState = getToolState(enabledElement, 'EllipticalRoi')
        // Can successfully add Length tool to toolStateManager
        expect(ellipseToolState).toBeDefined()
        expect(ellipseToolState.length).toBe(1)

        const ellipseToolData = ellipseToolState[0]
        expect(ellipseToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )

        expect(ellipseToolData.metadata.toolName).toBe('EllipticalRoi')
        expect(ellipseToolData.data.invalidated).toBe(false)
        expect(ellipseToolData.data.active).toBe(false)

        const data = ellipseToolData.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // the rectangle is drawn on the strip
        expect(data[targets[0]].mean).toBe(255)

        removeToolState(canvas, ellipseToolData)
        done()
      }, 100)
    }

    this.stackToolGroup.addViewports(
      this.renderingEngine.uid,
      undefined,
      vp.uid
    )

    canvas.addEventListener(
      CornerstoneTools3DEvents.KEY_DOWN,
      cancelToolDrawing
    )

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
})
