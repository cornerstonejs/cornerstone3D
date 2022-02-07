import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  Utilities,
  unregisterAllImageLoaders,
  metaData,
  EVENTS,
  getEnabledElement,
  createAndCacheVolume,
  registerVolumeLoader,
} = cornerstone3D

const {
  CrosshairsTool,
  ToolGroupManager,
  getToolState,
  removeToolState,
  CornerstoneTools3DEvents,
} = csTools3d

const { fakeMetaDataProvider, fakeVolumeLoader, createNormalizedMouseEvent } =
  Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const scene1UID = 'SCENE_1'
const viewportUID1 = 'VIEWPORT1'
const viewportUID2 = 'VIEWPORT2'
const viewportUID3 = 'VIEWPORT3'

const DOMElements = []

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`

function createCanvas(renderingEngine, viewportType, width, height) {
  // TODO: currently we need to have a parent div on the canvas with
  // position of relative for the svg layer to be set correctly
  const viewportPane1 = document.createElement('div')
  viewportPane1.style.position = 'relative'
  viewportPane1.style.display = 'block'
  viewportPane1.style.width = `${width}px`
  viewportPane1.style.height = `${height}px`

  document.body.appendChild(viewportPane1)

  const canvas1 = document.createElement('canvas')

  canvas1.style.position = 'absolute'
  canvas1.style.width = '100%'
  canvas1.style.height = '100%'
  viewportPane1.appendChild(canvas1)

  DOMElements.push(canvas1)
  DOMElements.push(viewportPane1)

  // Second viewport
  const viewportPane2 = document.createElement('div')
  viewportPane2.style.position = 'relative'
  viewportPane2.style.display = 'block'
  viewportPane2.style.width = `${width}px`
  viewportPane2.style.height = `${height}px`

  document.body.appendChild(viewportPane2)

  const canvas2 = document.createElement('canvas')

  canvas2.style.position = 'absolute'
  canvas2.style.width = '100%'
  canvas2.style.height = '100%'
  viewportPane2.appendChild(canvas2)

  DOMElements.push(canvas2)
  DOMElements.push(viewportPane2)

  // Third viewport
  const viewportPane3 = document.createElement('div')
  viewportPane3.style.position = 'relative'
  viewportPane3.style.display = 'block'
  viewportPane3.style.width = `${width}px`
  viewportPane3.style.height = `${height}px`

  document.body.appendChild(viewportPane3)

  const canvas3 = document.createElement('canvas')

  canvas3.style.position = 'absolute'
  canvas3.style.width = '100%'
  canvas3.style.height = '100%'
  viewportPane3.appendChild(canvas3)

  DOMElements.push(canvas3)
  DOMElements.push(viewportPane3)

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID1,
      type: viewportType,
      canvas: canvas1,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID2,
      type: viewportType,
      canvas: canvas2,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID3,
      type: viewportType,
      canvas: canvas3,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION.CORONAL,
      },
    },
  ])
  return [canvas1, canvas2, canvas3]
}

describe('Cornerstone Tools: ', () => {
  beforeAll(() => {
    // initialize the library
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(CrosshairsTool, {})
    cache.purgeCache()
    this.testToolGroup = ToolGroupManager.createToolGroup('volume')
    this.testToolGroup.addTool('Crosshairs', {
      configuration: {},
    })
    this.testToolGroup.setToolActive('Crosshairs', {
      bindings: [{ mouseButton: 1 }],
    })

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    csTools3d.destroy()

    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupById('volume')

    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully initialize the crosshairs to the middle of the image and canvas', function (done) {
    const [canvas1, canvas2, canvas3] = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.ORTHOGRAPHIC,
      512,
      128
    )
    let canvasesRendered = 0
    let annotationRendered = 0

    const crosshairsEventHandler = () => {
      annotationRendered += 1

      if (annotationRendered !== 3) {
        return
      }

      const vp = this.renderingEngine.getViewport(viewportUID1)
      const { imageData } = vp.getImageData()

      const indexMiddle = imageData
        .getDimensions()
        .map((s) => Math.floor(s / 2))

      const imageCenterWorld = imageData.indexToWorld(indexMiddle)

      const { sHeight, sWidth } = vp
      const centerCanvas = [sWidth * 0.5, sHeight * 0.5]
      const canvasCenterWorld = vp.canvasToWorld(centerCanvas)

      const enabledElement = getEnabledElement(canvas1)
      const crosshairToolState = getToolState(enabledElement, 'Crosshairs')

      // Can successfully add add crosshairs initial state
      // Todo: right now crosshairs are being initialized on camera reset
      // when crosshair initialization is decoupled from the initial reset
      // There should be no initial state for it
      expect(crosshairToolState).toBeDefined()
      expect(crosshairToolState.length).toBe(3)

      crosshairToolState.map((crosshairToolData) => {
        expect(crosshairToolData.metadata.cameraFocalPoint).toBeDefined()
        crosshairToolData.data.handles.toolCenter.forEach((p, i) => {
          expect(p).toBeCloseTo(canvasCenterWorld[i], 3)
          expect(p).toBeCloseTo(imageCenterWorld[i], 3)
        })
        removeToolState(canvas1, crosshairToolData)
      })

      done()
    }

    const renderEventHandler = () => {
      canvasesRendered += 1

      if (canvasesRendered !== 3) {
        return
      }

      canvas1.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
      canvas2.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
      canvas3.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
    }

    canvas1.addEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)
    canvas2.addEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)
    canvas3.addEventListener(EVENTS.IMAGE_RENDERED, renderEventHandler)

    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID2
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID3
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

  it('Should successfully jump to move the crosshairs', function (done) {
    const [canvas1, canvas2, canvas3] = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.ORTHOGRAPHIC,
      512,
      128
    )
    let canvasesRendered = 0
    let annotationRendered = 0

    let p1

    const crosshairsEventHandler = () => {
      annotationRendered += 1

      if (annotationRendered !== 3) {
        return
      }

      const enabledElement = getEnabledElement(canvas1)

      const crosshairToolStateAfter = getToolState(enabledElement, 'Crosshairs')
      const axialCanvasToolCenter =
        crosshairToolStateAfter[0].data.handles.toolCenter

      crosshairToolStateAfter.map((crosshairToolData) => {
        expect(crosshairToolData.metadata.cameraFocalPoint).toBeDefined()
        crosshairToolData.data.handles.toolCenter.forEach((p, i) => {
          // Can succesfully move the tool center in all viewports
          expect(p).toBeCloseTo(p1[i], 3)
          expect(p).toBeCloseTo(axialCanvasToolCenter[i], 3)
          removeToolState(canvas1, crosshairToolData)
        })
      })
      done()
    }

    const attachCrosshairsHandler = () => {
      canvas1.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
      canvas2.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
      canvas3.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      )
    }

    const eventHandler = () => {
      canvasesRendered += 1

      if (canvasesRendered !== 3) {
        return
      }

      const vp1 = this.renderingEngine.getViewport(viewportUID1)
      const { imageData } = vp1.getImageData()

      const enabledElement = getEnabledElement(canvas1)
      const crosshairToolState = getToolState(enabledElement, 'Crosshairs')

      // First viewport is axial
      const currentWorldLocation = crosshairToolState[0].data.handles.toolCenter
      const currentIndexLocation = imageData.worldToIndex(currentWorldLocation)

      const jumpIndexLocation = [
        currentIndexLocation[0] + 20,
        currentIndexLocation[1] + 20,
        currentIndexLocation[2],
      ]

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, jumpIndexLocation, canvas1, vp1)
      p1 = worldCoord1

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: canvas1,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      })
      canvas1.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')

      attachCrosshairsHandler()
      document.dispatchEvent(evt)
    }

    canvas1.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    canvas2.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    canvas3.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID2
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID3
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

  it('Should successfully drag and move the crosshairs', function (done) {
    const [canvas1, canvas2, canvas3] = createCanvas(
      this.renderingEngine,
      VIEWPORT_TYPE.ORTHOGRAPHIC,
      512,
      128
    )
    let canvasesRendered = 0

    const eventHandler = () => {
      canvasesRendered += 1

      if (canvasesRendered !== 3) {
        return
      }

      const vp1 = this.renderingEngine.getViewport(viewportUID1)
      const { imageData } = vp1.getImageData()

      setTimeout(() => {
        const enabledElement = getEnabledElement(canvas1)
        const crosshairToolState = getToolState(enabledElement, 'Crosshairs')

        // First viewport is axial
        const currentWorldLocation =
          crosshairToolState[0].data.handles.toolCenter
        const currentIndexLocation =
          imageData.worldToIndex(currentWorldLocation)

        const jumpIndexLocation = [
          currentIndexLocation[0] - 20,
          currentIndexLocation[1] - 20,
          currentIndexLocation[2],
        ]

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(
          imageData,
          currentIndexLocation,
          canvas1,
          vp1
        )

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(
          imageData,
          jumpIndexLocation,
          canvas1,
          vp1
        )

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: canvas1,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        })
        canvas1.dispatchEvent(evt)

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: canvas1,
          buttons: 1,
          clientX: clientX2,
          clientY: clientY2,
          pageX: pageX2,
          pageY: pageY2,
        })
        document.dispatchEvent(evt)

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup')

        document.dispatchEvent(evt)

        // Moving Crosshairs
        setTimeout(() => {
          const crosshairToolStateAfter = getToolState(
            enabledElement,
            'Crosshairs'
          )
          crosshairToolStateAfter.map((crosshairToolData) => {
            expect(crosshairToolData.metadata.cameraFocalPoint).toBeDefined()
            crosshairToolData.data.handles.toolCenter.forEach((p, i) => {
              // Can succesfully move the tool center in all viewports
              expect(p).toBeCloseTo(worldCoord2[i], 3)
              removeToolState(canvas1, crosshairToolData)
            })
          })
          done()
        }, 500)
      }, 500)
    }

    canvas1.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    canvas2.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
    canvas3.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID2
    )
    this.testToolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID3
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
