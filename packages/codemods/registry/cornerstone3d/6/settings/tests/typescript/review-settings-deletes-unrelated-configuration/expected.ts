import { init } from '@cornerstonejs/core';

declare function recordPreference(): boolean;

const other = { rendering: { useGenericViewport: recordPreference() } };
const prefs = { rendering: { useCPURendering: true, theme: 'dark' } };
const config = { debug: {} };

init(config);
init({ rendering: { useGenericViewport: recordPreference() } });

export { other, prefs };
