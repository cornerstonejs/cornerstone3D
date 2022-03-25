import * as cornerstone3D from '@cornerstonejs/core'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_SEG_initialConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_initialConfig.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize.png'

const {
  cache,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  utilities,
  setVolumesForViewports,
  eventTarget,
  volumeLoader,
  CONSTANTS,
} = cornerstone3D

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader
const { unregisterAllImageLoaders } = imageLoader
const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  segmentation,
  Enums: csToolsEnums,
  RectangleScissorsTool,
} = csTools3d

const { Events } = csToolsEnums

const { addSegmentationRepresentations } = segmentation
const { SegmentationRepresentations } = csToolsEnums

const { fakeVolumeLoader, fakeMetaDataProvider, compareImages } =
  utilities.testUtils

const renderingEngineId = utilities.uuidv4()

const viewportId1 = 'AXIAL'
const AXIAL = 'AXIAL'

const TOOL_GROUP_ID = 'segToolGroup'

function createViewport(
  renderingEngine,
  orientation,
  viewportId = viewportId1
) {
  const element = document.createElement('div')

  element.style.width = '250px'
  element.style.height = '250px'
  document.body.appendChild(element)

  renderingEngine.enableElement({
    viewportId: viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION[orientation],
      background: [1, 0, 1], // pinkish background
    },
  })
  return element
}

// TODO: Ignored temporarily because fix/labelmap-outline changes
// are not in VTK master

describe('Segmentation Controller --', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false)
  })

  describe('Config Controller', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool)
      csTools3d.addTool(RectangleScissorsTool)
      cache.purgeCache()
      this.DOMElements = []

      this.segToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName)
      this.segToolGroup.addTool(RectangleScissorsTool.toolName)
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
      this.segToolGroup.setToolActive(RectangleScissorsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      })
      this.renderingEngine = new RenderingEngine(renderingEngineId)
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
      ToolGroupManager.destroyToolGroupById(TOOL_GROUP_ID)

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should be able to load a segmentation with a toolGroup specific config', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

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
      const vp1 = this.renderingEngine.getViewport(viewportId1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_initialConfig,
          'volumeURI_100_100_10_1_1_1_0_SEG_initialConfig'
        )

        const representationConfig =
          segmentation.segmentationConfig.getRepresentationConfig(
            TOOL_GROUP_ID,
            SegmentationRepresentations.Labelmap
          )

        const segmentationConfig =
          segmentation.segmentationConfig.getSegmentationConfig(TOOL_GROUP_ID)

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
          segmentation.segmentationConfig.getGlobalRepresentationConfig(
            SegmentationRepresentations.Labelmap
          )

        const globalSegmentationConfig =
          segmentation.segmentationConfig.getGlobalSegmentationConfig()

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
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId1]
            ).then(() => {
              vp1.render()

              // add two volumes on the segmentation
              addSegmentationRepresentations(
                TOOL_GROUP_ID,
                [
                  {
                    volumeId: seg1VolumeID,
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
      this.DOMElements.push(element)

      const globalRepresentationConfig = {
        renderOutline: false,
        fillAlpha: 0.996,
      }

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_30_30_3_80_80_6'
      const vp1 = this.renderingEngine.getViewport(viewportId1)

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
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId1]
            ).then(() => {
              vp1.render()

              segmentation.segmentationConfig.setGlobalRepresentationConfig(
                SegmentationRepresentations.Labelmap,
                globalRepresentationConfig
              )
              const colorLUTIndex = 1
              segmentation.segmentationColor.addColorLUT(
                [
                  [0, 0, 0, 0],
                  [0, 0, 255, 255],
                ],
                colorLUTIndex
              )

              // add two volumes on the segmentation
              addSegmentationRepresentations(TOOL_GROUP_ID, [
                {
                  volumeId: seg1VolumeID,
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
      this.DOMElements.push(element)

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
      const vp1 = this.renderingEngine.getViewport(viewportId1)

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
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId1]
            ).then(() => {
              vp1.render()

              segmentation.segmentationConfig.setGlobalRepresentationConfig(
                SegmentationRepresentations.Labelmap,
                globalRepresentationConfig
              )
              const colorLUTIndex = 1
              segmentation.segmentationColor.addColorLUT(
                [
                  [0, 0, 0, 0],
                  [0, 255, 255, 255],
                ],
                colorLUTIndex
              )

              // add two volumes on the segmentation
              addSegmentationRepresentations(
                TOOL_GROUP_ID,
                [
                  {
                    volumeId: seg1VolumeID,
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
