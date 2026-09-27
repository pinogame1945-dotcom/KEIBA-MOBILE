import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const app = readJson("app.json");
const pkg = readJson("package.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app?.expo, "Expo config is missing");
assert(
  app.expo.android?.package === "com.pinogame.keibamobile",
  "Android package identity changed: expected com.pinogame.keibamobile",
);
assert(typeof pkg.name === "string" && pkg.name.length > 0, "package.json name is missing");
assert(pkg.private === true, "KEIBA-MOBILE package must remain private as an npm package");

console.log("mobile foundation contract: PASS");
