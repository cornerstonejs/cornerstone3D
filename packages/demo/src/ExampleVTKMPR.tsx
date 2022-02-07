import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  EVENTS as RENDERING_EVENTS,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import {
  SynchronizerManager,
  synchronizers,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps'

import getImageIds from './helpers/getImageIds'
import ptCtToggleAnnotationTool from './helpers/ptCtToggleAnnotationTool'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
  ANNOTATION_TOOLS,
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

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

class MPRExample extends Component {
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

    ptCtLayoutTools = ['Levels'].concat(ANNOTATION_TOOLS)

    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    this.swapPetTransferFunction = this.swapPetTransferFunction.bind(this)

    const { limitFrames } = config

    const callback = (imageIds) => {
      if (limitFrames !== undefined && typeof limitFrames === 'number') {
        const NewImageIds = sortImageIdsByIPP(imageIds)
        return limitImageIds(NewImageIds, limitFrames)
      }
      return imageIds
    }

    this.petVolumeImageIds = getImageIds('pt1', VOLUME, callback)
    this.ctVolumeImageIds = getImageIds('ct1', VOLUME, callback)

    Promise.all([this.petVolumeImageIds, this.ctVolumeImageIds]).then(() =>
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
    await csRenderInit()
    csTools3d.init()
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
    } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ptVolumeUID = ptVolumeUID

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    window.renderingEngine = renderingEngine

    ptCtFusion.setLayout(
      renderingEngine,
      this._elementNodes,
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

    addToolsToToolGroups({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ptTypesSceneToolGroup,
    })

    // Create volumes
    const ptImageIds = await this.petVolumeImageIds
    const ctVolumeImageIds = await this.ctVolumeImageIds

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
      imageIds: ptImageIds,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
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

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this
    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    const layout = LAYOUTS[layoutIndex]

    if (prevState.layoutIndex !== layoutIndex) {
      if (layout === 'FusionMIP') {
        // FusionMIP

        ptCtFusion.setLayout(
          renderingEngine,
          this._elementNodes,
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

        ptCtFusion.setVolumes(
          renderingEngine,
          ctVolumeUID,
          ptVolumeUID,
          colormaps[this.state.petColorMapIndex]
        )
      } else if (layout === 'ObliqueCT') {
        obliqueCT.setLayout(renderingEngine, this._elementNodes, {
          ctObliqueToolGroup,
        })
        obliqueCT.setVolumes(renderingEngine, ctVolumeUID)
      } else if (layout === 'CTVR') {
        // CTVR
        fourUpCT.setLayout(renderingEngine, this._elementNodes, {
          ctSceneToolGroup,
          ctVRSceneToolGroup,
        })
        fourUpCT.setVolumes(renderingEngine, ctVolumeUID)
      } else if (layout === 'PetTypes') {
        // petTypes
        petTypes.setLayout(renderingEngine, this._elementNodes, {
          ptTypesSceneToolGroup,
        })
        petTypes.setVolumes(renderingEngine, ptVolumeUID)
      } else {
        throw new Error('Unrecognised layout index')
      }
    }
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  swapLayout = (layoutId) => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }

    const viewportGrid = JSON.parse(JSON.stringify(this.state.viewportGrid))
    const layoutIndex = LAYOUTS.findIndex((id) => id === layoutId)

    viewportGrid.viewports = []

    const layout = LAYOUTS[layoutIndex]

    if (layout === 'FusionMIP') {
      viewportGrid.numCols = 4
      viewportGrid.numRows = 3
      ;[0, 1, 2, 3, 4, 5, 6, 7, 8].forEach((x) =>
        viewportGrid.viewports.push({})
      )
      viewportGrid.viewports.push({
        cellStyle: {
          gridRow: '1 / span 3',
          gridColumn: '4',
        },
      })
    } else if (layout === 'ObliqueCT') {
      viewportGrid.numCols = 1
      viewportGrid.numRows = 1
      viewportGrid.viewports.push({})
    } else if (layout === 'CTVR') {
      viewportGrid.numCols = 2
      viewportGrid.numRows = 2
      ;[0, 1, 2, 3].forEach((x) => viewportGrid.viewports.push({}))
    } else if (layout === 'PetTypes') {
      viewportGrid.numRows = 1
      viewportGrid.numCols = 3
      ;[0, 1, 2].forEach((x) => viewportGrid.viewports.push({}))
    }

    this.setState({
      layoutIndex,
      viewportGrid,
    })
  }

  swapPetTransferFunction() {
    const renderingEngine = this.renderingEngine
    const petCTScene = renderingEngine.getScene(SCENE_IDS.FUSION)

    if (!petCTScene) {
      // We have likely changed view and the scene no longer exists.
      return
    }

    const volumeActor = petCTScene.getVolumeActor(ptVolumeUID)

    let petColorMapIndex = this.state.petColorMapIndex

    petColorMapIndex = petColorMapIndex === 0 ? 1 : 0

    const mapper = volumeActor.getMapper()
    mapper.setSampleDistance(1.0)

    const range = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange()

    const cfun = vtkColorTransferFunction.newInstance()
    const preset = vtkColorMaps.getPresetByName(colormaps[petColorMapIndex])
    cfun.applyColorMap(preset)
    cfun.setMappingRange(range[0], range[1])

    volumeActor.getProperty().setRGBTransferFunction(0, cfun)

    // Create scalar opacity function
    const ofun = vtkPiecewiseFunction.newInstance()
    ofun.addPoint(0, 0.0)
    ofun.addPoint(0.1, 0.9)
    ofun.addPoint(5, 1.0)

    volumeActor.getProperty().setScalarOpacity(0, ofun)

    petCTScene.render()

    this.setState({ petColorMapIndex })
  }

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  swapPtCtTool = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false

    ptCtToggleAnnotationTool(
      isAnnotationToolOn,
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      toolName
    )

    this.setState({ ptCtLeftClickTool: toolName })
  }

  render() {
    const {
      layoutIndex,
      metadataLoaded,
      destroyed,
      ctWindowLevelDisplay,
      ptThresholdDisplay,
    } = this.state

    const layoutID = LAYOUTS[layoutIndex]
    const layoutButtons = [
      { id: 'ObliqueCT', text: 'Oblique Layout' },
      { id: 'FusionMIP', text: 'Fusion Layout' },
      { id: 'PetTypes', text: 'SUV Types Layout' },
    ]

    // TODO -> Move layout switching to a different example to reduce bloat.
    // TODO -> Move destroy to a seperate example

    const filteredLayoutButtons = layoutButtons.filter((l) => l.id !== layoutID)

    const SUVTypesList =
      layoutID === 'PetTypes' ? (
        <div style={{ display: 'flex', textAlign: 'center' }}>
          <div style={{ flex: '1 1 0px' }}>Body Weight (BW)</div>
          <div style={{ flex: '1 1 0px' }}>Lean Body Mass (LBM)</div>
          <div style={{ flex: '1 1 0px' }}>Body Surface Area (BSA)</div>
        </div>
      ) : null

    const fusionButtons =
      layoutID === 'FusionMIP' ? (
        <React.Fragment>
          <button
            onClick={() =>
              metadataLoaded && !destroyed && this.swapPetTransferFunction()
            }
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            SwapPetTransferFunction
          </button>
          <select
            value={this.state.ptCtLeftClickTool}
            onChange={this.swapPtCtTool}
          >
            {ptCtLayoutTools.map((toolName) => (
              <option key={toolName} value={toolName}>
                {toolName}
              </option>
            ))}
          </select>
        </React.Fragment>
      ) : null

    const fusionWLDisplay =
      layoutID === 'FusionMIP' ? (
        <React.Fragment>
          <div className="col-xs-12">
            <p>{`CT: W: ${ctWindowLevelDisplay.ww} L: ${ctWindowLevelDisplay.wc}`}</p>
          </div>
          <div className="col-xs-12">
            <p>{`PT: Upper Threshold: ${ptThresholdDisplay.toFixed(2)}`}</p>
          </div>
        </React.Fragment>
      ) : null

    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>MPR Example ({this.state.progressText})</h2>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* LAYOUT BUTTONS */}
            {/* {filteredLayoutButtons.map((layout) => (
              <button
                key={layout.id}
                onClick={() => this.swapLayout(layout.id)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                {layout.text}
              </button>
            ))} */}
            {/* TOGGLES */}
            {fusionButtons}
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        {SUVTypesList}
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '2px solid grey',
                background: 'black',
                ...(vp.cellStyle || {}),
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

export default MPRExample
