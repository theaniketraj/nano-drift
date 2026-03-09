#!/usr/bin/env node
// Regenerates landing/docs-bundle.js from the docs/ source files.
// Run from the repo root: node scripts/bundle-docs.js

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const docs = {
  index: "docs/index.md",
  "getting-started": "docs/getting-started.md",
  configuration: "docs/configuration.md",
  architecture: "docs/architecture.md",
  "rpc-protocol": "docs/rpc-protocol.md",
  contributing: "docs/contributing.md",
  extension: "docs/extension/README.md",
  daemon: "docs/daemon/README.md",
};

let out =
  "// Auto-generated — do not edit directly.\n" +
  "// To regenerate after updating docs: node scripts/bundle-docs.js\n" +
  "window.DOCS_BUNDLE = {\n";

for (const [id, file] of Object.entries(docs)) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  out += "  " + JSON.stringify(id) + ": " + JSON.stringify(content) + ",\n";
}

out += "};\n";

const outPath = path.join(root, "landing", "docs-bundle.js");
fs.writeFileSync(outPath, out);
console.log(`Written ${fs.statSync(outPath).size} bytes → landing/docs-bundle.js`);
