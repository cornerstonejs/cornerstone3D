import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

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
  SegmentationState,
  Utilities: { segmentation: segUtils },
  SegmentationRepresentations,
} = csTools3d

const { fakeMetaDataProvider, fakeVolumeLoader } = Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'
const SAGITTAL = 'SAGITTAL'
const CORONAL = 'CORONAL'

const LABELMAP = SegmentationRepresentations.Labelmap

const DOMElements = []

function createViewport(renderingEngine, orientation) {
  const element = document.createElement('div')

  element.style.width = '250px'
  element.style.height = '250px'
  document.body.appendChild(element)
  DOMElements.push(element)

  renderingEngine.setViewports([
    {
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
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
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('State', function () {
    beforeEach(function () {
      csTools3d.init()
      csTools3d.addTool(SegmentationDisplayTool, {})
      cache.purgeCache()
      this.segToolGroup = ToolGroupManager.createToolGroup('segToolGroup')
      this.segToolGroup.addTool('SegmentationDisplay', {})
      this.segToolGroup.setToolEnabled('SegmentationDisplay', {})
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

      DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully create a global and toolGroup state when segmentation is added', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_GLOBAL_STATE_MODIFIED,
        (evt) => {
          const globalState =
            SegmentationState.getGlobalSegmentationDataByUID(segVolumeId)

          expect(evt.detail.segmentationUIDs.length).toBe(1)
          expect(evt.detail.segmentationUIDs[0]).toBe(segVolumeId)

          expect(globalState).toBeDefined()

          expect(globalState.volumeUID).toBe(segVolumeId)
          expect(globalState.label).toBe(segVolumeId)
          expect(globalState.activeSegmentIndex).toBe(1)
        }
      )
      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_STATE_MODIFIED,
        (evt) => {
          const stateManager =
            SegmentationState.getDefaultSegmentationStateManager(segVolumeId)

          const state = stateManager.getState()

          expect(evt.detail.toolGroupUID).toBe('segToolGroup')
          expect(state).toBeDefined()
          expect(state.toolGroups).toBeDefined()

          const toolGroupSegmentationState =
            state.toolGroups[this.segToolGroup.uid]

          expect(toolGroupSegmentationState).toBeDefined()
          expect(toolGroupSegmentationState.segmentations.length).toBe(1)

          const segState = SegmentationState.getSegmentationState(
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

      this.segToolGroup.addViewports(this.renderingEngine.uid, vp.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesOnViewports(
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

      // fake volume generator follows the pattern of
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      eventTarget.addEventListener(
        EVENTS.SEGMENTATION_GLOBAL_STATE_MODIFIED,
        (evt) => {
          const { segmentationUIDs } = evt.detail
          const globalConfig = SegmentationState.getGlobalSegmentationConfig()

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

      this.segToolGroup.addViewports(this.renderingEngine.uid, vp.uid)

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesOnViewports(
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
