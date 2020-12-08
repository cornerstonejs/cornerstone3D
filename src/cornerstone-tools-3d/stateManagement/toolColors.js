let defaultColor = 'rgb(255, 255, 0)',
  activeColor = 'rgb(0, 255, 0)',
  fillColor = 'transparent';

function setFillColor(color) {
  fillColor = color;
}

function getFillColor() {
  return fillColor;
}

function setToolColor(color) {
  defaultColor = color;
}

function getToolColor() {
  return defaultColor;
}

function setActiveColor(color) {
  activeColor = color;
}

function getActiveColor() {
  return activeColor;
}

function getColorIfActive(data) {
  if (data.color) {
    return data.color;
  }

  return data.active ? activeColor : defaultColor;
}

const toolColors = {
  setFillColor,
  getFillColor,
  setToolColor,
  getToolColor,
  setActiveColor,
  getActiveColor,
  getColorIfActive,
};

export default toolColors;
