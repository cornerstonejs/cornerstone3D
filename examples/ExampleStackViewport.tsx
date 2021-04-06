import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  ORIENTATION,
  VIEWPORT_TYPE,
  EVENTS as RENDERING_EVENTS,
} from '@cornerstone'
import { SynchronizerManager, synchronizers } from '@cornerstone-tools'

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps'
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, destroyToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ctStackUID,
  SCENE_IDS,
  VIEWPORT_IDS,
} from './constants'
import LAYOUTS, { stackCT } from './layouts'

// const STACK_RENDERING_ENGINE_UID = "stackRenderingEngine"
// const VOLUME_RENDERING_ENGINE_UID = "volumeRenderingEngine"

const { ctSceneToolGroup, stackSceneToolGroup } = initToolGroups()

window.cache = cache

class StackViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 2,
      numRows: 1,
      viewports: [{}, {}],
    },
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  }

  constructor(props) {
    super(props)

    this._canvasNodes = new Map()
    this._viewportGridRef = React.createRef()
    this.imageIdsPromise = getImageIdsAndCacheMetadata()
    this.imageIdsPromise.then(() =>
      this.setState({ progressText: 'Loading data...' })
    )

    // const {
    //   createCameraPositionSynchronizer,
    //   createVOISynchronizer,
    // } = synchronizers

    // this.axialSync = createCameraPositionSynchronizer('axialSync')
    // this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    // this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    // this.ctWLSync = createVOISynchronizer('ctWLSync')
    // this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    this.ctVolumeUID = ctVolumeUID
    this.ctStackUID = ctStackUID

    // Create volumes
    const imageIds = await this.imageIdsPromise
    const { ctImageIds } = imageIds

    const renderingEngine = new RenderingEngine(renderingEngineUID)
    // const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.STACK,
        viewportUID: VIEWPORT_IDS.STACK,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )

    stackSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.STACK,
      VIEWPORT_IDS.STACK
    )

    renderingEngine.render()

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctImageIds,
    })

    // const stackVolume = await createAndCacheVolume(ctStackUID, {
    //   imageIds: ctImageIds,
    // })

    // Initialise all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    const stackScene = renderingEngine.getScene(SCENE_IDS.STACK)

    ctScene.setVolumes([
      {
        volumeUID: ctVolumeUID,
      },
    ])

    // stackScene.setVolumes([
    //   {
    //     volumeUID: ctVolumeUID,
    //   },
    // ])

    // ctScene.setStack([
    //   {
    //     imageIds: ctImageIds,
    //   },
    // ])

    // This o

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialise volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    // Destroy synchronizers
    // SynchronizerManager.destroy()
    cache.purgeCache()

    this.renderingEngine.destroy()
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              className="viewport-pane"
              style={{
                ...(vp.cellStyle || {}),
                border: '2px solid grey',
                background: 'black',
              }}
              key={i}
            >
              <canvas ref={(c) => this._canvasNodes.set(i, c)} />
            </div>
          ))}
        </ViewportGrid>
      </div>
    )
  }
}

export default StackViewportExample
