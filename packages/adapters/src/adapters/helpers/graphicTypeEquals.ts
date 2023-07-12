const graphicTypeEquals = graphicType => {
    return contentItem => {
        return contentItem && contentItem.GraphicType === graphicType;
    };
};

export { graphicTypeEquals };
