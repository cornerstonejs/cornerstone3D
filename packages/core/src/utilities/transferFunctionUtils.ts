function getTransferFunctionNodes(transferFunction) {
  const size = transferFunction.getSize();
  const values = [];
  for (let index = 0; index < size; index++) {
    const nodeValue1 = [];

    transferFunction.getNodeValue(index, nodeValue1);

    values.push(nodeValue1);
  }

  return values;
}

function setTransferFunctionNodes(transferFunction, nodes) {
  if (!nodes?.length) {
    return;
  }

  transferFunction.removeAllPoints();

  nodes.forEach((node) => {
    transferFunction.addRGBPoint(...node);
  });
}

export { getTransferFunctionNodes, setTransferFunctionNodes };
