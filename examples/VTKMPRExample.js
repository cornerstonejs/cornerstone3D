import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';

import './VTKMPRExample.css';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

const SCENE_IDS = {
  CT: 'ctScene',
  PT: 'ptScene',
  FUSION: 'fusionScene',
  PTMIP: 'ptMipScene',
};

const VIEWPORT_IDS = {
  CT: {
    AXIAL: 'ctAxial',
    SAGITTAL: 'ctSagittal',
    CORONAL: 'ctCoronal',
  },
  PT: {
    AXIAL: 'ptAxial',
    SAGITTAL: 'ptSagittal',
    CORONAL: 'ptCoronal',
  },
  FUSION: {
    AXIAL: 'fusionAxial',
    SAGITTAL: 'fusionSagittal',
    CORONAL: 'fusionCoronal',
  },
  PTMIP: {
    CORONAL: 'ptMipCoronal',
  },
};

class VTKMPRExample extends Component {
  state = {
    progressText: 'fetching metadata...',
  };

  constructor(props) {
    super(props);

    this.containers = {
      CT: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      PT: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      FUSION: {
        AXIAL: React.createRef(),
        SAGITTAL: React.createRef(),
        CORONAL: React.createRef(),
      },
      PTMIP: {
        CORONAL: React.createRef(),
      },
    };

    this.testRender = this.testRender.bind(this);
  }

  componentWillUnmount() {
    imageCache.decacheVolume(this.ctVolumeUID);
    imageCache.decacheVolume(this.ptVolumeUID);

    this.renderingEngine.destroy();
  }

  async componentDidMount() {
    const renderingEngineUID = 'PETCTRenderingEngine';
    const ptVolumeUID = 'PET_VOLUME';
    const ctVolumeUID = 'CT_VOLUME';

    this.ctVolumeUID = ctVolumeUID;
    this.ptVolumeUID = ptVolumeUID;

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

    renderingEngine.setViewports([
      // CT
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.CT.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },

      // PT

      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PT.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 1],
        },
      },

      // Fusion

      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.AXIAL.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.SAGITTAL.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: SCENE_IDS.FUSION,
        viewportUID: VIEWPORT_IDS.FUSION.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.FUSION.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },

      // PET MIP
      {
        sceneUID: SCENE_IDS.PTMIP,
        viewportUID: VIEWPORT_IDS.PTMIP.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.containers.PTMIP.CORONAL.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 1],
        },
      },
    ]);

    const imageIdsPromise = getImageIdsAndCacheMetadata();

    imageIdsPromise.then(imageIds => {
      this.setState({ progressText: 'Loading data...' });

      const { ptImageIds, ctImageIds } = imageIds;

      const ptVolume = imageCache.makeAndCacheImageVolume(
        ptImageIds,
        ptVolumeUID
      );
      const ctVolume = imageCache.makeAndCacheImageVolume(
        ctImageIds,
        ctVolumeUID
      );

      function setCTWWWC({ volumeActor, volumeUID }) {
        const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0];

        const lower = windowCenter - windowWidth / 2.0;
        const upper = windowCenter + windowWidth / 2.0;

        volumeActor
          .getProperty()
          .getRGBTransferFunction(0)
          .setRange(lower, upper);
      }

      function setPetTransferFunction({ volumeActor, volumeUID }) {
        const rgbTransferFunction = volumeActor
          .getProperty()
          .getRGBTransferFunction(0);

        rgbTransferFunction.setRange(0, 5);

        const size = rgbTransferFunction.getSize();

        for (let index = 0; index < size; index++) {
          const nodeValue1 = [];

          rgbTransferFunction.getNodeValue(index, nodeValue1);

          nodeValue1[1] = 1 - nodeValue1[1];
          nodeValue1[2] = 1 - nodeValue1[2];
          nodeValue1[3] = 1 - nodeValue1[3];

          rgbTransferFunction.setNodeValue(index, nodeValue1);
        }
      }

      function setPetColorMapTransferFunction({ volumeActor }) {
        const mapper = volumeActor.getMapper();
        mapper.setSampleDistance(1.0);

        const cfun = vtkColorTransferFunction.newInstance();
        const preset = vtkColorMaps.getPresetByName('hsv');
        cfun.applyColorMap(preset);
        cfun.setMappingRange(0, 5);

        volumeActor.getProperty().setRGBTransferFunction(0, cfun);

        // Create scalar opacity function
        const ofun = vtkPiecewiseFunction.newInstance();
        ofun.addPoint(0, 0.0);
        ofun.addPoint(0.1, 0.9);
        ofun.addPoint(5, 1.0);

        volumeActor.getProperty().setScalarOpacity(0, ofun);
      }

      // Initialise all CT values to -1024 so we don't get a grey box?

      const { scalarData } = ctVolume;
      const ctLength = scalarData.length;

      for (let i = 0; i < ctLength; i++) {
        scalarData[i] = -1024;
      }

      const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
      const ptScene = renderingEngine.getScene(SCENE_IDS.PT);
      const fusionScene = renderingEngine.getScene(SCENE_IDS.FUSION);
      const ptMipScene = renderingEngine.getScene(SCENE_IDS.PTMIP);

      ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);
      ptScene.setVolumes([
        { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
      ]);

      fusionScene.setVolumes([
        { volumeUID: ctVolumeUID, callback: setCTWWWC },
        { volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction },
      ]);

      ptMipScene.setVolumes([
        { volumeUID: ptVolumeUID, callback: setPetTransferFunction },
      ]);

      let ptLoaded = false;
      let ctLoaded = false;

      const numberOfFrames = ptImageIds.length;

      const reRenderFraction = numberOfFrames / 20;
      let reRenderTarget = reRenderFraction;

      imageCache.loadVolume(ptVolumeUID, event => {
        ptVolume.volumeMapper.setUpdatedFrame(event.imageIdIndex);

        if (
          event.framesProcessed > reRenderTarget ||
          event.framesProcessed == numberOfFrames
        ) {
          ptVolume.vtkImageData.modified();
          reRenderTarget += reRenderFraction;

          if (!renderingEngine.hasBeenDestroyed) {
            ptScene.render();
            ptMipScene.render();
            fusionScene.render();
          }

          if (event.framesProcessed === event.numFrames) {
            ptLoaded = true;

            if (ctLoaded && ptLoaded) {
              this.setState({ progressText: 'Loaded.' });
            }
          }
        }
      });

      const numberOfCtFrames = ctImageIds.length;

      const reRenderFractionCt = numberOfCtFrames / 20;
      let reRenderTargetCt = reRenderFractionCt;

      imageCache.loadVolume(ctVolumeUID, event => {
        // Only call on modified every 5%.

        if (
          event.framesProcessed > reRenderTargetCt ||
          event.framesProcessed === event.numFrames
        ) {
          ctVolume.vtkImageData.modified();

          console.log(`ctVolumeModified`);

          reRenderTargetCt += reRenderFractionCt;
          if (!renderingEngine.hasBeenDestroyed) {
            renderingEngine.render();
          }

          if (event.framesProcessed === event.numFrames) {
            ctLoaded = true;

            if (ctLoaded && ptLoaded) {
              this.setState({ progressText: 'Loaded.' });
            }
          }
        }
      });
    });

    renderingEngine.render();
  }

  testRender() {
    if (this.performingRenderTest) {
      return;
    }

    this.performingRenderTest = true;
    const renderingEngine = this.renderingEngine;

    const count = 100;

    let t0 = performance.now();
    for (let i = 0; i < count; i++) {
      renderingEngine.render();
    }

    let t1 = performance.now();

    this.performingRenderTest = false;

    alert(`${(t1 - t0) / count}`);
  }

  render() {
    const activeStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'aqua',
    };

    const inactiveStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const ptMIPStyle = {
      width: '384px',
      height: '768px',
      borderStyle: 'solid',
      borderColor: 'blue',
    };

    const threeByThree = (
      <div>
        <div className="container-row">
          <canvas ref={this.containers.CT.AXIAL} style={activeStyle} />
          <canvas ref={this.containers.CT.SAGITTAL} style={inactiveStyle} />
          <canvas ref={this.containers.CT.CORONAL} style={inactiveStyle} />
        </div>
        <div className="container-row">
          <canvas ref={this.containers.PT.AXIAL} style={inactiveStyle} />
          <canvas ref={this.containers.PT.SAGITTAL} style={inactiveStyle} />
          <canvas ref={this.containers.PT.CORONAL} style={inactiveStyle} />
        </div>
        <div className="container-row">
          <canvas ref={this.containers.FUSION.AXIAL} style={inactiveStyle} />
          <canvas ref={this.containers.FUSION.SAGITTAL} style={inactiveStyle} />
          <canvas ref={this.containers.FUSION.CORONAL} style={inactiveStyle} />
        </div>
      </div>
    );

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h5>MPR Template Example: {this.state.progressText} </h5>
            <button onClick={this.testRender}>Render</button>
          </div>
        </div>
        <div className="viewport-container">
          {threeByThree}
          <div>
            <canvas ref={this.containers.PTMIP.CORONAL} style={ptMIPStyle} />
          </div>
        </div>
      </div>
    );
  }
}

export default VTKMPRExample;
