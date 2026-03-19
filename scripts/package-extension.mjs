import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const extensionSourceDir = path.join(rootDir, "apps", "sentinel-extension");
const outputDir = path.join(rootDir, "dist", "extension");
const vendorDir = path.join(outputDir, "vendor");
const sourceFiles = {
  popup: path.join(extensionSourceDir, "popup.js"),
  model: path.join(extensionSourceDir, "src", "app-model.js"),
  adapter: path.join(rootDir, "packages", "sentinel-adapter", "src", "index.js"),
  core: path.join(rootDir, "packages", "sentinel-core", "src", "index.js")
};

export function rewriteAdapterImports(source) {
  return source.replace(
    /from "\.\.\/\.\.\/sentinel-core\/src\/index\.js";/g,
    'from "./sentinel-core.js";'
  );
}

export function rewritePopupImports(source) {
  return source.replace(
    /from "\.\.\/\.\.\/packages\/sentinel-adapter\/src\/index\.js";/g,
    'from "./vendor/sentinel-adapter.js";'
  );
}

async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}

async function copyStaticAssets() {
  await cp(path.join(extensionSourceDir, "manifest.json"), path.join(outputDir, "manifest.json"));
  await cp(path.join(extensionSourceDir, "popup.html"), path.join(outputDir, "popup.html"));
  await cp(path.join(extensionSourceDir, "popup.css"), path.join(outputDir, "popup.css"));
}

async function writePackagedModules() {
  const [popupSource, modelSource, adapterSource, coreSource] = await Promise.all([
    readFile(sourceFiles.popup, "utf8"),
    readFile(sourceFiles.model, "utf8"),
    readFile(sourceFiles.adapter, "utf8"),
    readFile(sourceFiles.core, "utf8")
  ]);

  await Promise.all([
    writeFile(path.join(outputDir, "popup.js"), rewritePopupImports(popupSource)),
    writeFile(path.join(outputDir, "src", "app-model.js"), modelSource),
    writeFile(path.join(vendorDir, "sentinel-adapter.js"), rewriteAdapterImports(adapterSource)),
    writeFile(path.join(vendorDir, "sentinel-core.js"), coreSource)
  ]);
}

async function writeInstructions() {
  const instructions = `Sentinel unpacked extension

Load this directory in a Chromium browser:
1. Open chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked"
4. Select this folder: dist/extension

The popup is self-contained and ready to load without referencing files outside the extension root.
`;

  await writeFile(path.join(outputDir, "README.txt"), instructions);
}

export async function packageExtension() {
  await rm(outputDir, { recursive: true, force: true });
  await ensureDirectory(outputDir);
  await ensureDirectory(path.join(outputDir, "src"));
  await ensureDirectory(vendorDir);
  await copyStaticAssets();
  await writePackagedModules();
  await writeInstructions();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await packageExtension();
}
