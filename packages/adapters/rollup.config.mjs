import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", { encoding: "utf8" }));

export default [
    // ESM configuration
    {
        external: [
            "dcmjs",
            "gl-matrix",
            "lodash.clonedeep",
            "ndarray",
            "@cornerstonejs/tools"
        ],
        input: pkg.src || "src/index.ts",
        output: [
            {
                dir: "dist/esm",
                format: "es",
                sourcemap: false,
                preserveModules: true,
                preserveModulesRoot: "src"
            }
        ],
        plugins: [
            resolve({
                preferBuiltins: true,
                browser: true
            }),
            typescript({
                rootDir: "src",
                outDir: "dist/esm",
                allowJs: true,
                checkJs: false,
                strict: false,
                declaration: true,
                emitDeclarationOnly: false,
                lib: ["ES2022", "dom"],
                target: "ES2022",
                module: "esnext",
                moduleResolution: "node",
                sourceMap: false,
                exclude: ["node_modules", "dist", "examples/", "old-examples"]
            }),
            babel({
                exclude: "node_modules/**",
                babelHelpers: "bundled",
                extensions: [".js", ".ts"]
            }),
            json()
        ]
    },
    // UMD configuration

    {
        external: [
            "dcmjs",
            "gl-matrix",
            "lodash.clonedeep",
            "ndarray",
            "@cornerstonejs/tools"
        ],
        input: pkg.src || "src/index.ts",
        output: [
            {
                file: "dist/umd/adapters.umd.js",
                format: "umd",
                name: "Adapters",
                sourcemap: true,
                globals: {
                    dcmjs: "dcmjs",
                    "gl-matrix": "glMatrix",
                    "lodash.clonedeep": "_.cloneDeep",
                    ndarray: "ndarray",
                    "@cornerstonejs/tools": "cornerstoneTools"
                }
            }
        ],
        plugins: [
            resolve({
                preferBuiltins: true,
                browser: true
            }),
            typescript({
                sourceMap: false,
                declaration: false,
                outDir: "dist/esm"
            }),
            babel({
                exclude: "node_modules/**",
                babelHelpers: "bundled",
                extensions: [".js", ".ts"]
            }),
            json()
        ]
    }
];
