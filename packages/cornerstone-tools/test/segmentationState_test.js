import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  volumeLoader,
  utilities,
  setVolumesForViewports,
  eventTarget,
  imageLoader,
} = cornerstone3D

const { unregisterAllImageLoaders } = imageLoader
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader
const { ViewportType, ORIENTATION } = Enums

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  SegmentationRepresentations,
  segmentation,
  CornerstoneTools3DEvents: Events,
  utilities: { segmentation: segUtils },
} = csTools3d

const { addSegmentationsForToolGroup } = segmentation

const { fakeMetaDataProvider, fakeVolumeLoader } = utilities.testUtils

const renderingEngineUID = utilities.uuidv4()

const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const LABELMAP = SegmentationRepresentations.Labelmap

function createViewport(renderingEngine, orientation) {
  const element = document.createElement('div')

  element.style.width = '250px'
  element.style.height = '250px'
  document.body.appendChild(element)

  renderingEngine.setViewports([
    {
      viewportUID: viewportUID,
      type: ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation: ORIENTATION[orientation],
        background: [1, 0, 1], // pinkish background
      },
    },
  ])
  return element
}

describe('Segmentation State -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false)
  })

  describe('State', function () {
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

    it('should successfully create a global and toolGroup state when segmentation is added', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      eventTarget.addEventListener(
        Events.SEGMENTATION_GLOBAL_STATE_MODIFIED,
        (evt) => {
          const globalState =
            segmentation.state.getGlobalSegmentationDataByUID(segVolumeId)

          expect(evt.detail.segmentationUID.includes(segVolumeId)).toBe(true)

          expect(globalState).toBeDefined()

          expect(globalState.volumeUID).toBe(segVolumeId)
          expect(globalState.label).toBe(segVolumeId)
          expect(globalState.activeSegmentIndex).toBe(1)
        }
      )
      eventTarget.addEventListener(
        Events.SEGMENTATION_STATE_MODIFIED,
        (evt) => {
          const stateManager =
            segmentation.state.getDefaultSegmentationStateManager(segVolumeId)

          const state = stateManager.getState()

          expect(evt.detail.toolGroupUID).toBe('segToolGroup')
          expect(state).toBeDefined()
          expect(state.toolGroups).toBeDefined()

          const toolGroupSegmentationState =
            state.toolGroups[this.segToolGroup.uid]

          expect(toolGroupSegmentationState).toBeDefined()
          expect(toolGroupSegmentationState.segmentations.length).toBe(1)

          const segState = segmentation.state.getSegmentationState(
            this.segToolGroup.uid
          )

          expect(toolGroupSegmentationState.segmentations).toEqual(segState)

          const segData = segState[0]

          expect(segData.active).toBe(true)
          expect(segData.visibility).toBe(true)
          expect(segData.segmentationDataUID).toBeDefined()
          expect(segData.volumeUID).toBe(segVolumeId)
          expect(segData.representation).toBeDefined()
          expect(segData.representation.type).toBe(LABELMAP)
          expect(segData.representation.config).toBeDefined()

          done()
        }
      )

      this.segToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID]
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

    it('should successfully create a global default representation configuration', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      eventTarget.addEventListener(
        Events.SEGMENTATION_GLOBAL_STATE_MODIFIED,
        (evt) => {
          const globalConfig = segmentation.state.getGlobalSegmentationConfig()

          expect(globalConfig.renderInactiveSegmentations).toBe(true)
          expect(globalConfig.representations).toBeDefined()
          expect(globalConfig.representations[LABELMAP]).toBeDefined()

          const representationConfig =
            segUtils.getDefaultRepresentationConfig(LABELMAP)

          const stateConfig = globalConfig.representations[LABELMAP]

          expect(Object.keys(stateConfig)).toEqual(
            Object.keys(representationConfig)
          )

          expect(Object.values(stateConfig)).toEqual(
            Object.values(representationConfig)
          )

          done()
        }
      )

      this.segToolGroup.addViewport(vp.uid, this.renderingEngine.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeUID: volumeId, callback }],
            [viewportUID]
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
  })
})
