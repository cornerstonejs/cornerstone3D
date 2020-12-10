import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

function ViewportGrid({ numRows, numCols, style, renderingEngine, children }) {
  const rowSize = 100 / numRows;
  const colSize = 100 / numCols;

  useEffect(() => {
    // Update the document title using the browser API

    if (renderingEngine) {
      const t0 = performance.now();
      renderingEngine.resize();
      const t1 = performance.now();
    }
  });

  return (
    <div
      onContextMenu={e => e.preventDefault()}
      data-cy="viewport-grid"
      style={{
        display: 'grid',
        gridTemplateRows: `repeat(${numRows}, ${rowSize}%)`,
        gridTemplateColumns: `repeat(${numCols}, ${colSize}%)`,
        height: '100%',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

ViewportGrid.propTypes = {
  /** Number of columns */
  numRows: PropTypes.number.isRequired,
  /** Number of rows */
  numCols: PropTypes.number.isRequired,
  /** Styles to merge to outer container */
  styles: PropTypes.object,
  /** Array of React Components to render within grid */
  children: PropTypes.arrayOf(PropTypes.node).isRequired,
};

export default ViewportGrid;
