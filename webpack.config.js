const path = require('path');
const slsw = require('serverless-webpack');

const entries = {};

Object.keys(slsw.lib.entries).forEach(key => {
    entries[key] = [path.join(__dirname, 'source-map-install.js'), slsw.lib.entries[key]]
});

module.exports = {
  mode: (process.env.NODE_ENV !== 'production') ? 'development' : 'production',
  entry: slsw.lib.webpack.isLocal ? entries : slsw.lib.entries,
  // devtool: (process.env.NODE_ENV !== 'production') ? 'source-map' : '',
  devtool: '',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    alias: {
      'hiredis': path.join(__dirname, 'aliases/hiredis.js')
    }
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  target: 'node',
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: 'ts-loader', options: { transpileOnly: true } },
    ],
  },
};
