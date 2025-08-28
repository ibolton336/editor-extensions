#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json to determine which brand we're building
const packagePath = path.join(__dirname, "../vscode/package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

// Use the package name to determine branding (mta or konveyor)
const extensionName = packageJson.name;
console.log(`🔄 Running prebuild for ${extensionName}...`);

// Get branding configuration based on current package name
// If it's already "mta", use mta branding; otherwise use konveyor
const brandingName = extensionName === "mta" ? "mta" : "konveyor";
let brandingStrings;

try {
  brandingStrings = packageJson.branding[brandingName];
  if (!brandingStrings) {
    throw new Error(`Branding configuration '${brandingName}' not found in package.json`);
  }
} catch (error) {
  console.error(
    `❌ Could not read branding configuration '${brandingName}' from package.json:`,
    error,
  );
  process.exit(1);
}

console.log(`📦 Transforming package.json for ${brandingStrings.productName}...`);

// Apply core branding transformations
Object.assign(packageJson, {
  name: brandingStrings.extensionName,
  displayName: brandingStrings.displayName,
  description: brandingStrings.description,
  publisher: brandingStrings.publisher,
  author: brandingStrings.author,
  icon: brandingStrings.icon,
});

// Transform configuration properties
if (packageJson.contributes?.configuration?.properties) {
  const props = packageJson.contributes.configuration.properties;
  const newProps = {};

  Object.keys(props).forEach((key) => {
    const newKey = key.replace(/^[^.]+\./, `${brandingStrings.configPrefix}.`);
    newProps[newKey] = props[key];
  });

  packageJson.contributes.configuration.properties = newProps;
  packageJson.contributes.configuration.title = brandingStrings.productName;
}

// Transform commands
if (packageJson.contributes?.commands) {
  // Categories that should not be transformed by branding
  const preservedCategories = ["diffEditor"];

  packageJson.contributes.commands = packageJson.contributes.commands.map((cmd) => ({
    ...cmd,
    command: cmd.command.replace(/^[^.]+\./, `${brandingStrings.commandPrefix}.`),
    // Only transform category if it's not in the preserved list
    category: preservedCategories.includes(cmd.category) ? cmd.category : brandingStrings.category,
    // Handle bidirectional transformation for titles
    title: cmd.title?.replace(/(Konveyor|MTA)/g, brandingStrings.productName) || cmd.title,
  }));
}

// Transform views and containers
if (packageJson.contributes?.viewsContainers?.activitybar) {
  packageJson.contributes.viewsContainers.activitybar =
    packageJson.contributes.viewsContainers.activitybar.map((container) => ({
      ...container,
      id: brandingStrings.viewPrefix,
      title: brandingStrings.productName,
      icon: brandingStrings.icon,
    }));
}

if (packageJson.contributes?.views) {
  const newViews = {};
  Object.keys(packageJson.contributes.views).forEach((viewKey) => {
    newViews[brandingStrings.viewPrefix] = packageJson.contributes.views[viewKey].map((view) => ({
      ...view,
      id: view.id.replace(/^[^.]+\./, `${brandingStrings.viewPrefix}.`),
      name: view.name.replace(/\b\w+/, brandingStrings.productName),
    }));
  });
  packageJson.contributes.views = newViews;
}

// Transform menus
if (packageJson.contributes?.menus) {
  const transformMenuCommands = (menuItems) => {
    return menuItems.map((item) => ({
      ...item,
      command: item.command?.replace(/^[^.]+\./, `${brandingStrings.commandPrefix}.`),
      when: item.when
        // Handle bidirectional transformation for any existing branding
        ?.replace(/(konveyor|mta)\.issueView/g, `${brandingStrings.viewPrefix}.issueView`)
        .replace(/(konveyor|mta)(?=\s|$)/g, brandingStrings.viewPrefix),
      submenu: item.submenu?.replace(/^(konveyor|mta)\./, `${brandingStrings.viewPrefix}.`),
    }));
  };

  const newMenus = {};
  Object.keys(packageJson.contributes.menus).forEach((menuKey) => {
    // Handle bidirectional transformation for menu keys
    const newMenuKey =
      menuKey.includes("konveyor") || menuKey.includes("mta")
        ? menuKey.replace(/(konveyor|mta)/g, brandingStrings.viewPrefix)
        : menuKey;
    newMenus[newMenuKey] = transformMenuCommands(packageJson.contributes.menus[menuKey]);
  });
  packageJson.contributes.menus = newMenus;
}

// Transform submenus
if (packageJson.contributes?.submenus) {
  packageJson.contributes.submenus = packageJson.contributes.submenus.map((submenu) => ({
    ...submenu,
    id: submenu.id.replace(/^(konveyor|mta)/, `${brandingStrings.viewPrefix}`),
    label: `${brandingStrings.productName} Actions`,
  }));
}

// Copy assets - whatever exists in the directories gets used
console.log(`🖼️  Copying assets for ${brandingStrings.productName}...`);

// 1. Copy VSCode sidebar icon (whatever icon exists in sidebar-icons/)
const iconSource = path.join(__dirname, "..", "assets/branding/sidebar-icons/icon-sidebar.png");
const iconTarget = path.join(__dirname, "..", "vscode/resources/icon.png");

if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, iconTarget);
  console.log(`  ✅ VSCode sidebar icon copied`);
} else {
  console.warn(`  ⚠️  No sidebar icon found at: assets/branding/sidebar-icons/icon-sidebar.png`);
}

// 2. Copy webview avatar (whatever avatar exists in avatar-icons/)
const avatarSource = path.join(__dirname, "..", "assets/branding/avatar-icons/avatar.svg");
const avatarTarget = path.join(__dirname, "..", "webview-ui/public/avatarIcons/avatar.svg");

if (fs.existsSync(avatarSource)) {
  // Ensure target directory exists
  const avatarDir = path.dirname(avatarTarget);
  if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
  }
  fs.copyFileSync(avatarSource, avatarTarget);
  console.log(`  ✅ Webview avatar copied`);
} else {
  console.warn(`  ⚠️  No avatar found at: assets/branding/avatar-icons/avatar.svg`);
}

// Write the transformed package.json
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

console.log(`✅ ${brandingStrings.productName} branding transformations complete`);
