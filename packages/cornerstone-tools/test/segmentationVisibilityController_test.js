import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

import * as volumeURI_100_100_10_1_1_1_0_SEG_activeInactive from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_activeInactive.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT.png'
import * as volumeURI_100_100_10_1_1_1_0_SEG_visiblity from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_visiblity.png'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  metaData,
  volumeLoader,
  utilities,
  setVolumesForViewports,
  eventTarget,
  imageLoader,
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
  RectangleScissorsTool,
} = csTools3d

const { fakeVolumeLoader, fakeMetaDataProvider, compareImages } =
  utilities.testUtils

const renderingEngineUID = utilities.uuidv4()

const viewportUID1 = 'AXIAL'

const AXIAL = 'AXIAL'

const TOOL_GROUP_UID = 'segToolGroup'

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

describe('Segmentation Controller --', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Visibility/Color Controller', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool)
      csTools3d.addTool(RectangleScissorsTool)
      cache.purgeCache()
      this.DOMElements = []

      this.segToolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_UID)
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName)
      this.segToolGroup.addTool(RectangleScissorsTool.toolName)
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName)
      this.segToolGroup.setToolActive(RectangleScissorsTool.toolName, {
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

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should be able to load two segmentations on the toolGroup', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
      const seg2VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_activeInactive,
          'volumeURI_100_100_10_1_1_1_0_SEG_activeInactive'
        ).then(done, done.fail)
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
            createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
              setVolumesForViewports(
                this.renderingEngine,
                [{ volumeUID: volumeId }],
                [viewportUID1]
              ).then(() => {
                vp1.render()

                // add two volumes on the segmentation
                addSegmentationsForToolGroup(TOOL_GROUP_UID, [
                  {
                    volumeUID: seg1VolumeID,
                  },
                  {
                    volumeUID: seg2VolumeID,
                  },
                ])
              })
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    it('should be able to load two segmentations on the toolGroup with different colorIndices', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
      const seg2VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2'
      const vp1 = this.renderingEngine.getViewport(viewportUID1)

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas()
        const image1 = canvas1.toDataURL('image/png')

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT,
          'volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT'
        ).then(done, done.fail)
      }

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_RENDERED,
        compareImageCallback
      )

      this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
            createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
              setVolumesForViewports(
                this.renderingEngine,
                [{ volumeUID: volumeId }],
                [viewportUID1]
              ).then(() => {
                vp1.render()

                const colorLUTIndex = 1
                SegmentationModule.segmentationColorController.addColorLut(
                  [
                    [0, 0, 0, 0],
                    [245, 209, 145, 255],
                  ],
                  colorLUTIndex
                )

                // add two volumes on the segmentation
                addSegmentationsForToolGroup(TOOL_GROUP_UID, [
                  {
                    volumeUID: seg1VolumeID,
                    colorLUTIndex: 1,
                  },
                  {
                    volumeUID: seg2VolumeID,
                  },
                ])
              })
            })
          })
        })
      } catch (e) {
        done.fail(e)
      }
    })

    // it('should be able to load two segmentations on the toolGroup and make one invisible', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL)

    //   // fake volume generator follows the pattern of
    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
    //   const seg1VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
    //   const seg2VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2'
    //   const vp1 = this.renderingEngine.getViewport(viewportUID1)

    //   const compareImageCallback = () => {
    //     console.log('calling compare ************')
    //     const canvas1 = vp1.getCanvas()
    //     const image1 = canvas1.toDataURL('image/png')

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_visiblity,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_visiblity'
    //     )

    //     const segmentationState =
    //       csTools3d.SegmentationState.getSegmentationState(TOOL_GROUP_UID)

    //     // expect(segmentationState.length).toBe(2)
    //     // expect(segmentationState[0].visibility).toBe(true)
    //     // expect(segmentationState[1].visibility).toBe(false)
    //     // expect(segmentationState[0].active).toBe(true)
    //     // expect(segmentationState[1].active).toBe(false)

    //     // done()
    //   }

    //   eventTarget.addEventListener(
    //     EVENTS.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   )

    //   this.segToolGroup.addViewport(vp1.uid, this.renderingEngine.uid)

    //   try {
    //     createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
    //         createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //           setVolumesForViewports(
    //             this.renderingEngine,
    //             [{ volumeUID: volumeId }],
    //             [viewportUID1]
    //           ).then(() => {
    //             vp1.render()

    //             // add two volumes on the segmentation
    //             addSegmentationsForToolGroup(TOOL_GROUP_UID, [
    //               {
    //                 volumeUID: seg1VolumeID,
    //               },
    //               {
    //                 volumeUID: seg2VolumeID,
    //               },
    //             ]).then(() => {
    //               const segmentationData =
    //                 SegmentationModule.activeSegmentationController.getActiveSegmentationInfo(
    //                   TOOL_GROUP_UID
    //                 )

    //               SegmentationModule.segmentationVisibilityController.setSegmentationVisibility(
    //                 TOOL_GROUP_UID,
    //                 segmentationData.segmentationDataUID,
    //                 false
    //               )
    //             })
    //           })
    //         })
    //       })
    //     })
    //   } catch (e) {
    //     done.fail(e)
    //   }
    // }, )
  })
})
