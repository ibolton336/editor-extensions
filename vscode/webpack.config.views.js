/* eslint-env node */

const path = require("path");
const webpack = require("webpack");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin"); // Import the plugin
const WebpackShellPluginNext = require("webpack-shell-plugin-next");

module.exports = (env, { mode }) => {
  const isDev = mode === "development";

  return {
    target: "web",
    mode: mode || "none",
    entry: {
      views: "./src/views/index.tsx",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      libraryTarget: "module",
    },
    experiments: {
      outputModule: true,
    },
    resolve: {
      roots: [__dirname],
      extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
    optimization: {
      minimize: !isDev,
    },
    module: {
      rules: [
        {
          test: /\.(tsx?)?$/iu,
          use: {
            loader: "swc-loader",
          },
          exclude: /node_modules/u,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: { importLoaders: 1 }, // Ensures CSS imports are handled properly
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: [
                    require("postcss-preset-env")({
                      stage: 3,
                      features: {
                        "nesting-rules": true,
                      },
                    }),
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    devServer: {
      static: {
        directory: path.join(__dirname, "static"),
        publicPath: "/static",
      },
      allowedHosts: "all",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "X-Requested-With, content-type, Authorization",
      },
      hot: true,
      client: {
        overlay: true,
      },
      compress: true,
      port: 18080,
    },
    plugins: [
      new webpack.ProvidePlugin({
        React: "react",
      }),
      isDev && new ReactRefreshWebpackPlugin(),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "assets", "kantra"), // Source path
            to: path.resolve(__dirname, "dist", "assets"), // Destination path
            noErrorOnMissing: true, // Optional: Avoid errors if the file is missing
            force: true, // Overwrite existing files
          },
        ],
      }),
      new WebpackShellPluginNext({
        onBuildEnd: {
          scripts: ["chmod +x dist/assets/kantra"],
          blocking: true, // Ensure the command finishes before proceeding
          parallel: false,
        },
      }),
    ].filter(Boolean),
    devtool: isDev ? "inline-cheap-module-source-map" : false,
    infrastructureLogging: {
      level: "log", // enables logging required for problem matchers
    },
  };
};
