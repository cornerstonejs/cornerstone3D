import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as windowLevel_canvas2 from './groundTruth/windowLevel_canvas2.png'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  utilities,
  metaData,
  EVENTS,
  setVolumesForViewports,
  volumeLoader,
  imageLoader,
} = cornerstone3D

const { unregisterAllImageLoaders } = imageLoader
const { createAndCacheVolume, registerVolumeLoader } = volumeLoader

const {
  StackScrollMouseWheelTool,
  WindowLevelTool,
  ToolGroupManager,
  synchronizers,
  SynchronizerManager,
  ToolBindings,
} = csTools3d

const { fakeMetaDataProvider, fakeVolumeLoader, compareImages } =
  utilities.testUtils

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const renderingEngineUID = utilities.uuidv4()

const viewportUID1 = 'VIEWPORT1'
const viewportUID2 = 'VIEWPORT2'

const ctVolumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`
const ptVolumeId = `fakeVolumeLoader:volumeURI_100_100_15_1_1_1_0`

let synchronizerId

function createViewports(width, height) {
  const element1 = document.createElement('div')

  element1.style.width = `${width}px`
  element1.style.height = `${height}px`
  document.body.appendChild(element1)

  const element2 = document.createElement('div')

  element2.style.width = `${width}px`
  element2.style.height = `${height}px`
  document.body.appendChild(element2)

  return [element1, element2]
}

describe('Synchronizer Manager: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(StackScrollMouseWheelTool)
    cache.purgeCache()
    this.DOMElements = []

    this.firstToolGroup = ToolGroupManager.createToolGroup('volume1')
    this.firstToolGroup.addTool(StackScrollMouseWheelTool.toolName)
    this.firstToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    SynchronizerManager.destroySynchronizerById(synchronizerId)
    csTools3d.destroy()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupByToolGroupUID('volume1')

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully synchronizes viewports for Camera sync', function (done) {
    const [element1, element2] = createViewports(512, 128)
    this.DOMElements.push(element1)
    this.DOMElements.push(element2)

    this.renderingEngine.setViewports([
      {
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    let canvasesRendered = 0

    const eventHandler = () => {
      canvasesRendered += 1

      if (canvasesRendered !== 2) {
        return
      }

      const synchronizers = SynchronizerManager.getSynchronizers(
        renderingEngineUID,
        viewportUID1
      )

      expect(synchronizers.length).toBe(1)

      const synchronizerById =
        SynchronizerManager.getSynchronizerById(synchronizerId)

      expect(synchronizerById).toBe(synchronizers[0])

      const allSynchronizers = SynchronizerManager.getAllSynchronizers()

      expect(allSynchronizers.length).toBe(1)
      expect(allSynchronizers[0]).toBe(synchronizerById)

      const createAnotherSynchronizer = () => {
        createCameraPositionSynchronizer('axialSync')
      }

      expect(createAnotherSynchronizer).toThrow()
      done()
    }

    element1.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    element2.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

    this.firstToolGroup.addViewport(viewportUID1, this.renderingEngine.uid)
    this.firstToolGroup.addViewport(viewportUID2, this.renderingEngine.uid)

    try {
      const axialSync = createCameraPositionSynchronizer('axialSync')
      synchronizerId = axialSync.id

      axialSync.add({
        renderingEngineUID: this.renderingEngine.uid,
        viewportUID: this.renderingEngine.getViewport(viewportUID1).uid,
      })
      axialSync.add({
        renderingEngineUID: this.renderingEngine.uid,
        viewportUID: this.renderingEngine.getViewport(viewportUID2).uid,
      })

      createAndCacheVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeUID: ctVolumeId }],
          [viewportUID1]
        )
      })
      createAndCacheVolume(ptVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeUID: ptVolumeId }],
          [viewportUID2]
        )
      })
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Synchronizer Manager: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(WindowLevelTool)
    cache.purgeCache()
    this.DOMElements = []

    this.firstToolGroup = ToolGroupManager.createToolGroup('volume1')
    this.firstToolGroup.addTool(WindowLevelTool.toolName, {
      configuration: { volumeUID: ctVolumeId },
    })
    this.firstToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: ToolBindings.Mouse.Primary,
        },
      ],
    })
    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    SynchronizerManager.destroy()
    csTools3d.destroy()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupByToolGroupUID('volume1')

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully synchronizes viewports for VOI Synchronizer', function (done) {
    const [element1, element2] = createViewports(512, 128)
    this.DOMElements.push(element1)
    this.DOMElements.push(element2)

    this.renderingEngine.setViewports([
      {
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.CORONAL,
        },
      },
    ])

    let canvasesRendered = 0
    const [pageX1, pageY1] = [316, 125]
    const [pageX2, pageY2] = [211, 20]

    const addEventListenerForVOI = () => {
      element2.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const vp2 = this.renderingEngine.getViewport(viewportUID2)
        const canvas2 = vp2.getCanvas()
        const image2 = canvas2.toDataURL('image/png')

        compareImages(image2, windowLevel_canvas2, 'windowLevel_canvas2').then(
          done,
          done.fail
        )
      })
    }

    const eventHandler = () => {
      canvasesRendered += 1

      if (canvasesRendered !== 2) {
        return
      }

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element1,
        buttons: 1,
        clientX: pageX1,
        clientY: pageY1,
        pageX: pageX1,
        pageY: pageY1,
      })

      element1.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      const evt1 = new MouseEvent('mousemove', {
        target: element1,
        buttons: 1,
        clientX: pageX2,
        clientY: pageY2,
        pageX: pageX2,
        pageY: pageY2,
      })

      addEventListenerForVOI()
      document.dispatchEvent(evt1)

      const evt3 = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
      })

      document.dispatchEvent(evt3)
    }

    element1.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    element2.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

    this.firstToolGroup.addViewport(viewportUID1, this.renderingEngine.uid)
    this.firstToolGroup.addViewport(viewportUID2, this.renderingEngine.uid)

    try {
      const voiSync = createVOISynchronizer('ctWLSync')

      voiSync.addSource({
        renderingEngineUID: this.renderingEngine.uid,
        viewportUID: this.renderingEngine.getViewport(viewportUID1).uid,
      })
      voiSync.addTarget({
        renderingEngineUID: this.renderingEngine.uid,
        viewportUID: this.renderingEngine.getViewport(viewportUID2).uid,
      })

      createAndCacheVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeUID: ctVolumeId }],
          [viewportUID1, viewportUID2]
        )
        this.renderingEngine.render()
      })
    } catch (e) {
      done.fail(e)
    }
  })
})
