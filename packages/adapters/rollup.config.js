import babel from "rollup-plugin-babel";
import resolve from "rollup-plugin-node-resolve";
import globals from "rollup-plugin-node-globals";
import builtins from "rollup-plugin-node-builtins";
import commonjs from "rollup-plugin-commonjs";
import json from "rollup-plugin-json";
import pkg from "./package.json";

export default {
  input: pkg.src || 'src/index.js',
  output: [
    {
      file: `build/${pkg.name}.js`,
      format: "umd",
      name: pkg.name,
      sourcemap: true
    },
    {
      file: `build/${pkg.name}.es.js`,
      format: "es",
      sourcemap: true
    }
  ],
  plugins: [
    resolve({
      browser: true
    }),
    commonjs(),
    globals(),
    builtins(),
    babel({
      runtimeHelpers: true,
      exclude: "node_modules/**"
    }),
    json()
  ]
};
