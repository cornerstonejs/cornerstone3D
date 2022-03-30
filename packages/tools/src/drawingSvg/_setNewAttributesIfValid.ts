export function _setNewAttributesIfValid(attributes, svgNode) {
  Object.keys(attributes).forEach((key) => {
    const newValue = attributes[key];
    if (newValue !== undefined && newValue !== '') {
      svgNode.setAttribute(key, newValue);
    }
  });
}

export default _setNewAttributesIfValid;
