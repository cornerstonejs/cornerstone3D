import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR.png'
const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  metaData,
  imageLoader,
  volumeLoader,
  Utilities,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D

const { unregisterAllImageLoaders } = imageLoader
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  addSegmentationsForToolGroup,
  CornerstoneTools3DEvents: EVENTS,
  SegmentationRepresentations,
  SegmentationModule,
  SphereScissorsTool,
} = csTools3d

const {
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
  compareImages,
} = Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const viewportUID1 = 'AXIAL'
const viewportUID2 = 'SAGITTAL'
const viewportUID3 = 'CORONAL'

const AXIAL = 'AXIAL'
const SAGITTAL = 'SAGITTAL'
const CORONAL = 'CORONAL'

function createViewport(
  renderingEngine,
  orientation,
  viewportUID = viewportUID1
) {
  const element = document.createElement('div')

  element.style.width = '250px'
  element.style.height = '250px'
  document.body.appendChild(element)

  renderingEngine.enableElement({
    viewportUID: viewportUID,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION[orientation],
      background: [1, 0, 1], // pinkish background
    },
  })
  return element
}

describe('Segmentation Tools --', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Sphere Scissor', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool)
      csTools3d.addTool(SphereScissorsTool)
      cache.purgeCache()
      this.DOMElements = []

      this.segToolGroup = ToolGroupManager.createToolGroup('segToolGroup')
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName)
      this.segToolGroup.addTool(SphereScissorsTool.toolName)
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
      this.segToolGroup.setToolActive(SphereScissorsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      })
      this.renderingEngine = new RenderingEngine(renderingEngineUID)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
      metaData.addProvider(fakeMetaDataProvider, 10000)
    })

    afterEach(function () {
      // Note: since on toolGroup destroy, all segmentations are removed
      // from the toolGroups, and that triggers a state_updated event, we
      // need to make sure we remove the listeners before we destroy the
      // toolGroup
      eventTarget.reset()
      csTools3d.destroy()
      cache.purgeCache()
      this.renderingEngine.destroy()
      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      ToolGroupManager.destroyToolGroupByToolGroupUID('segToolGroup')

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should be able to edit the segmentation data with the sphere scissor', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      const element2 = createViewport(
        this.renderingEngine,
        SAGITTAL,
        viewportUID2
      )
      const element3 = createViewport(
        this.renderingEngine,
        CORONAL,
        viewportUID3
      )
      this.DOMElements.push(element)
      this.DOMElements.push(element2)
      this.DOMElements.push(element3)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)
      const vp2 = this.renderingEngine.getViewport(viewportUID2)
      const vp3 = this.renderingEngine.getViewport(viewportUID3)

      const drawSphere = () => {
        eventTarget.addEventListener(
          EVENTS.SEGMENTATION_RENDERED,
          compareImageCallback
        )

        const index1 = [50, 50, 0]
        const index2 = [60, 60, 0]

        const { imageData } = vp1.getImageData()

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp1)

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp1)

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
      }

      let renderCount = 0
      const newSegRenderedCallback = () => {
        renderCount++

        if (renderCount === 3) {
          return
        }

        eventTarget.removeEventListener(
          EVENTS.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        )

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawSphere()
        }, 500)
      }

      let compareCount = 0
      const compareImageCallback = () => {
        compareCount++

        if (compareCount !== 3) {
          return
        }

        const canvas1 = vp1.getCanvas()
        const canvas2 = vp2.getCanvas()
        const canvas3 = vp3.getCanvas()
        const image1 = canvas1.toDataURL('image/png')
        const image2 = canvas2.toDataURL('image/png')
        const image3 = canvas3.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX'
        )

        compareImages(
          image2,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG'
        )

        compareImages(
          image3,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR'
        ).then(done, done.fail)
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      )

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_GLOBAL_STATE_MODIFIED,
        (evt) => {
          const { segmentationUID } = evt.detail
          expect(segmentationUID.includes(volumeId)).toBe(true)
        }
      )

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)
      this.segToolGroup.addViewport(vp2.uid, this.renderingEngine.uid)
      this.segToolGroup.addViewport(vp3.uid, this.renderingEngine.uid)

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId }],
            [viewportUID1, viewportUID2, viewportUID3]
          ).then(() => {
            vp1.render()
            vp2.render()
            vp3.render()

            SegmentationModule.createNewSegmentationForViewport(vp1).then(
              (segmentationUID) => {
                addSegmentationsForToolGroup(this.segToolGroup.uid, [
                  { volumeUID: segmentationUID },
                ])
              }
            )
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })
  })
})
