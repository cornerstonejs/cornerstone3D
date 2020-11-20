import macro from 'vtk.js/Sources/macro';
import vtkGenericWidgetRepresentation from 'vtk.js/Sources/Rendering/SceneGraph/GenericWidgetRepresentation';
import vtkOpenGLActor from 'vtk.js/Sources/Rendering/OpenGL/Actor';
import vtkOpenGLActor2D from 'vtk.js/Sources/Rendering/OpenGL/Actor2D';
import vtkOpenGLCamera from 'vtk.js/Sources/Rendering/OpenGL/Camera';
import vtkOpenGLGlyph3DMapper from 'vtk.js/Sources/Rendering/OpenGL/Glyph3DMapper';
import vtkOpenGLImageMapper from 'vtk.js/Sources/Rendering/OpenGL/ImageMapper';
import vtkOpenGLImageSlice from 'vtk.js/Sources/Rendering/OpenGL/ImageSlice';
import vtkOpenGLPixelSpaceCallbackMapper from 'vtk.js/Sources/Rendering/OpenGL/PixelSpaceCallbackMapper';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';
import vtkOpenGLRenderer from 'vtk.js/Sources/Rendering/OpenGL/Renderer';
import vtkOpenGLSkybox from 'vtk.js/Sources/Rendering/OpenGL/Skybox';
import vtkOpenGLSphereMapper from 'vtk.js/Sources/Rendering/OpenGL/SphereMapper';
import vtkOpenGLStickMapper from 'vtk.js/Sources/Rendering/OpenGL/StickMapper';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import vtkOpenGLVolume from 'vtk.js/Sources/Rendering/OpenGL/Volume';
import vtkOpenGLVolumeMapper from 'vtk.js/Sources/Rendering/OpenGL/VolumeMapper';
import vtkViewNodeFactory from 'vtk.js/Sources/Rendering/SceneGraph/ViewNodeFactory';
import vtkStreamingOpenGLVolumeMapper from './vtkStreamingOpenGLVolumeMapper';

/**
 * vtkStreamingOpenGLViewNodeFactory - A fork of the vtkOpenGLViewNodeFactory,
 * so that we can inject our custom derived "Streaming" classes.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLViewNodeFactory(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkStreamingOpenGLViewNodeFactory');

  // Override
  publicAPI.createNode = dataObject => {
    if (dataObject.isDeleted()) {
      return null;
    }

    let cpt = 0;
    let className = dataObject.getClassName(cpt++);
    let isObject = false;
    const keys = Object.keys(model.overrides);
    while (className && !isObject) {
      if (keys.indexOf(className) !== -1) {
        isObject = true;
      } else {
        className = dataObject.getClassName(cpt++);
      }
    }

    if (!isObject) {
      return null;
    }

    const initialValues = model.getModelInitialValues(dataObject);

    const vn = model.overrides[className](initialValues);
    vn.setMyFactory(publicAPI);
    return vn;
  };

  model.getModelInitialValues = dataObject => {
    const initialValues = {};

    const className = dataObject.getClassName();

    if (className === 'vtkSharedVolumeMapper') {
      initialValues.scalarTexture = dataObject.getScalarTexture();
    }

    return initialValues;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkViewNodeFactory.extend(publicAPI, model, initialValues);

  // Object methods
  vtkStreamingOpenGLViewNodeFactory(publicAPI, model);

  // Initialization
  publicAPI.registerOverride('vtkActor', vtkOpenGLActor.newInstance);
  publicAPI.registerOverride('vtkActor2D', vtkOpenGLActor2D.newInstance);
  publicAPI.registerOverride('vtkCamera', vtkOpenGLCamera.newInstance);
  publicAPI.registerOverride(
    'vtkGlyph3DMapper',
    vtkOpenGLGlyph3DMapper.newInstance
  );
  publicAPI.registerOverride(
    'vtkImageMapper',
    vtkOpenGLImageMapper.newInstance
  );
  publicAPI.registerOverride('vtkImageSlice', vtkOpenGLImageSlice.newInstance);
  publicAPI.registerOverride('vtkMapper', vtkOpenGLPolyDataMapper.newInstance);
  publicAPI.registerOverride(
    'vtkPixelSpaceCallbackMapper',
    vtkOpenGLPixelSpaceCallbackMapper.newInstance
  );
  publicAPI.registerOverride('vtkRenderer', vtkOpenGLRenderer.newInstance);
  publicAPI.registerOverride('vtkSkybox', vtkOpenGLSkybox.newInstance);
  publicAPI.registerOverride(
    'vtkSphereMapper',
    vtkOpenGLSphereMapper.newInstance
  );
  publicAPI.registerOverride(
    'vtkStickMapper',
    vtkOpenGLStickMapper.newInstance
  );
  publicAPI.registerOverride('vtkTexture', vtkOpenGLTexture.newInstance);
  publicAPI.registerOverride('vtkVolume', vtkOpenGLVolume.newInstance);
  publicAPI.registerOverride(
    'vtkVolumeMapper',
    vtkOpenGLVolumeMapper.newInstance
  );
  publicAPI.registerOverride(
    'vtkSharedVolumeMapper',
    vtkStreamingOpenGLVolumeMapper.newInstance
  );
  publicAPI.registerOverride(
    'vtkWidgetRepresentation',
    vtkGenericWidgetRepresentation.newInstance
  );
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLViewNodeFactory'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
