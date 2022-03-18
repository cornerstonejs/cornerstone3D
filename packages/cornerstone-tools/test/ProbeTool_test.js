import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  Utilities,
  eventTarget,
  imageLoader,
  metaData,
  EVENTS,
  volumeLoader,
  setVolumesOnViewports,
} = cornerstone3D

const {
  ProbeTool,
  ToolGroupManager,
  AnnotationState,
  CornerstoneTools3DEvents,
  cancelActiveManipulations,
} = csTools3d

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  createNormalizedMouseEvent,
} = Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`

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
describe('Probe Tool: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Cornerstone Tools: ', () => {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(ProbeTool)
      cache.purgeCache()
      this.DOMElements = []

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
      this.stackToolGroup.addTool(ProbeTool.toolName, {
        configuration: { volumeUID: volumeId }, // Only for volume viewport
      })
      this.stackToolGroup.setToolActive(ProbeTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      })

      this.renderingEngine = new RenderingEngine(renderingEngineUID)
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader)
      volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
      metaData.addProvider(fakeMetaDataProvider, 10000)
    })

    afterEach(function () {
      csTools3d.destroy()
      eventTarget.reset()
      cache.purgeCache()
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

    it('Should successfully click to put a probe tool on a canvas - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
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
            // Can successfully add probe tool to annotationManager
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(1)

            const probeAnnotation = probeAnnotations[0]
            expect(probeAnnotation.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
            expect(probeAnnotation.invalidated).toBe(false)

            const data = probeAnnotation.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // The world coordinate is on the white bar so value is 255
            expect(data[targets[0]].value).toBe(255)

            AnnotationState.removeAnnotation(
              element,
              probeAnnotation.annotationUID
            )
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [11, 20, 0]

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        })
        element.dispatchEvent(evt)

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup')

        // Since there is tool rendering happening for any mouse event
        // we just attach a listener before the last one -> mouse up
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

    it('Should successfully click to put two probe tools on a canvas - 256 x 256', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
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
            // Can successfully add probe tool to annotationManager
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(2)

            const firstProbeAnnotation = probeAnnotations[0]
            expect(firstProbeAnnotation.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(firstProbeAnnotation.metadata.toolName).toBe(
              ProbeTool.toolName
            )
            expect(firstProbeAnnotation.invalidated).toBe(false)

            let data = firstProbeAnnotation.data.cachedStats
            let targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // The world coordinate is on the white bar so value is 255
            expect(data[targets[0]].value).toBe(255)

            // Second click
            const secondProbeAnnotation = probeAnnotations[1]
            expect(secondProbeAnnotation.metadata.toolName).toBe(
              ProbeTool.toolName
            )
            expect(secondProbeAnnotation.invalidated).toBe(false)

            data = secondProbeAnnotation.data.cachedStats
            targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // The world coordinate is on the white bar so value is 255
            expect(data[targets[0]].value).toBe(0)

            //
            AnnotationState.removeAnnotation(
              element,
              firstProbeAnnotation.annotationUID
            )
            AnnotationState.removeAnnotation(
              element,
              secondProbeAnnotation.annotationUID
            )

            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [11, 20, 0] // 255
        const index2 = [20, 20, 0] // 0

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
        let evt1 = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        })
        element.dispatchEvent(evt1)

        // Mouse Up instantly after
        evt1 = new MouseEvent('mouseup')
        document.dispatchEvent(evt1)

        // Mouse Down
        let evt2 = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        })
        element.dispatchEvent(evt2)

        // Mouse Up instantly after
        evt2 = new MouseEvent('mouseup')

        addEventListenerForAnnotationRendered()
        document.dispatchEvent(evt2)
      })

      this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

      try {
        vp.setStack([imageId1], 0)
        this.renderingEngine.render()
      } catch (e) {
        done.fail(e)
      }
    })

    it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        512
      )
      this.DOMElements.push(element)

      const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            // Can successfully add probe tool to annotationManager
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(1)

            const probeAnnotation = probeAnnotations[0]
            expect(probeAnnotation.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
            expect(probeAnnotation.invalidated).toBe(false)

            const data = probeAnnotation.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // The world coordinate is on the white bar so value is 255
            expect(data[targets[0]].value).toBe(255)

            AnnotationState.removeAnnotation(
              element,
              probeAnnotation.annotationUID
            )
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [150, 100, 0] // 255

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        })
        element.dispatchEvent(evt)

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

    it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        512
      )
      this.DOMElements.push(element)

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            // Can successfully add probe tool to annotationManager
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(1)

            const probeAnnotation = probeAnnotations[0]
            expect(probeAnnotation.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
            expect(probeAnnotation.invalidated).toBe(false)

            const data = probeAnnotation.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // The world coordinate is on the white bar so value is 255
            expect(data[targets[0]].value).toBe(0)

            AnnotationState.removeAnnotation(
              element,
              probeAnnotation.annotationUID
            )
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [35, 35, 0] // 0

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        })
        element.dispatchEvent(evt)

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

    it('Should successfully create a prob tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.ORTHOGRAPHIC,
        512,
        128
      )
      this.DOMElements.push(element)

      const vp = this.renderingEngine.getViewport(viewportUID)

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            // Can successfully add Length tool to annotationManager
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(1)

            const probeAnnotation = probeAnnotations[0]
            expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
            expect(probeAnnotation.invalidated).toBe(false)

            const data = probeAnnotation.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            expect(data[targets[0]].value).toBe(255)

            AnnotationState.removeAnnotation(
              element,
              probeAnnotation.annotationUID
            )
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [50, 50, 4]

        const { imageData } = vp.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp)

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

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup')

        addEventListenerForAnnotationRendered()
        document.dispatchEvent(evt)
      })

      this.stackToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID]
            )
            vp.render()
          })
      } catch (e) {
        done.fail(e)
      }
    })

    it('Should successfully create a Probe tool and select AND move it', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )
      this.DOMElements.push(element)

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p2

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(
          CornerstoneTools3DEvents.ANNOTATION_RENDERED,
          () => {
            const probeAnnotations = AnnotationState.getAnnotations(
              element,
              ProbeTool.toolName
            )
            // Can successfully add Length tool to annotationManager
            expect(probeAnnotations).toBeDefined()
            expect(probeAnnotations.length).toBe(1)

            const probeAnnotation = probeAnnotations[0]
            expect(probeAnnotation.metadata.referencedImageId).toBe(
              imageId1.split(':')[1]
            )
            expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
            expect(probeAnnotation.invalidated).toBe(false)

            const data = probeAnnotation.data.cachedStats
            const targets = Array.from(Object.keys(data))
            expect(targets.length).toBe(1)

            // We expect the probeTool which was original on 255 strip should be 0 now
            expect(data[targets[0]].value).toBe(0)

            const handles = probeAnnotation.data.handles.points

            expect(handles[0]).toEqual(p2)

            AnnotationState.removeAnnotation(
              element,
              probeAnnotation.annotationUID
            )
            done()
          }
        )
      }

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [11, 20, 0] // 255
        const index2 = [40, 40, 0] // 0

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

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup')
        document.dispatchEvent(evt)

        // Grab the probe tool again
        evt = new MouseEvent('mousedown', {
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
  })

  describe('Should successfully cancel a ProbeTool', () => {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(ProbeTool)
      cache.purgeCache()
      this.DOMElements = []

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack')
      this.stackToolGroup.addTool(ProbeTool.toolName, {
        configuration: { volumeUID: volumeId }, // Only for volume viewport
      })
      this.stackToolGroup.setToolActive(ProbeTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      })

      this.renderingEngine = new RenderingEngine(renderingEngineUID)
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader)
      volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
      metaData.addProvider(fakeMetaDataProvider, 10000)
    })

    afterEach(function () {
      csTools3d.destroy()
      eventTarget.reset()
      cache.purgeCache()
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

    it('Should successfully cancel drawing of a ProbeTool', function (done) {
      const element = createViewport(
        this.renderingEngine,
        VIEWPORT_TYPE.STACK,
        256,
        256
      )
      this.DOMElements.push(element)

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      let p2

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const index1 = [11, 20, 0] // 255
        const index2 = [40, 40, 0] // 0

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
          const probeAnnotations = AnnotationState.getAnnotations(
            element,
            ProbeTool.toolName
          )
          // Can successfully add Length tool to annotationManager
          expect(probeAnnotations).toBeDefined()
          expect(probeAnnotations.length).toBe(1)

          const probeAnnotation = probeAnnotations[0]
          expect(probeAnnotation.metadata.referencedImageId).toBe(
            imageId1.split(':')[1]
          )
          expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName)
          expect(probeAnnotation.invalidated).toBe(false)
          expect(probeAnnotation.highlighted).toBe(false)

          const data = probeAnnotation.data.cachedStats
          const targets = Array.from(Object.keys(data))
          expect(targets.length).toBe(1)

          // We expect the probeTool which was original on 255 strip should be 0 now
          expect(data[targets[0]].value).toBe(0)

          const handles = probeAnnotation.data.handles.points

          expect(handles[0]).toEqual(p2)

          AnnotationState.removeAnnotation(
            element,
            probeAnnotation.annotationUID
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
})
