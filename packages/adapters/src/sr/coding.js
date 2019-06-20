class Code {
    constructor(options) {
        this[_value] = options.value;
        this[_meaning] = options.meaning;
        this[_schemeDesignator] = options.schemeDesignator;
        this[_schemeVersion] = options.schemeVersion || null;
    }

    get value() {
        return this[_value];
    }

    get meaning() {
        return this[_meaning];
    }

    get schemeDesignator() {
        return this[_schemeDesignator];
    }

    get schemeVersion() {
        return this[_schemeVersion];
    }
}

class CodedConcept {
    constructor(options) {
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for CodedConcept.");
        }
        if (options.meaning === undefined) {
            throw new Error("Option 'meaning' is required for CodedConcept.");
        }
        if (options.schemeDesignator === undefined) {
            throw new Error(
                "Option 'schemeDesignator' is required for CodedConcept."
            );
        }
        this.CodeValue = options.value;
        this.CodeMeaning = options.meaning;
        this.CodingSchemeDesignator = options.schemeDesignator;
        if ("schemeVersion" in options) {
            this.CodingSchemeVersion = options.schemeVersion;
        }
    }

    equals(other) {
        if (
            other.value === this.value &&
            other.schemeDesignator === this.schemeDesignator
        ) {
            if (other.schemeVersion && this.schemeVersion) {
                return other.schemeVersion === this.schemeVersion;
            }
            return true;
        }
        return false;
    }

    get value() {
        return this.CodeValue;
    }

    get meaning() {
        return this.CodeMeaning;
    }

    get schemeDesignator() {
        return this.CodingSchemeDesignator;
    }

    get schemeVersion() {
        return this.CodingSchemeVersion;
    }
}

export { Code, CodedConcept };
