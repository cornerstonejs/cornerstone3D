import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", { encoding: "utf8" }));

export default {
    external: ["dcmjs", "gl-matrix", "lodash.clonedeep", "ndarray"],
    input: pkg.src || "src/index.ts",
    output: [
        // {
        //   file: `dist/${pkg.name}.js`,
        //   format: "umd",
        //   name: pkg.name,
        //   sourcemap: true
        // },
        {
            file: `dist/${pkg.name}.es.js`,
            format: "es",
            sourcemap: true
        }
    ],
    plugins: [
        resolve({
            browser: true
        }),
        commonjs(),
        typescript(),
        //    globals(),
        // builtins(),
        babel({
            exclude: "node_modules/**"
        }),
        json()
    ]
};
