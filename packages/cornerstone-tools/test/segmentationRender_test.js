import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_SEG_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_AX.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_SAG from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SAG.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_COR from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_COR.png'
import * as volumeURI_100_100_10_1_1_1_0_2SEGs_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_2SEGs_AX.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom.png'

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  volumeLoader,
  utilities,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D

const { unregisterAllImageLoaders } = imageLoader
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader
const { VIEWPORT_TYPE, ORIENTATION } = Enums

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  segmentation,
  CornerstoneTools3DEvents: EVENTS,
  SegmentationRepresentations,
} = csTools3d

const { addSegmentationsForToolGroup } = segmentation

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } =
  utilities.testUtils

const renderingEngineUID = utilities.uuidv4()

const viewportUID1 = 'AXIAL'
const viewportUID2 = 'SAGITTAL'
const viewportUID3 = 'CORONAL'

const LABELMAP = SegmentationRepresentations.Labelmap

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

describe('Segmentation Render -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false)
  })

  describe('Rendering', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool)
      cache.purgeCache()
      this.DOMElements = []

      this.segToolGroup = ToolGroupManager.createToolGroup('segToolGroup')
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName)
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
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

    it('should successfully render a segmentation on a volume', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID1)

      eventTarget.addEventListener(EVENTS.SEGMENTATION_RENDERED, (evt) => {
        const canvas = vp.getCanvas()
        const image = canvas.toDataURL('image/png')

        expect(evt.detail.toolGroupUID).toBe('segToolGroup')
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_SEG_AX,
          'volumeURI_100_100_10_1_1_1_0_SEG_AX'
        ).then(done, done.fail)
      })

      this.segToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID1]
          )
          vp.render()
          createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
            addSegmentationsForToolGroup(this.segToolGroup.uid, [
              { volumeUID: segVolumeId },
            ])
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully render a segmentation on a volume with more than one viewport', function (done) {
      const el1 = createViewport(this.renderingEngine, AXIAL, viewportUID1)
      const el2 = createViewport(this.renderingEngine, SAGITTAL, viewportUID2)
      const el3 = createViewport(this.renderingEngine, CORONAL, viewportUID3)

      this.DOMElements.push(el1)
      this.DOMElements.push(el2)
      this.DOMElements.push(el3)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)
      const vp2 = this.renderingEngine.getViewport(viewportUID2)
      const vp3 = this.renderingEngine.getViewport(viewportUID3)

      let renderedViewportCounts = 0
      eventTarget.addEventListener(EVENTS.SEGMENTATION_RENDERED, (evt) => {
        renderedViewportCounts++

        if (renderedViewportCounts !== 3) {
          return
        }

        const canvas1 = vp1.getCanvas()
        const canvas2 = vp2.getCanvas()
        const canvas3 = vp3.getCanvas()
        const image1 = canvas1.toDataURL('image/png')
        const image2 = canvas2.toDataURL('image/png')
        const image3 = canvas3.toDataURL('image/png')

        expect(evt.detail.toolGroupUID).toBe('segToolGroup')
        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_AX,
          'volumeURI_100_100_10_1_1_1_0_AX'
        ).then(() => {
          compareImages(
            image2,
            volumeURI_100_100_10_1_1_1_0_SEG_SAG,
            'volumeURI_100_100_10_1_1_1_0_SAG'
          ).then(() => {
            compareImages(
              image3,
              volumeURI_100_100_10_1_1_1_0_SEG_COR,
              'volumeURI_100_100_10_1_1_1_0_COR'
            ).then(done, done.fail)
          })
        })
      })

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)
      this.segToolGroup.addViewport(vp2.uid, this.renderingEngine.uid)
      this.segToolGroup.addViewport(vp3.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID1, viewportUID2, viewportUID3]
          )
          this.renderingEngine.render()
          createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
            addSegmentationsForToolGroup(this.segToolGroup.uid, [
              { volumeUID: segVolumeId },
            ])
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully render two segmentations on a viewport', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, viewportUID1)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_50_50_6'
      const segVolumeId2 =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_60_60_2_80_80_7'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      eventTarget.addEventListener(EVENTS.SEGMENTATION_RENDERED, (evt) => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        expect(evt.detail.toolGroupUID).toBe('segToolGroup')
        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_2SEGs_AX,
          'volumeURI_100_100_10_1_1_1_0_2SEGs_AX'
        ).then(done, done.fail)
      })

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID1]
          )
          this.renderingEngine.render()
          createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
            createAndCacheVolume(segVolumeId2, { imageIds: [] }).then(() => {
              addSegmentationsForToolGroup(this.segToolGroup.uid, [
                { volumeUID: segVolumeId },
                { volumeUID: segVolumeId2 },
              ])
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully render a segmentation with toolGroup specific config', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, viewportUID1)
      this.DOMElements.push(element)

      const customToolGroupSeConfig = {
        representations: {
          [SegmentationRepresentations.Labelmap]: {
            renderOutline: false,
            fillAlpha: 0.99,
          },
        },
      }

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      eventTarget.addEventListener(EVENTS.SEGMENTATION_RENDERED, (evt) => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')
        expect(evt.detail.toolGroupUID).toBe('segToolGroup')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom,
          'volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom'
        ).then(done, done.fail)
      })

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_STATE_MODIFIED,
        (evt) => {
          const toolGroupState = segmentation.state.getSegmentationState(
            this.segToolGroup.uid
          )

          expect(toolGroupState).toBeDefined()

          const toolGroupConfig =
            segmentation.segmentationConfig.getSegmentationConfig(
              this.segToolGroup.uid
            )

          expect(toolGroupConfig).toBeDefined()
          expect(toolGroupConfig.renderInactiveSegmentations).toBe(true)
          expect(toolGroupConfig.representations[LABELMAP]).toEqual(
            customToolGroupSeConfig.representations[LABELMAP]
          )
        }
      )

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID1]
          )
          this.renderingEngine.render()
          createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
            addSegmentationsForToolGroup(
              this.segToolGroup.uid,
              [{ volumeUID: segVolumeId }],
              {
                ...customToolGroupSeConfig,
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
