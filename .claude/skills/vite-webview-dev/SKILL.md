---
name: vite-webview-dev
description: Build and serve the webview-ui React app with Vite. Use when editing the Vite config, dev server, HMR, base path, build output, webview asset loading, or DEV_SERVER_ROOT.
---

# Vite Webview Dev (webview-ui)

Use this skill when working on the **webview-ui build pipeline**, the Vite dev server, or how the extension loads webview assets in dev vs production.

## Config location

[webview-ui/vite.config.ts](webview-ui/vite.config.ts)

## Key settings

| Setting                | Value                                      | Why                                                                                                                        |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `base`                 | `"/out/webview"`                           | Matches the path where built assets land after `npm run dist` and aligns dev URLs with `DEV_SERVER_ROOT` in the extension. |
| `build.outDir`         | `"build"`                                  | Vite outputs here; Webpack's CopyWebpackPlugin copies `webview-ui/build` to `vscode/core/out/webview` for production.      |
| `build.sourcemap`      | `"inline"`                                 | Inline source maps so VS Code webview DevTools can debug React code.                                                       |
| `rollupOptions.output` | `entryFileNames: assets/[name].js`, etc.   | Deterministic names (no hash) so the extension can reference `assets/index.js` and `assets/index.css` by name.             |
| `publicDir`            | `"../assets"`                              | Serves branding assets from the repo root `assets/` folder.                                                                |
| `server.cors`          | `true`                                     | Required because the VS Code webview loads from a different origin (`vscode-webview://...`).                               |
| `plugins`              | `react()`, `checker({ typescript: true })` | React Fast Refresh (HMR) and TypeScript checking during dev.                                                               |
| `define`               | `__EXTENSION_NAME__`                       | Injected from `vscode/core/package.json` so the webview knows the extension name at build time.                            |

## Dev server flow

1. `npm run dev` (root) runs `concurrently` which starts:
   - `npm run dev -w shared` (Vite build --watch for the shared library)
   - `npm run dev -w agentic` (tsup --watch)
   - `npm run start -w webview-ui` (waits for `shared/dist/index.mjs`, then runs `vite`)
   - `npm run dev -w vscode/core` (webpack --watch)
2. Vite starts on **port 5173** (default).
3. The extension reads `process.env.NODE_ENV` -- when not `"production"`, the provider loads assets from the dev server.

## DEV_SERVER_ROOT and the extension provider

In [KonveyorGUIWebviewViewProvider.ts](vscode/core/src/KonveyorGUIWebviewViewProvider.ts):

```typescript
const DEV_SERVER_ROOT = "http://localhost:5173/out/webview";
```

| What                   | Production                                                                                 | Development                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **Script**             | `webview.asWebviewUri(Uri.joinPath(extensionUri, "out", "webview", "assets", "index.js"))` | `Uri.parse(DEV_SERVER_ROOT + "/src/index.tsx")`                   |
| **Styles**             | `...assets/index.css` via `asWebviewUri`                                                   | `DEV_SERVER_ROOT + "/src/index.css"`                              |
| **React Refresh**      | omitted                                                                                    | Injects `/@react-refresh` preamble script                         |
| **localResourceRoots** | `[assetsUri]` (only bundled output)                                                        | `[extensionUri]` (broader, allows dev loading)                    |
| **CSP**                | Strict: `script-src 'nonce-...' 'unsafe-eval'`                                             | Relaxed: adds `http://localhost:*` and `ws://localhost:*` for HMR |

If you change the dev server port or base path, update both `vite.config.ts` (`base`, `server.port`) and `DEV_SERVER_ROOT`.

## Production build flow

1. `npm run build -w webview-ui` runs `vite build` -- outputs to `webview-ui/build/`.
2. `npm run build -w vscode/core` runs `webpack --mode production` -- CopyWebpackPlugin copies `webview-ui/build` to `vscode/core/out/webview`.
3. The extension loads assets from `out/webview/assets/index.js` and `out/webview/assets/index.css` using `webview.asWebviewUri()`.

## Shared library dependency

The webview imports types and utilities from `@editor-extensions/shared`. The shared library is built with Vite ([shared/vite.config.js](shared/vite.config.js)) as ESM + CJS. The `dev:webview-ui` script uses `wait-on` to ensure `shared/dist/index.mjs` exists before starting Vite. If you change shared types, rebuild shared first (`npm run build -w shared`) or rely on watch mode.

## Adding a new asset or entry point

- **Static assets**: Place in `assets/` (repo root) or `webview-ui/public/`; reference in HTML or CSS.
- **New entry point**: Add to `build.rollupOptions.input` in `vite.config.ts`; update the provider to load the new script/style URI in `_getScriptUri` / `_getStylesUri`.
- **New external origin**: Update the CSP in `_getContentSecurityPolicy` (both prod and dev blocks).
