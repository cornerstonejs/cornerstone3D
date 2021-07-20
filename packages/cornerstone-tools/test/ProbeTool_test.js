import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

// nearest neighbor interpolation

// import { setCTWWWC } from '../../demo/src/helpers/transferFunctionHelpers'
// import { User } from ... doesn't work right now since we don't have named exports set up

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  EVENTS,
  getEnabledElement,
} = cornerstone3D

const { ProbeTool, ToolGroupManager, getToolState, removeToolState } = csTools3d

const { fakeImageLoader, fakeMetaDataProvider } = Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const DOMElements = []

function createCanvas(renderingEngine, orientation, width, height) {
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

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.STACK,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ])
  return canvas
}

describe('Cornerstone Tools: ', () => {
  beforeAll(function () {
    csTools3d.init()
    csTools3d.addTool(ProbeTool, {})
  })

  afterAll(function () {
    csTools3d.destroy()
  })

  beforeEach(function () {
    cache.purgeCache()
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
    this.stackToolGroup.addTool('Probe')
    this.stackToolGroup.setToolActive('Probe', { bindings: [1] })

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
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


  it('Should successfully click to put a probe tool on a canvas - 512 x 128', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 512, 128)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    // The place in world we want to have a mouse click
    const worldCoord = [11, 10, 0] // 255

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const [canvasX, canvasY] = vp.worldToCanvas(worldCoord)
      const rect = canvas.getBoundingClientRect()

      // We need clientX and clientY to click properly
      const clientX = canvasX + rect.left
      const clientY = canvasY + rect.top

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX,
        clientY: clientY,
      })
      canvas.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')
      document.dispatchEvent(evt)

      const enabledElement = getEnabledElement(canvas)
      const probeToolState = getToolState(enabledElement, 'Probe')

      // Todo: subscribe to the correct event to not have set time out
      setTimeout(() => {
        // Can successfully add probe tool to toolStateManager
        expect(probeToolState).toBeDefined()
        expect(probeToolState.length).toBe(1)

        const probeToolData = probeToolState[0]
        expect(probeToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(probeToolData.metadata.toolName).toBe('Probe')
        expect(probeToolData.data.invalidated).toBe(false)

        const data = probeToolData.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255)

        removeToolState(canvas, probeToolData)
        done()
      }, 1000)
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

  it('Should successfully click to put two probe tools on a canvas - 256 x 256', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    // The place in world we want to have a mouse click
    const worldCoord1 = [11, 30, 0] // 255
    const worldCoord2 = [40, 40, 0] // 0

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const [canvasX1, canvasY1] = vp.worldToCanvas(worldCoord1)
      const [canvasX2, canvasY2] = vp.worldToCanvas(worldCoord2)
      const rect = canvas.getBoundingClientRect()

      // We need clientX and clientY to click properly
      const clientX1 = canvasX1 + rect.left
      const clientY1 = canvasY1 + rect.top
      const clientX2 = canvasX2 + rect.left
      const clientY2 = canvasY2 + rect.top

      // Mouse Down
      let evt1 = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
      })
      canvas.dispatchEvent(evt1)

      // Mouse Up instantly after
      evt1 = new MouseEvent('mouseup')
      document.dispatchEvent(evt1)

      // Mouse Down
      let evt2 = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
      })
      canvas.dispatchEvent(evt2)

      // Mouse Up instantly after
      evt2 = new MouseEvent('mouseup')
      document.dispatchEvent(evt2)

      const enabledElement = getEnabledElement(canvas)
      const probeToolState = getToolState(enabledElement, 'Probe')

      // Todo: subscribe to the correct event to not have set time out
      setTimeout(() => {
        // Can successfully add probe tool to toolStateManager
        expect(probeToolState).toBeDefined()
        expect(probeToolState.length).toBe(2)

        const firstProbeToolData = probeToolState[0]
        expect(firstProbeToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(firstProbeToolData.metadata.toolName).toBe('Probe')
        expect(firstProbeToolData.data.invalidated).toBe(false)

        let data = firstProbeToolData.data.cachedStats
        let targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // The world coordinate is on the white bar so value is 255
        console.warn(data);
        console.warn(data[targets[0]])
        expect(data[targets[0]].value).toBe(255)

        // Second click
        const secondProbeToolData = probeToolState[1]
        expect(secondProbeToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(secondProbeToolData.metadata.toolName).toBe('Probe')
        expect(secondProbeToolData.data.invalidated).toBe(false)

        data = secondProbeToolData.data.cachedStats
        targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0)

        //
        removeToolState(canvas, firstProbeToolData)
        removeToolState(canvas, secondProbeToolData)

        done()
      }, 1000)
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

  it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 512)

    const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    // The place in world we want to have a mouse click
    const worldCoord = [125, 128, 0] // 255

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const [canvasX, canvasY] = vp.worldToCanvas(worldCoord)
      const rect = canvas.getBoundingClientRect()

      // We need clientX and clientY to click properly
      const clientX = canvasX + rect.left
      const clientY = canvasY + rect.top

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX,
        clientY: clientY,
      })
      canvas.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')
      document.dispatchEvent(evt)

      const enabledElement = getEnabledElement(canvas)
      const probeToolState = getToolState(enabledElement, 'Probe')

      // Todo: subscribe to the correct event to not have set time out
      setTimeout(() => {
        // Can successfully add probe tool to toolStateManager
        expect(probeToolState).toBeDefined()
        expect(probeToolState.length).toBe(1)

        const probeToolData = probeToolState[0]
        expect(probeToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(probeToolData.metadata.toolName).toBe('Probe')
        expect(probeToolData.data.invalidated).toBe(false)

        const data = probeToolData.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255)

        removeToolState(canvas, probeToolData)
        done()
      }, 1000)
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

  it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 512)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    // The place in world we want to have a mouse click
    const worldCoord = [30, 30, 0] // 255

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const [canvasX, canvasY] = vp.worldToCanvas(worldCoord)
      const rect = canvas.getBoundingClientRect()

      // We need clientX and clientY to click properly
      const clientX = canvasX + rect.left
      const clientY = canvasY + rect.top

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas,
        buttons: 1,
        clientX: clientX,
        clientY: clientY,
      })
      canvas.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')
      document.dispatchEvent(evt)

      const enabledElement = getEnabledElement(canvas)
      const probeToolState = getToolState(enabledElement, 'Probe')

      // Todo: subscribe to the correct event to not have set time out
      setTimeout(() => {
        // Can successfully add probe tool to toolStateManager
        expect(probeToolState).toBeDefined()
        expect(probeToolState.length).toBe(1)

        const probeToolData = probeToolState[0]
        expect(probeToolData.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(probeToolData.metadata.toolName).toBe('Probe')
        expect(probeToolData.data.invalidated).toBe(false)

        const data = probeToolData.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0)

        removeToolState(canvas, probeToolData)
        done()
      }, 1000)
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
})
