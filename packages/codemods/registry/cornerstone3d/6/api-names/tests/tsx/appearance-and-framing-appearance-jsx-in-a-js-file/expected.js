import React from 'react';
import { getEnabledElement, utilities } from '@cornerstonejs/core';

export function InvertButton({ element, displaySetId, presentation }) {
  const { viewport } = getEnabledElement(element);

  const toggle = () => {
    if (!utilities.viewportSupportsDisplaySetAppearance(viewport)) {
      return;
    }

    const look = viewport.getDisplaySetAppearance(displaySetId) ?? {};

    viewport.setDisplaySetAppearance(displaySetId, { invert: !look.invert });
    viewport.render();
  };

  return (
    <button onClick={toggle} title={presentation.title}>
      {presentation.label}
    </button>
  );
}
