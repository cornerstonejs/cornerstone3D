import macro from '@kitware/vtk.js/macros.js';
// import vtkGenericWidgetRepresentation from '@kitware/vtk.js/Rendering/SceneGraph/GenericWidgetRepresentation'
import vtkOpenGLActor from '@kitware/vtk.js/Rendering/OpenGL/Actor.js';
import vtkOpenGLActor2D from '@kitware/vtk.js/Rendering/OpenGL/Actor2D.js';
import vtkOpenGLCamera from '@kitware/vtk.js/Rendering/OpenGL/Camera.js';
import vtkOpenGLGlyph3DMapper from '@kitware/vtk.js/Rendering/OpenGL/Glyph3DMapper.js';
import vtkOpenGLImageMapper from '@kitware/vtk.js/Rendering/OpenGL/ImageMapper.js';
import vtkOpenGLImageSlice from '@kitware/vtk.js/Rendering/OpenGL/ImageSlice.js';
import vtkOpenGLPixelSpaceCallbackMapper from '@kitware/vtk.js/Rendering/OpenGL/PixelSpaceCallbackMapper.js';
import vtkOpenGLPolyDataMapper from '@kitware/vtk.js/Rendering/OpenGL/PolyDataMapper.js';
import vtkOpenGLRenderer from '@kitware/vtk.js/Rendering/OpenGL/Renderer.js';
import vtkOpenGLSkybox from '@kitware/vtk.js/Rendering/OpenGL/Skybox.js';
import vtkOpenGLSphereMapper from '@kitware/vtk.js/Rendering/OpenGL/SphereMapper.js';
import vtkOpenGLStickMapper from '@kitware/vtk.js/Rendering/OpenGL/StickMapper.js';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture.js';
import vtkOpenGLVolume from '@kitware/vtk.js/Rendering/OpenGL/Volume.js';
import vtkOpenGLVolumeMapper from '@kitware/vtk.js/Rendering/OpenGL/VolumeMapper.js';
import vtkViewNodeFactory from '@kitware/vtk.js/Rendering/SceneGraph/ViewNodeFactory.js';
import vtkStreamingOpenGLVolumeMapper from './vtkStreamingOpenGLVolumeMapper.js';

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

  /**
   * createNode - fork of createNode from vtkOpenGLViewNodeFactory.
   * This fork is required to inject the properties from model.getModelInitialValues.
   *
   * @param {object} dataObject An instance of a vtk.js class.
   */
  publicAPI.createNode = (dataObject) => {
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

  /**
   * getModelInitialValues - This function allows us to pass textures down from our
   * vtkSharedVolumeMapper to new instances of vtkStreamingOpenGLVolumeMapper.
   * The prevents us from sharing memory.
   *
   * TODO: It would be beneficial to push similar, but generalized, functionality
   * back to vtk.js in the future.
   *
   * @param {object} dataObject An instance of a vtk.js class.
   */
  model.getModelInitialValues = (dataObject) => {
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
  // publicAPI.registerOverride(
  //   'vtkWidgetRepresentation',
  //   vtkGenericWidgetRepresentation.newInstance
  // )
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLViewNodeFactory'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
