import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'
import {
  SynchronizerManager,
  synchronizers,
  ToolGroupManager,
  resetToolsState,
} from '@ohif/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ptCtToggleAnnotationTool from './helpers/ptCtToggleAnnotationTool'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, destroyToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
  PET_CT_ANNOTATION_TOOLS,
} from './constants'
import LAYOUTS, { ptCtFusion, fourUpCT, petTypes, obliqueCT } from './layouts'
import config from './config/default'

import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import limitImageIds from './helpers/limitImageIds'

const VOLUME = 'volume'
const STACK = 'stack'

let ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
  ctObliqueToolGroup,
  ptTypesSceneToolGroup,
  ptCtLayoutTools

const {
  createCameraPositionSynchronizer,
  createVOISynchronizer,
} = synchronizers

const ctVolumeUID2 = 'ctvolume2'
const ptVolumeUID2 = 'petvolume2'

class VTKSetVolumesExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 4,
      numRows: 3,
      viewports: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          cellStyle: {
            gridRow: '1 / span 3',
            gridColumn: '4',
          },
        },
      ],
    },
    ptCtLeftClickTool: 'Levels',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    ptCtLayoutTools = ['Levels'].concat(PET_CT_ANNOTATION_TOOLS)

    this._canvasNodes = new Map()
    this._viewportGridRef = React.createRef()

    const { limitFrames } = config

    const callback = (imageIds) => {
      if (limitFrames !== undefined && typeof limitFrames === 'number') {
        const NewImageIds = sortImageIdsByIPP(imageIds)
        return limitImageIds(NewImageIds, limitFrames)
      }

      return imageIds
    }

    this.petVolumeImageIds1 = getImageIds('pet1', VOLUME, callback)
    this.ctVolumeImageIds1 = getImageIds('ct1', VOLUME, callback)

    this.petVolumeImageIds2 = getImageIds('pet2', VOLUME, callback)
    this.ctVolumeImageIds2 = getImageIds('ct2', VOLUME, callback)

    Promise.all([this.petVolumeImageIds1, this.ctVolumeImageIds1]).then(() =>
      this.setState({ progressText: 'Loading data...' })
    )

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
    this.axialSync = createCameraPositionSynchronizer('axialSync')
    this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    this.ctWLSync = createVOISynchronizer('ctWLSync')
    this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')
    ;({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ctVRSceneToolGroup,
      ctObliqueToolGroup,
      ptTypesSceneToolGroup,
    } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ptVolumeUID = ptVolumeUID

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    window.renderingEngine = renderingEngine

    ptCtFusion.setLayout(
      renderingEngine,
      this._canvasNodes,
      {
        ctSceneToolGroup,
        ptSceneToolGroup,
        fusionSceneToolGroup,
        ptMipSceneToolGroup,
      },
      {
        axialSynchronizers: [this.axialSync],
        sagittalSynchronizers: [this.sagittalSync],
        coronalSynchronizers: [this.coronalSync],
        ptThresholdSynchronizer: this.ptThresholdSync,
        ctWLSynchronizer: this.ctWLSync,
      }
    )

    // Create volumes
    const ptVolumeImageIds1 = await this.petVolumeImageIds1
    const ctVolumeImageIds1 = await this.ctVolumeImageIds1

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
      imageIds: ptVolumeImageIds1,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds1,
    })

    // Initialise all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ptVolume.load(onLoad)
    ctVolume.load(onLoad)

    ptCtFusion.setVolumes(
      renderingEngine,
      ctVolumeUID,
      ptVolumeUID,
      colormaps[this.state.petColorMapIndex]
    )

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

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    // Destroy synchronizers
    resetToolsState()
    SynchronizerManager.destroy()
    cache.purgeCache()
    ToolGroupManager.destroy()

    this.renderingEngine.destroy()
  }

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  swapVolume = async () => {
    this.setState(() => {
      return { progressText: 'Swapping data' }
    })

    const ptVolumeImageIds2 = await this.petVolumeImageIds2
    const ctVolumeImageIds2 = await this.ctVolumeImageIds2

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID2, {
      imageIds: ptVolumeImageIds2,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID2, {
      imageIds: ctVolumeImageIds2,
    })

    // Initialise all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const ctOnLoad = () => this.setState({ progressText: 'New CT Loaded.' })
    const ptOnLoad = () => this.setState({ progressText: 'New PET Loaded.' })

    ptVolume.load(ptOnLoad)
    ctVolume.load(ctOnLoad)

    ptCtFusion.setVolumes(
      this.renderingEngine,
      ctVolumeUID2,
      ptVolumeUID2,
      colormaps[this.state.petColorMapIndex]
    )

    // This will initialise volumes in GPU memory
    this.renderingEngine.render()
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>MPR Template Example ({this.state.progressText})</h2>
          </div>
          <button
            onClick={() => this.swapVolume()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Swap volumes of the study
          </button>
        </div>
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

export default VTKSetVolumesExample
