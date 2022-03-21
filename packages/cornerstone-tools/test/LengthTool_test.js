import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  EVENTS,
  eventTarget,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  getEnabledElement,
  createAndCacheVolume,
  registerVolumeLoader,
} = cornerstone3D

const {
  LengthTool,
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

const {
  Utilities: { calibrateImageSpacing },
} = csTools3d

const renderingEngineUID = Utilities.uuidv4()
const { calibratedPixelSpacingMetadataProvider } = Utilities

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const DOMElements = []

function calculateLength(pos1, pos2) {
  const dx = pos1[0] - pos2[0]
  const dy = pos1[1] - pos2[1]
  const dz = pos1[2] - pos2[2]

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function createViewport(renderingEngine, viewportType, width, height) {
  const element = document.createElement('div')

  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.appendChild(element)

  DOMElements.push(element)

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
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

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`

describe('LengthTool:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Cornerstone Tools: -- Length ', () => {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(LengthTool, {})
      cache.purgeCache()
      this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
      this.stackToolGroup.addTool('Length', {
        configuration: { volumeUID: volumeId },
      })
      this.stackToolGroup.setToolActive('Length', {
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

    it('Should successfully create a length tool on a canvas with mouse drag - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        512,
        128
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p1, p2

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const enabledElement = getEnabledElement(element)
            const lengthToolState = getToolState(enabledElement, 'Length')
            // Can successfully add Length tool to toolStateManager
            expect(lengthToolState).toBeDefined()
            expect(lengthToolState.length).toBe(1)

            const lengthToolData = lengthToolState[0]
            expect(lengthToolData.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(lengthToolData.metadata.toolName).toBe('Length')
            expect(lengthToolData.data.invalidated).toBe(false)

            const data = lengthToolData.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            expect(data[targets[0]].length).toBe(calculateLength(p1, p2))
            removeToolState(element, lengthToolData)
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [32, 32, 0]
        const index2 = [10, 1, 0]

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

        // Since there is tool rendering happening for any mouse event
        // we just attach a listener before the last one -> mouse up
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

    it('Should successfully create a length tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.ORTHOGRAPHIC,
        512,
        128
      )

      const vp = this.renderingEngine.getViewport(viewportUID)

      let p1, p2

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const enabledElement = getEnabledElement(element)
            const lengthToolState = getToolState(enabledElement, 'Length')
            // Can successfully add Length tool to toolStateManager
            expect(lengthToolState).toBeDefined()
            expect(lengthToolState.length).toBe(1)

            const lengthToolData = lengthToolState[0]
            expect(lengthToolData.metadata.toolName).toBe('Length')
            expect(lengthToolData.data.invalidated).toBe(false)
            expect(lengthToolData.data.active).toBe(false)

            const data = lengthToolData.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            expect(data[targets[0]].length).toBe(calculateLength(p1, p2))

            removeToolState(element, lengthToolData)
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [32, 32, 4]
        const index2 = [10, 1, 4]

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

    it('Should successfully create a length tool and modify its handle', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p2, p3

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const enabledElement = getEnabledElement(element)
            const lengthToolState = getToolState(enabledElement, 'Length')
            // Can successfully add Length tool to toolStateManager
            expect(lengthToolState).toBeDefined()
            expect(lengthToolState.length).toBe(1)

            const lengthToolData = lengthToolState[0]
            expect(lengthToolData.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(lengthToolData.metadata.toolName).toBe('Length')
            expect(lengthToolData.data.invalidated).toBe(false)
            expect(lengthToolData.data.active).toBe(false)

            const data = lengthToolData.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            expect(data[targets[0]].length).toBe(calculateLength(p3, p2))

            removeToolState(element, lengthToolData)
            done()
          }
        )
      }
      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [50, 50, 0]
        const index2 = [5, 5, 0]
        const index3 = [33, 33, 0]

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: p1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

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

    it('Should successfully create a length tool and select but not move it', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p1, p2

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const enabledElement = getEnabledElement(element)
            const lengthToolState = getToolState(enabledElement, 'Length')
            // Can successfully add Length tool to toolStateManager
            expect(lengthToolState).toBeDefined()
            expect(lengthToolState.length).toBe(1)

            const lengthToolData = lengthToolState[0]
            expect(lengthToolData.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(lengthToolData.metadata.toolName).toBe('Length')
            expect(lengthToolData.data.invalidated).toBe(false)
            expect(lengthToolData.data.active).toBe(false)

            const data = lengthToolData.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            expect(data[targets[0]].length).toBe(calculateLength(p1, p2))

            removeToolState(element, lengthToolData)
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [20, 20, 0]
        const index2 = [20, 30, 0]

        // grab the tool in its middle (just to make it easy)
        const index3 = [20, 25, 0]

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

        // Mouse down on the middle of the length tool, just to select
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

    it('Should successfully create a length tool and select AND move it', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p1, p2, p3, p4

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const enabledElement = getEnabledElement(element)
            const lengthToolState = getToolState(enabledElement, 'Length')
            // Can successfully add Length tool to toolStateManager
            expect(lengthToolState).toBeDefined()
            expect(lengthToolState.length).toBe(1)

            const lengthToolData = lengthToolState[0]
            expect(lengthToolData.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(lengthToolData.metadata.toolName).toBe('Length')
            expect(lengthToolData.data.invalidated).toBe(false)

            const data = lengthToolData.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // We don't expect the length to change on tool move
            expect(data[targets[0]].length).toBeCloseTo(
              calculateLength(p1, p2),
              6
            )

            const handles = lengthToolData.data.handles.points

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
            expect(handles[1]).toEqual(afterMoveSecondHandle)

            removeToolState(element, lengthToolData)
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [20, 20, 0]
        const index2 = [20, 30, 0]

        // grab the tool in its middle (just to make it easy)
        const index3 = [20, 25, 0]

        // Where to move the center of the tool
        const index4 = [40, 40, 0]

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

  describe('Should successfully cancel a LengthTool', () => {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(LengthTool, {})
      cache.purgeCache()
      this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
      this.stackToolGroup.addTool('Length', {
        configuration: { volumeUID: volumeId },
      })
      this.stackToolGroup.setToolActive('Length', {
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

    it('Should cancel drawing of a LengthTool annotation', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        512,
        128
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p1, p2

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [32, 32, 0]
        const index2 = [10, 1, 0]

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
          const enabledElement = getEnabledElement(element)
          const lengthToolState = getToolState(enabledElement, 'Length')
          // Can successfully add Length tool to toolStateManager
          expect(lengthToolState).toBeDefined()
          expect(lengthToolState.length).toBe(1)

          const lengthToolData = lengthToolState[0]
          expect(lengthToolData.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )
          expect(lengthToolData.metadata.toolName).toBe('Length')
          expect(lengthToolData.data.invalidated).toBe(false)
          expect(lengthToolData.data.handles.activeHandleIndex).toBe(null)
          expect(lengthToolData.data.active).toBe(false)

          const data = lengthToolData.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          expect(data[targets[0]].length).toBe(calculateLength(p1, p2))
          removeToolState(element, lengthToolData)
          done()
        }, 100)
      }

      this.stackToolGroup.addViewports(
        this.renderingEngine.uid,
        undefined,
        vp.uid
      )

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

  describe('Calibration ', () => {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(LengthTool, {})
      cache.purgeCache()
      this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
      this.stackToolGroup.addTool('Length', {
        configuration: {},
      })
      this.stackToolGroup.setToolActive('Length', {
        bindings: [{ mouseButton: 1 }],
      })

      this.renderingEngine = new RenderingEngine(renderingEngineUID)
      registerImageLoader('fakeImageLoader', fakeImageLoader)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
      metaData.addProvider(fakeMetaDataProvider, 10000)
      metaData.addProvider(
        calibratedPixelSpacingMetadataProvider.get.bind(
          calibratedPixelSpacingMetadataProvider
        ),
        11000
      )
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

    it('Should be able to calibrate an image and update the tool', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )

      const imageId1 = 'fakeImageLoader:imageURI_64_64_4_40_1_1_0_1'

      const vp = this.renderingEngine.getViewport(viewportUID)

      const secondCallback = () => {
        const enabledElement = getEnabledElement(element)
        const lengthToolState = getToolState(enabledElement, 'Length')
        // Can successfully add Length tool to toolStateManager
        expect(lengthToolState).toBeDefined()
        expect(lengthToolState.length).toBe(1)

        const lengthToolData = lengthToolState[0]
        expect(lengthToolData.metadata.toolName).toBe('Length')
        expect(lengthToolData.data.invalidated).toBe(false)
        expect(lengthToolData.data.active).toBe(false)

        const data = lengthToolData.data.cachedStats
        const targets = Array.from(Object.keys(data))
        expect(targets.length).toBe(1)

        // Todo: add calibrated spacing length check
        // expect(data[targets[0]].length).toBe(calculateLength(p1, p2))

        removeToolState(element, lengthToolData)
        done()
      }

      const firstCallback = () => {
        const index1 = [32, 32, 0]
        const index2 = [10, 1, 0]

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
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

        // Since there is tool rendering happening for any mouse event
        // we just attach a listener before the last one -> mouse up
        document.dispatchEvent(evt)

        const imageId = this.renderingEngine
          .getViewport(viewportUID)
          .getCurrentImageId()

        calibrateImageSpacing(imageId, this.renderingEngine, 1, 5)
        element.removeEventListener(EVENTS.IMAGE_RENDERED, firstCallback)
        element.addEventListener(EVENTS.IMAGE_RENDERED, secondCallback)
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, firstCallback)

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
})
