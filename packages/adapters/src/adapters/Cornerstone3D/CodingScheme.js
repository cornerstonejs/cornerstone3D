// This is a custom coding scheme defined to store some annotations from Cornerstone.
// Note: CodeMeaning is VR type LO, which means we only actually support 64 characters
// here this is fine for most labels, but may be problematic at some point.
const CORNERSTONEFREETEXT = "CORNERSTONEFREETEXT";

// Cornerstone specified coding scheme for storing findings
const CodingSchemeDesignator = "CORNERSTONEJS";

const CodingScheme = {
    CodingSchemeDesignator,
    codeValues: {
        CORNERSTONEFREETEXT
    }
};

export default CodingScheme;
