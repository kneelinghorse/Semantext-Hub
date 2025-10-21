{
  "name": "__PACKAGE_NAME__",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "__ADAPTER_DESCRIPTION__",
  "scripts": {
    "build": "node ./src/index.mjs --spec __SPEC_RELATIVE_PATH__ --out __OUTPUT_RELATIVE_PATH__",
    "run": "node ./src/index.mjs",
    "test": "node --test ./tests"
  }
}
