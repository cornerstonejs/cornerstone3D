
export default {
	entry: 'src/dcmjs.js',
	targets: [
		{
			dest: 'build/dcmjs.js',
			format: 'umd',
			moduleName: 'DCMJS',
	    sourceMap: true
		},
	]
};
