const toArray = function (x) {
    return Array.isArray(x) ? x : [x];
};

const codeMeaningEquals = codeMeaningName => {
    return contentItem => {
        return (
            contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName
        );
    };
};

const graphicTypeEquals = graphicType => {
    return contentItem => {
        return contentItem && contentItem.GraphicType === graphicType;
    };
};

export { toArray, codeMeaningEquals, graphicTypeEquals };
