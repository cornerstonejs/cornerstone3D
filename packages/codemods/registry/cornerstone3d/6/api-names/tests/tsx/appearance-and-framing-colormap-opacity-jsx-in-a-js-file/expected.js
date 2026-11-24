import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export function FusionOpacity({ ptId, value }) {
  const viewport = renderingEngine.getViewport('fusion');

  const onChange = () => {
    viewport.setDisplaySetAppearance(ptId, {
      colormap: { name: 'hsv' },
      opacity: 0.5,
    });
    viewport.setDisplaySetAppearance(ptId, {
      colormap: { opacityMapping: [{ value: 0, opacity: 0 }, { value: 5, opacity: 1 }] },
    });
  };

  return <input type="range" value={value} onChange={onChange} />;
}
