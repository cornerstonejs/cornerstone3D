import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  volumeLoader,
  Enums,
  CONSTANTS,
  init as csRenderInit,
  setVolumesForViewports,
} from '@cornerstonejs/core'
import {
  Enums as csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
} from '@cornerstonejs/tools'
import './helpers/initCornerstone'
import { initToolGroups, addToolsToToolGroups } from './helpers/initToolGroups'
import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import {
  renderingEngineId,
  ptVolumeId,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'

const VOLUME = 'volume'

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

let ptSceneToolGroup

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  StackScrollTool.toolName,
]

class OneVolumeExample extends Component {
  constructor(props) {
    super(props)

    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.volumeImageIds = getImageIds('pt1', VOLUME)

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
    await csRenderInit()
    ;({ ptSceneToolGroup } = initToolGroups())

    const volumeImageIds = await this.volumeImageIds

    const renderingEngine = new RenderingEngine(renderingEngineId)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        viewportId: VIEWPORT_IDS.PT.AXIAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 1, 1],
        },
      },
      {
        viewportId: VIEWPORT_IDS.PT.SAGITTAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
      {
        viewportId: VIEWPORT_IDS.PT.CORONAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 1],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ptSceneToolGroup.addViewport(VIEWPORT_IDS.PT.AXIAL, renderingEngineId)
    ptSceneToolGroup.addViewport(VIEWPORT_IDS.PT.SAGITTAL, renderingEngineId)
    ptSceneToolGroup.addViewport(VIEWPORT_IDS.PT.CORONAL, renderingEngineId)

    addToolsToToolGroups({ ptSceneToolGroup })

    renderingEngine.render()

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
      imageIds: volumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    // const { scalarData } = ctVolume
    // const ctLength = scalarData.length

    // for (let i = 0; i < ctLength; i++) {
    //   scalarData[i] = -1024
    // }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: ptVolumeId,
          callback: setPetTransferFunction,
          blendMode: Enums.BlendModes.COMPOSITE,
        },
      ],
      [VIEWPORT_IDS.PT.AXIAL, VIEWPORT_IDS.PT.SAGITTAL, VIEWPORT_IDS.PT.CORONAL]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialise volumes in GPU memory
    renderingEngine.render()

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()

    this.renderingEngine.destroy()
  }

  destroyAndDecacheAllVolumes = () => {
    this.renderingEngine.destroy()
    cache.purgeCache()
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <ViewportGrid
          numCols={3}
          numRows={1}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {[{}, {}, {}].map((vp, i) => (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '2px solid grey',
                background: 'black',
              }}
              ref={(c) => this._elementNodes.set(i, c)}
              onContextMenu={(e) => e.preventDefault()}
              key={i}
            />
          ))}
        </ViewportGrid>
      </div>
    )
  }
}

export default OneVolumeExample
