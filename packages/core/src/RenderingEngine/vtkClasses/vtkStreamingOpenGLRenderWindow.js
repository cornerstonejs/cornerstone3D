import macro from '@kitware/vtk.js/macros';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkStreamingOpenGLViewNodeFactory, {
  registerOverride,
} from './vtkStreamingOpenGLViewNodeFactory';
import {
  CONTEXT_OVERHEAD_BYTES,
  removeGpuMemoryEntry,
  setGpuMemoryEntry,
} from '../../utilities/gpuMemoryLedger';
import { runPendingEdgeSearch } from '../../utilities/gpuSettingsPresets';
import {
  isWebGLBlocked,
  noteContextCreationRefused,
} from '../../utilities/webglAvailability';

/**
 * vtkStreamingOpenGLRenderWindow - A derived class of the core vtkOpenGLRenderWindow class.
 * The main purpose for this class extension is to add in our own node factory, so we can use
 * our extended "streaming" classes for progressive texture loading.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLRenderWindow');

  const superInitialize = publicAPI.initialize;

  /**
   * vtk.js creates the WebGL context at the first render, not with the
   * window. The fixed cost of the context counts in the GPU memory ledger
   * from then on, so a pool of contexts that never render books nothing.
   */
  publicAPI.initialize = () => {
    superInitialize();

    if (model.context && !model.rootOpenGLRenderWindow) {
      setGpuMemoryEntry(publicAPI, {
        kind: 'context',
        bytes: CONTEXT_OVERHEAD_BYTES,
      });
    }
  };

  const superGet3DContext = publicAPI.get3DContext;

  /**
   * vtk.js wraps the context in a Proxy, which throws when the browser
   * refuses the context, for example while Chromium blocks WebGL for the site.
   * This returns `null` then, and creates no context at all while WebGL waits
   * (see `isWebGLBlocked`), since a new context could extend the block.
   */
  publicAPI.get3DContext = (options) => {
    if (!model.context && isWebGLBlocked()) {
      return null;
    }

    let statusMessage = '';
    const onCreationError = (event) => {
      statusMessage = event.statusMessage ?? '';
    };

    model.canvas?.addEventListener?.(
      'webglcontextcreationerror',
      onCreationError
    );

    try {
      return options === undefined
        ? superGet3DContext()
        : superGet3DContext(options);
    } catch {
      /** A render window exists only after a detection that found WebGL. */
      noteContextCreationRefused(statusMessage, true);

      return null;
    } finally {
      model.canvas?.removeEventListener?.(
        'webglcontextcreationerror',
        onCreationError
      );
    }
  };

  /** True while this window waits for a WebGL context. */
  publicAPI.isWaitingForWebGL = () => Boolean(model.waitingForWebGL);

  /**
   * True when this window can render: it has its context, or it draws into
   * the context of a parent window. Without either, it asks for its context,
   * and it waits when it gets none.
   */
  function ensureContext() {
    if (model.context || model.initialized) {
      return true;
    }

    if (publicAPI.getLastAncestorOfType('vtkOpenGLRenderWindow')) {
      return true;
    }

    const context = publicAPI.get3DContext();

    model.waitingForWebGL = !context;

    if (context) {
      model.context = context;
    }

    return Boolean(context);
  }

  const superTraverseAllPasses = publicAPI.traverseAllPasses;

  /**
   * A window with no context skips the render, so vtk.js never draws with a
   * missing context, and the next render asks again. A pending edge search
   * of `auto` runs in this context, not in a new one.
   */
  publicAPI.traverseAllPasses = () => {
    if (!ensureContext()) {
      return;
    }

    if (model.initialized && model.context && !model.rootOpenGLRenderWindow) {
      runPendingEdgeSearch(model.context);
    }

    superTraverseAllPasses();
  };

  const superDelete = publicAPI.delete;

  publicAPI.delete = () => {
    removeGpuMemoryEntry(publicAPI);
    superDelete();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, initialValues);

  vtkOpenGLRenderWindow.extend(publicAPI, model, initialValues);

  model.myFactory = vtkStreamingOpenGLViewNodeFactory.newInstance();

  registerOverride('vtkRenderWindow', newInstance);

  // Object methods
  vtkStreamingOpenGLRenderWindow(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLRenderWindow'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
