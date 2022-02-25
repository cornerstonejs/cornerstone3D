import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_SEG_initialConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_initialConfig.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize.png'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  unregisterAllImageLoaders,
  metaData,
  registerVolumeLoader,
  createAndCacheVolume,
  Utilities,
  setVolumesOnViewports,
  eventTarget,
} = cornerstone3D

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  addSegmentationsForToolGroup,
  CornerstoneTools3DEvents: EVENTS,
  SegmentationRepresentations,
  SegmentationModule,
  RectangleScissorsTool,
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

const LABELMAP = SegmentationRepresentations.Labelmap

const AXIAL = 'AXIAL'
const SAGITTAL = 'SAGITTAL'
const CORONAL = 'CORONAL'

const TOOL_GROUP_UID = 'segToolGroup'

const DOMElements = []

function createViewport(
  renderingEngine,
  orientation,
  viewportUID = viewportUID1
) {
  const element = document.createElement('div')

  element.style.width = '250px'
  element.style.height = '250px'
  document.body.appendChild(element)
  DOMElements.push(element)

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

describe('Segmentation Controller --', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Config Controller', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool, {})
      csTools3d.addTool(RectangleScissorsTool, {})
      cache.purgeCache()
      this.segToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UID)
      this.segToolGroup.addTool('SegmentationDisplay', {})
      this.segToolGroup.addTool('RectangleScissor', {})
      this.segToolGroup.setToolEnabled('SegmentationDisplay', {})
      this.segToolGroup.setToolActive('RectangleScissor', {
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
      ToolGroupManager.destroyToolGroupByToolGroupUID(TOOL_GROUP_UID)

      DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should be able to load a segmentation with a toolGroup specific config', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)

      const toolGroupSpecificConfig = {
        representations: {
          [SegmentationRepresentations.Labelmap]: {
            renderOutline: false,
            fillAlpha: 0.999,
          },
        },
      }

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_initialConfig,
          'volumeURI_100_100_10_1_1_1_0_SEG_initialConfig'
        )

        const representationConfig =
          SegmentationModule.segmentationConfigController.getRepresentationConfig(
            TOOL_GROUP_UID,
            SegmentationRepresentations.Labelmap
          )

        const segmentationConfig =
          SegmentationModule.segmentationConfigController.getSegmentationConfig(
            TOOL_GROUP_UID
          )

        const representationConfigFromSegmentationConfig =
          segmentationConfig.representations[
            SegmentationRepresentations.Labelmap
          ]
        expect(representationConfigFromSegmentationConfig.fillAlpha).toEqual(
          representationConfig.fillAlpha
        )
        expect(
          representationConfigFromSegmentationConfig.renderOutline
        ).toEqual(representationConfig.renderOutline)

        const globalRepresentationConfig =
          SegmentationModule.segmentationConfigController.getGlobalRepresentationConfig(
            SegmentationRepresentations.Labelmap
          )

        const globalSegmentationConfig =
          SegmentationModule.segmentationConfigController.getGlobalSegmentationConfig()

        expect(globalRepresentationConfig).toBeDefined()
        expect(globalRepresentationConfig.renderOutline).toBe(true)

        const globalRepresentationConfigFromSegmentationConfig =
          globalSegmentationConfig.representations[
            SegmentationRepresentations.Labelmap
          ]

        expect(
          globalRepresentationConfigFromSegmentationConfig.renderOutline
        ).toEqual(globalRepresentationConfig.renderOutline)

        done()
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewports(this.renderingEngine.uid, vp1.uid)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID1]
            ).then(() => {
              vp1.render()

              // add two volumes on the segmentation
              addSegmentationsForToolGroup(
                TOOL_GROUP_UID,
                [
                  {
                    volumeUID: seg1VolumeID,
                  },
                ],
                toolGroupSpecificConfig
              )
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should be able to set a global representation configuration', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)

      const globalRepresentationConfig = {
        renderOutline: false,
        fillAlpha: 0.996,
      }

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_30_30_3_80_80_6'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig,
          'volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig'
        ).then(done, done.fail)
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewports(this.renderingEngine.uid, vp1.uid)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID1]
            ).then(() => {
              vp1.render()

              SegmentationModule.segmentationConfigController.setGlobalRepresentationConfig(
                SegmentationRepresentations.Labelmap,
                globalRepresentationConfig
              )
              const colorLUTIndex = 1
              SegmentationModule.segmentationColorController.addColorLut(
                [
                  [0, 0, 0, 0],
                  [0, 0, 255, 255],
                ],
                colorLUTIndex
              )

              // add two volumes on the segmentation
              addSegmentationsForToolGroup(TOOL_GROUP_UID, [
                {
                  volumeUID: seg1VolumeID,
                  colorLUTIndex: 1,
                },
              ])
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should prioritize the toolGroup specific config over global config ', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)

      const globalRepresentationConfig = {
        renderOutline: false,
        fillAlpha: 0.996,
      }

      const toolGroupSpecificConfig = {
        representations: {
          [SegmentationRepresentations.Labelmap]: {
            renderOutline: true,
            fillAlpha: 0.5,
          },
        },
      }

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_70_30_3_80_80_6'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize,
          'volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize'
        ).then(done, done.fail)
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewports(this.renderingEngine.uid, vp1.uid)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID1]
            ).then(() => {
              vp1.render()

              SegmentationModule.segmentationConfigController.setGlobalRepresentationConfig(
                SegmentationRepresentations.Labelmap,
                globalRepresentationConfig
              )
              const colorLUTIndex = 1
              SegmentationModule.segmentationColorController.addColorLut(
                [
                  [0, 0, 0, 0],
                  [0, 255, 255, 255],
                ],
                colorLUTIndex
              )

              // add two volumes on the segmentation
              addSegmentationsForToolGroup(
                TOOL_GROUP_UID,
                [
                  {
                    volumeUID: seg1VolumeID,
                    colorLUTIndex: 1,
                  },
                ],
                toolGroupSpecificConfig
              )
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })
  })
})
