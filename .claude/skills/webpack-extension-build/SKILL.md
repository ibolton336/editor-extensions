---
name: webpack-extension-build
description: Build the VS Code extension with Webpack. Use when editing webpack.config.js, extension bundling, CopyWebpackPlugin, DefinePlugin, or the extension build output.
---

# Webpack Extension Build (vscode/core)

Use this skill when working on the **extension-side build** -- the Webpack config that bundles TypeScript into the VS Code extension and copies the webview assets into the output.

## Config location

[vscode/core/webpack.config.js](vscode/core/webpack.config.js)

## Key settings

| Setting                | Value                                 | Why                                                                  |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `target`               | `"node"`                              | Extension runs in Node.js (VS Code extension host), not the browser. |
| `entry`                | `{ extension: "./src/extension.ts" }` | Single entry point; the extension activation function.               |
| `output.path`          | `path.resolve(__dirname, "out")`      | Built extension lands in `vscode/core/out/extension.js`.             |
| `output.libraryTarget` | `"commonjs2"`                         | VS Code loads extensions as CommonJS modules.                        |
| `externals`            | `{ vscode: "commonjs vscode" }`       | `vscode` module is provided by the host; never bundle it.            |
| `resolve.extensions`   | `[".ts", ".js"]`                      | TypeScript first, then JS.                                           |
| `devtool`              | `"source-map"`                        | Separate `.map` files for debugging the extension.                   |

## Loaders

- **ts-loader**: Compiles `.ts` to JS using the project's `tsconfig.json`. No `transpileOnly` -- full type checking during build.

## Plugins

### DefinePlugin

Injects build-time constants available in extension code:

```javascript
new webpack.DefinePlugin({
  __EXTENSION_NAME__: JSON.stringify(packageJson.name),
  __EXTENSION_AUTHOR__: JSON.stringify(packageJson.author),
  __EXTENSION_PUBLISHER__: JSON.stringify(packageJson.publisher),
  __EXTENSION_VERSION__: JSON.stringify(packageJson.version),
  __EXTENSION_DISPLAY_NAME__: JSON.stringify(packageJson.displayName),
  __EXTENSION_SHORT_NAME__: JSON.stringify(packageJson.contributes.commands[0].category),
  __BUILD_GIT_SHA__: JSON.stringify(getGitSha()),
  __BUILD_GIT_SHA_SHORT__: JSON.stringify(getGitShaShort()),
  __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
});
```

These are used throughout the extension (e.g. `EXTENSION_NAME`, `EXTENSION_DISPLAY_NAME` in constants). If you add a new constant, declare it here and add a TypeScript ambient declaration.

### CopyWebpackPlugin (production only)

```javascript
new CopyWebpackPlugin({
  patterns: [
    { from: "../../webview-ui/build", to: "out/webview" },
    { from: "src/test/testData", to: "test/testData" },
  ],
});
```

- Copies the **Vite-built webview** (`webview-ui/build`) into `vscode/core/out/webview` so the extension can load it via `asWebviewUri`. This means `npm run build -w webview-ui` must run **before** `npm run build -w vscode/core` in production.
- Copies test data for integration tests.
- **Skipped in development** (`isDev` check) because the Vite dev server serves webview assets directly.

## Build scripts

| Script                         | Command                              | When                                            |
| ------------------------------ | ------------------------------------ | ----------------------------------------------- |
| `npm run build -w vscode/core` | `webpack --mode production`          | CI, packaging, release.                         |
| `npm run dev -w vscode/core`   | `webpack --watch --mode development` | Local dev; watches for TS changes and rebuilds. |

## Language-specific extensions

`vscode/javascript`, `vscode/java`, `vscode/go`, `vscode/csharp` each have their own `webpack.config.js` with the same structure (target node, ts-loader, DefinePlugin) but **no CopyWebpackPlugin** -- only the core extension bundles the webview.

## Full build order

1. `npm run build -w shared` (Vite -- produces `shared/dist/`).
2. `npm run build -w agentic` (tsup -- produces `agentic/dist/`).
3. `npm run build -w webview-ui` (Vite -- produces `webview-ui/build/`).
4. `npm run build -w vscode/core` (Webpack -- bundles extension + copies webview build).
5. `npm run build -w vscode/javascript` (and java, go, csharp).

`npm run build` at the root runs all workspaces. `npm run dist` then copies outputs into `dist/` for packaging.

## Adding a new build-time constant

1. Add to `DefinePlugin` in `webpack.config.js`.
2. Add a `declare const __MY_CONSTANT__: string;` in a `.d.ts` file (e.g. `extra-types/index.d.ts`).
3. Use in extension code as `__MY_CONSTANT__`.

## Adding a new file to copy

Add a pattern to `CopyWebpackPlugin`. Remember this only runs in production mode; in dev, serve the file another way or use `asWebviewUri` with the source path.
