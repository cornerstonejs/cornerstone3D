import Stats from 'stats.js';

let statsInstance;
let statsAnimationFrameId;

const loop = () => {
  if (statsInstance) {
    statsInstance.update();
    statsAnimationFrameId = requestAnimationFrame(loop);
  }
};

/**
 * Sets up the stats overlay for debugging purposes.
 * Creates a Stats.js instance and positions it in the top-right corner of the page.
 */
const setupStatsOverlay = () => {
  if (statsInstance) {
    return;
  }

  try {
    statsInstance = new Stats();

    statsInstance.showPanel(0);

    const statsElement = statsInstance.dom;
    statsElement.style.position = 'fixed';
    statsElement.style.top = '0px';
    statsElement.style.right = '0px';
    statsElement.style.left = 'auto';
    statsElement.style.zIndex = '9999';

    document.body.appendChild(statsElement);

    statsAnimationFrameId = requestAnimationFrame(loop);
  } catch (error) {
    console.warn('Failed to setup stats overlay:', error);
  }
};

/**
 * Cleans up the stats overlay by removing it from the DOM.
 * Should be called when the application is closed or when stats are no longer needed.
 */
const cleanStatsOverlay = () => {
  if (statsAnimationFrameId) {
    cancelAnimationFrame(statsAnimationFrameId);
    statsAnimationFrameId = null;
  }

  if (statsInstance && statsInstance.dom && statsInstance.dom.parentNode) {
    statsInstance.dom.parentNode.removeChild(statsInstance.dom);
    statsInstance = null;
  }
};

export { setupStatsOverlay, cleanStatsOverlay };
