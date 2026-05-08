/**
 * Constants for panel rendering
 */
const PANEL_CONFIG = {
  WIDTH: 160,
  HEIGHT: 96,
  TEXT_PADDING: 3,
  TEXT_Y_OFFSET: 2,
  GRAPH_Y_OFFSET: 15,
  GRAPH_WIDTH: 150,
  GRAPH_HEIGHT: 70,
  FONT_SIZE: 9,
  FONT_FAMILY: 'Helvetica,Arial,sans-serif',
  GRAPH_ALPHA: 0.9,
} as const;

/**
 * Constants for stats overlay
 */
const STATS_CONFIG = {
  UPDATE_INTERVAL: 1000, // ms
  MAX_MS_VALUE: 200,
  MAX_FPS_VALUE: 300, // don't use 60 since no one has a 60hz monitor anynmore
  OVERLAY_STYLES: {
    position: 'fixed',
    top: '0px',
    right: '0px',
    left: 'auto',
    zIndex: '9999',
    cursor: 'pointer',
    opacity: '0.9',
  },
} as const;

/**
 * Conversion constants
 */
const CONVERSION = {
  BYTES_TO_MB: 1048576,
  MS_PER_SECOND: 1000,
} as const;

/**
 * Panel configurations with colors
 */
const PANEL_CONFIGS = [
  { name: 'FPS', foregroundColor: '#0ff', backgroundColor: '#002' },
  { name: 'MS', foregroundColor: '#0f0', backgroundColor: '#020' },
  { name: 'MB', foregroundColor: '#f08', backgroundColor: '#201' },
] as const;

export { PANEL_CONFIG, STATS_CONFIG, CONVERSION, PANEL_CONFIGS };
