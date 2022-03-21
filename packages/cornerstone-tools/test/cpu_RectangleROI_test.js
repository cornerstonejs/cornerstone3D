import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  eventTarget,
  metaData,
  volumeLoader,
  setUseCPURendering,
  resetUseCPURendering,
} = cornerstone3D

const { Events, ViewportType, ORIENTATION } = Enums

const {
  RectangleRoiTool,
  ToolGroupManager,
  CornerstoneTools3DEvents,
  cancelActiveManipulations,
  annotation,
} = csTools3d

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = utilities.testUtils

const renderingEngineUID = utilities.uuidv4()

const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

function createViewport(renderingEngine, viewportType, width, height) {
  const element = document.createElement('div')

  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.appendChild(element)

  renderingEngine.setViewports([
    {
      viewportUID: viewportUID,
      type: viewportType,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION[AXIAL],
      },
    },
  ])
  return element
}

const volumeId = `fakeVolumeLoader:volumeURI_100_100_4_1_1_1_0`

describe('RectangleRoiTool (CPU):', () => {
  beforeAll(() => {
    setUseCPURendering(true)
  })

  afterAll(() => {
    resetUseCPURendering()
  })

  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(RectangleRoiTool)
    cache.purgeCache()
    this.DOMElements = []

    this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
    this.stackToolGroup.addTool(RectangleRoiTool.toolName, {
      configuration: { volumeUID: volumeId },
    })
    this.stackToolGroup.setToolActive(RectangleRoiTool.toolName, {
      bindings: [{ mouseButton: 1 }],
    })

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader)
    volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    csTools3d.destroy()
    cache.purgeCache()
    eventTarget.reset()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    imageLoader.unregisterAllImageLoaders()
    ToolGroupManager.destroyToolGroupByToolGroupUID('stack')

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully create a rectangle tool on a cpu stack viewport with mouse drag - 512 x 128', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    )
    this.DOMElements.push(element)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const rectangleAnnotations = annotation.state.getAnnotations(
            element,
            RectangleRoiTool.toolName
          )
          // Can successfully add rectangleROI to annotationManager
          expect(rectangleAnnotations).toBeDefined()
          expect(rectangleAnnotations.length).toBe(1)

          const rectangleAnnotation = rectangleAnnotations[0]
          expect(rectangleAnnotation.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )

          expect(rectangleAnnotation.metadata.toolName).toBe(
            RectangleRoiTool.toolName
          )
          expect(rectangleAnnotation.invalidated).toBe(false)

          const data = rectangleAnnotation.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          // the rectangle is drawn on the strip
          expect(data[targets[0]].mean).toBe(255)

          annotation.state.removeAnnotation(
            element,
            rectangleAnnotation.annotationUID
          )
          done()
        }
      )
    }

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0]
      const index2 = [14, 10, 0]

      const { imageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
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

    this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully create a rectangle tool on a cpu stack viewport and modify its handle', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    )
    this.DOMElements.push(element)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const rectangleAnnotations = annotation.state.getAnnotations(
            element,
            RectangleRoiTool.toolName
          )
          // Can successfully add rectangleROI to annotationManager
          expect(rectangleAnnotations).toBeDefined()
          expect(rectangleAnnotations.length).toBe(1)

          const rectangleAnnotation = rectangleAnnotations[0]
          expect(rectangleAnnotation.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )
          expect(rectangleAnnotation.metadata.toolName).toBe(
            RectangleRoiTool.toolName
          )
          expect(rectangleAnnotation.invalidated).toBe(false)

          const data = rectangleAnnotation.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          expect(data[targets[0]].mean).toBe(255)
          expect(data[targets[0]].stdDev).toBe(0)

          annotation.state.removeAnnotation(
            element,
            rectangleAnnotation.annotationUID
          )
          done()
        }
      )
    }

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0]
      const index2 = [14, 10, 0]
      const index3 = [11, 30, 0]

      const { imageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp)

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
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

      // Select the first handle
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Drag it somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      })
      document.dispatchEvent(evt)

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup')

      addEventListenerForAnnotationRendered()
      document.dispatchEvent(evt)
    })

    this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully create a rectangle tool on a cpu stack viewport and select but not move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      256
    )
    this.DOMElements.push(element)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const rectangleAnnotations = annotation.state.getAnnotations(
            element,
            RectangleRoiTool.toolName
          )
          // Can successfully add rectangleROI to annotationManager
          expect(rectangleAnnotations).toBeDefined()
          expect(rectangleAnnotations.length).toBe(1)

          const rectangleAnnotation = rectangleAnnotations[0]
          expect(rectangleAnnotation.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )
          expect(rectangleAnnotation.metadata.toolName).toBe(
            RectangleRoiTool.toolName
          )
          expect(rectangleAnnotation.invalidated).toBe(false)

          const data = rectangleAnnotation.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          expect(data[targets[0]].mean).toBe(255)
          expect(data[targets[0]].stdDev).toBe(0)

          annotation.state.removeAnnotation(
            element,
            rectangleAnnotation.annotationUID
          )
          done()
        }
      )
    }

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0]
      const index2 = [14, 30, 0]

      // grab the tool in its middle (just to make it easy)
      const index3 = [11, 20, 0]

      const { imageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp)

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp)

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp)

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
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

      // Mouse down on the middle of the rectangleROI, just to select
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      })
      element.dispatchEvent(evt)

      // Just grab and don't really move it
      evt = new MouseEvent('mouseup')

      addEventListenerForAnnotationRendered()
      document.dispatchEvent(evt)
    })

    this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully create a rectangle tool on a cpu stack viewport and select AND move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    )
    this.DOMElements.push(element)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    let p1, p2, p3, p4

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(
        CornerstoneTools3DEvents.ANNOTATION_RENDERED,
        () => {
          const rectangleAnnotations = annotation.state.getAnnotations(
            element,
            RectangleRoiTool.toolName
          )
          // Can successfully add rectangleROI to annotationManager
          expect(rectangleAnnotations).toBeDefined()
          expect(rectangleAnnotations.length).toBe(1)

          const rectangleAnnotation = rectangleAnnotations[0]
          expect(rectangleAnnotation.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )
          expect(rectangleAnnotation.metadata.toolName).toBe(
            RectangleRoiTool.toolName
          )
          expect(rectangleAnnotation.invalidated).toBe(false)

          const data = rectangleAnnotation.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          // We expect the mean to not be 255 as it has been moved
          expect(data[targets[0]].mean).not.toBe(255)
          expect(data[targets[0]].stdDev).not.toBe(0)

          const handles = rectangleAnnotation.data.handles.points

          const preMoveFirstHandle = p1
          const preMoveSecondHandle = p2
          const preMoveCenter = p3

          const centerToHandle1 = [
            preMoveCenter[0] - preMoveFirstHandle[0],
            preMoveCenter[1] - preMoveFirstHandle[1],
            preMoveCenter[2] - preMoveFirstHandle[2],
          ]

          const centerToHandle2 = [
            preMoveCenter[0] - preMoveSecondHandle[0],
            preMoveCenter[1] - preMoveSecondHandle[1],
            preMoveCenter[2] - preMoveSecondHandle[2],
          ]

          const afterMoveCenter = p4

          const afterMoveFirstHandle = [
            afterMoveCenter[0] - centerToHandle1[0],
            afterMoveCenter[1] - centerToHandle1[1],
            afterMoveCenter[2] - centerToHandle1[2],
          ]

          const afterMoveSecondHandle = [
            afterMoveCenter[0] - centerToHandle2[0],
            afterMoveCenter[1] - centerToHandle2[1],
            afterMoveCenter[2] - centerToHandle2[2],
          ]

          // Expect handles are moved accordingly
          expect(handles[0]).toEqual(afterMoveFirstHandle)
          expect(handles[3]).toEqual(afterMoveSecondHandle)

          annotation.state.removeAnnotation(
            element,
            rectangleAnnotation.annotationUID
          )
          done()
        }
      )
    }

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0]
      const index2 = [14, 30, 0]

      // grab the tool on its left edge
      const index3 = [11, 25, 0]

      // Where to move that grabbing point
      // This will result the tool be outside of the bar
      const index4 = [13, 24, 0]

      const { imageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp)
      p1 = worldCoord1

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp)
      p2 = worldCoord2

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp)
      p3 = worldCoord3

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
        worldCoord: worldCoord4,
      } = createNormalizedMouseEvent(imageData, index4, element, vp)
      p4 = worldCoord4

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
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

      // Drag the middle of the tool
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      })
      element.dispatchEvent(evt)

      // Move the middle of the tool to point4
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      })
      document.dispatchEvent(evt)

      evt = new MouseEvent('mouseup')

      addEventListenerForAnnotationRendered()
      document.dispatchEvent(evt)
    })

    this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should successfully create a rectangle tool on a cpu stack viewport and select AND move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    )
    this.DOMElements.push(element)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)

    let p1, p2, p3, p4

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0]
      const index2 = [14, 30, 0]

      // grab the tool on its left edge
      const index3 = [11, 25, 0]

      // Where to move that grabbing point
      // This will result the tool be outside of the bar
      const index4 = [13, 24, 0]

      const { imageData } = vp.getImageData()

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp)
      p1 = worldCoord1

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp)
      p2 = worldCoord2

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp)
      p3 = worldCoord3

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
        worldCoord: worldCoord4,
      } = createNormalizedMouseEvent(imageData, index4, element, vp)
      p4 = worldCoord4

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      })
      element.dispatchEvent(evt)

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
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

      // Drag the middle of the tool
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      })
      element.dispatchEvent(evt)

      // Move the middle of the tool to point4
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      })
      document.dispatchEvent(evt)

      // Cancel the drawing
      let e = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Esc',
        char: 'Esc',
      })
      element.dispatchEvent(e)

      e = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
      })
      element.dispatchEvent(e)
    })

    const cancelToolDrawing = () => {
      const canceledDataUID = cancelActiveManipulations(element)
      expect(canceledDataUID).toBeDefined()

      setTimeout(() => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          element,
          RectangleRoiTool.toolName
        )
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined()
        expect(rectangleAnnotations.length).toBe(1)

        const rectangleAnnotation = rectangleAnnotations[0]
        expect(rectangleAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        )
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleRoiTool.toolName
        )
        expect(rectangleAnnotation.invalidated).toBe(false)

        const data = rectangleAnnotation.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // We expect the mean to not be 255 as it has been moved
        expect(data[targets[0]].mean).not.toBe(255)
        expect(data[targets[0]].stdDev).not.toBe(0)

        const handles = rectangleAnnotation.data.handles.points

        const preMoveFirstHandle = p1
        const preMoveSecondHandle = p2
        const preMoveCenter = p3

        const centerToHandle1 = [
          preMoveCenter[0] - preMoveFirstHandle[0],
          preMoveCenter[1] - preMoveFirstHandle[1],
          preMoveCenter[2] - preMoveFirstHandle[2],
        ]

        const centerToHandle2 = [
          preMoveCenter[0] - preMoveSecondHandle[0],
          preMoveCenter[1] - preMoveSecondHandle[1],
          preMoveCenter[2] - preMoveSecondHandle[2],
        ]

        const afterMoveCenter = p4

        const afterMoveFirstHandle = [
          afterMoveCenter[0] - centerToHandle1[0],
          afterMoveCenter[1] - centerToHandle1[1],
          afterMoveCenter[2] - centerToHandle1[2],
        ]

        const afterMoveSecondHandle = [
          afterMoveCenter[0] - centerToHandle2[0],
          afterMoveCenter[1] - centerToHandle2[1],
          afterMoveCenter[2] - centerToHandle2[2],
        ]

        // Expect handles are moved accordingly
        expect(handles[0]).toEqual(afterMoveFirstHandle)
        expect(handles[3]).toEqual(afterMoveSecondHandle)

        annotation.state.removeAnnotation(
          element,
          rectangleAnnotation.annotationUID
        )
        done()
      }, 100)
    }

    this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

    element.addEventListener(
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
