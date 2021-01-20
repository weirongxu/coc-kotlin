const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  target: 'node',
  resolve: {
    mainFields: ['main', 'module'],
    extensions: ['.js', '.ts'],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: 'extension.js',
    libraryTarget: 'commonjs',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: path.resolve(__dirname, '/node_modules/'),
        loader: 'ts-loader',
        options: {
          configFile: 'tsconfig.json',
        },
      },
    ],
  },
  externals: {
    'coc.nvim': 'commonjs coc.nvim',
    trash: 'commonjs trash',
    open: 'commonjs open',
  },
};
