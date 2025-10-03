# The Complete Guide to Publishing npm CLI Tools: Building create-protocol-demo

Publishing a professional CLI scaffolding tool requires orchestrating multiple systems: npm's publishing workflow, cross-platform compatibility, template architecture, build tooling, and npx optimization. This comprehensive guide synthesizes best practices from successful tools like create-react-app, create-vite, and create-next-app to help you build **create-protocol-demo** as a production-ready scaffolding tool for protocol manifest projects.

The most critical insight: **modern CLI tools have evolved from heavy, configuration-laden systems to lightweight, bundled executables with external templates**. Create-vite's approach—bundling core logic while keeping templates separate—represents the current gold standard, achieving sub-100ms startup times and packages under 5MB.

## Publishing scoped packages with CLI binaries to npm

Publishing a scoped package with a CLI binary requires understanding npm's authentication model and the specific flags needed for public packages. The process differs significantly from unscoped packages, with **public scoped packages requiring explicit `--access public` on first publish**—without this flag, your publish will fail since scoped packages default to private (which requires a paid plan).

Start by initializing your project with `npm init --scope=@username` to create a scoped package under your npm account. The scope provides namespace isolation and prevents name collisions, making `@yourname/create-protocol-demo` preferable to trying to claim the bare `create-protocol-demo` name. Each npm user or organization gets exactly one scope matching their username, and only you can publish packages within your scope.

Authentication for publishing involves three token types: legacy tokens (read-only, automation, or publish), and the newer **granular access tokens** (recommended). Granular tokens provide fine-grained control, allowing you to restrict access to specific packages, set expiration dates, and limit by IP ranges—up to 1,000 tokens per account with access to 50 packages each. Create automation tokens through the npm website or CLI with `npm token create`, then store them in your user-level `~/.npmrc` file using environment variables: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`. Never commit tokens to source control.

Your package.json must include a `bin` field mapping command names to executable files. Use the object syntax for explicit control: `"bin": { "create-protocol-demo": "./bin/cli.js" }`. The target file must start with the shebang `#!/usr/bin/env node` as the very first line—this tells Unix systems to execute with Node.js and signals npm to generate Windows wrapper files. The `files` field controls what gets published; use a whitelist approach to keep package size minimal: `"files": ["bin/", "dist/", "templates/", "README.md"]`.

For CI/CD publishing, GitHub Actions offers the cleanest integration with npm's new trusted publishing feature using OpenID Connect. This eliminates long-lived tokens entirely. Configure your workflow with `permissions: { id-token: write }` and run `npm publish --provenance --access public` to generate cryptographically signed provenance statements linking your package to its source repository. Alternatively, store an automation token as a GitHub secret named `NPM_TOKEN` and reference it as `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` in your workflow environment variables.

The pre-publish checklist should verify: valid semantic versioning in package.json, accurate `files` or `.npmignore` configuration excluding sensitive data (.env files, tokens, private keys), correct `engines` field specifying minimum Node.js version, comprehensive README with installation and usage instructions, and a LICENSE file with a valid SPDX identifier. Test locally with `npm pack --dry-run` to preview published contents and `npm link` to test the CLI globally before publishing.

Common publishing failures include "404 Not Found" (usually wrong user logged in or not a member of the organization scope), "403 Forbidden" (insufficient permissions or 2FA required without `--otp` flag), and "402 Payment Required" (attempting to publish private scoped package without paid plan). The solution: explicitly add `"publishConfig": { "access": "public" }` to package.json to avoid remembering the flag every time.

## Cross-platform CLI compatibility: bin field, shebangs, and wrappers

Cross-platform CLI compatibility boils down to understanding that **npm automatically handles Windows compatibility**—you don't create platform-specific scripts manually. When a package with a `bin` field installs, npm's `cmd-shim` module generates three wrapper files: a `.cmd` file for Windows Command Prompt, a `.ps1` file for PowerShell, and a Unix shell script for Git Bash and WSL. All three wrappers call Node.js with your JavaScript file, making your CLI work seamlessly across platforms.

The shebang line `#!/usr/bin/env node` serves dual purposes. On Unix systems, the kernel parses this line to determine which interpreter executes the script—`env` searches the PATH for `node`, making the shebang portable across different Node.js installation locations. On Windows, the shebang is treated as a comment by the operating system but npm reads it during installation to generate appropriate wrapper files. The shebang must be the absolute first line with no preceding whitespace, or it won't be recognized.

File permissions present a platform divide. Unix systems require executable permissions set with `chmod +x bin/cli.js` (755 permissions: owner can read/write/execute, group and others can read/execute). However, **npm handles this automatically during installation based on the shebang**, so you only need to set permissions for local testing with `npm link`. Windows ignores Unix permissions entirely, relying on file extensions and npm's wrappers for execution, so `fs.chmodSync()` with octal values silently fails on Windows and should be wrapped in platform checks: `if (process.platform !== 'win32') { fs.chmodSync('./script.js', 0o755); }`.

Path handling requires religious use of the `path` module. Never concatenate paths with string operations or hardcoded separators—`path.join('users', 'john', 'documents')` automatically produces `users\john\documents` on Windows and `users/john/documents` on Unix. The path module provides essential cross-platform methods: `path.resolve()` for absolute paths, `path.normalize()` for cleaning up paths with `..` segments, `path.dirname()` for extracting directories, and `path.basename()` for file names. For ES modules, use `fileURLToPath(import.meta.url)` and `dirname()` to replicate `__filename` and `__dirname` behavior, or leverage Node.js 21.2.0+'s built-in `import.meta.filename` and `import.meta.dirname`.

Terminal output compatibility centers on ANSI escape codes and color support. Modern Windows 10+ supports ANSI codes natively in Windows Terminal, but older systems and CMD.EXE require `ENABLE_VIRTUAL_TERMINAL_PROCESSING`. Rather than handling this complexity manually, use established libraries: **chalk** (most popular, automatic detection), **ansi-colors** (faster alternative), or **kleur** (lightweight). These libraries respect `NO_COLOR` and `FORCE_COLOR` environment variables and gracefully degrade in non-TTY environments. For newlines, Node.js handles conversion automatically, so `\n` works universally—only use `os.EOL` when writing files that must match platform conventions.

Testing across platforms requires GitHub Actions matrix builds spanning Ubuntu, Windows, and macOS with multiple Node.js versions. A minimal test workflow runs `npm ci`, `npm test`, `npm link`, and executes your CLI command on each platform. Windows-specific testing should verify both PowerShell and CMD.EXE execution paths, test paths with spaces, and confirm UNC path handling. The most common cross-platform pitfalls include hardcoded path separators, shell commands that don't exist on Windows (use Node.js fs methods instead), assuming Unix permissions exist, hardcoded home directories (use `os.homedir()`), and using `.js` extensions in bin command names (can trigger Windows Script Host).

## Scaffolding architecture: lessons from create-react-app, create-vite, and create-next-app

The evolution of scaffolding tools reveals a clear trajectory from complexity to simplicity. Create-react-app pioneered "zero configuration" by hiding webpack, Babel, and ESLint behind a single `react-scripts` dependency, but this approach produced **28MB+ node_modules** and became inflexible without ejecting. The tool entered long-term stasis in 2023 and is no longer recommended for new projects. In contrast, create-vite delivers a lightweight CLI (~5MB) with direct template copying, while create-next-app achieved "zero dependencies" (for core scaffolding) with prompt-based configuration and instant generation.

Template system design follows three patterns. Create-react-app uses a `template/` directory structure where files get copied to the project root, with `template.json` merging dependencies and scripts into the generated package.json. The system renames `gitignore` to `.gitignore` during copying to avoid npm publish issues (npm ignores .gitignore files). Create-vite employs direct file system operations with a framework-variant structure—users select a framework (React, Vue, Svelte) then a variant (JavaScript, TypeScript, SWC), with templates stored as complete directory trees at `packages/create-vite/template-[name]/`. Create-next-app takes a generation-based approach, programmatically creating files based on user choices rather than maintaining separate template packages, and supports bootstrapping from the Next.js examples collection with `--example [name]`.

The great interactive prompts migration shows all three tools converging on the **prompts library** rather than Inquirer.js. Create-react-app migrated from Inquirer to prompts in v4.0.1 (PR #10083) because Inquirer's RxJS dependency made it several megabytes heavier. Prompts offers a lightweight (~0.7MB smaller minified), promise-based API perfect for simple scaffolding flows. The standard pattern chains dependent prompts:

```javascript
const result = await prompts([
  {
    type: 'text',
    name: 'projectName',
    message: 'Project name:',
    initial: 'my-app',
    validate: name => isValidPackageName(name) || 'Invalid name'
  },
  {
    type: 'select',
    name: 'framework',
    message: 'Select a framework:',
    choices: [
      { title: 'React', value: 'react' },
      { title: 'Vue', value: 'vue' }
    ]
  },
  {
    type: 'select',
    name: 'variant',
    message: 'Select a variant:',
    choices: (prev, answers) => getVariants(answers.framework)
  }
]);
```

File operations use either fs-extra or built-in fs with recursive copying. Create-vite's approach defines `write()` and `copy()` functions with a `renameFiles` object for edge cases (`_gitignore` → `.gitignore`, `_eslintrc.json` → `.eslintrc.json`). The pattern avoids templating engines entirely for simple scaffolding—just copy files directly and perform variable substitution only in package.json. For advanced needs requiring template rendering, options include Handlebars (`{{ variable }}` syntax), Mustache (similar to Handlebars), or EJS (embedded JavaScript), but these add complexity and dependencies that modern tools avoid.

Package.json generation merges a base structure with template-specific dependencies. The base establishes project metadata (name, version, private: true) and core scripts (dev, build, preview), while template package.json files contribute framework-specific dependencies. Create-next-app generates dependencies dynamically based on user choices—TypeScript selection adds `typescript`, `@types/node`, `@types/react`, and `@types/react-dom` to devDependencies; ESLint selection adds `eslint` and `eslint-config-next`. Package manager detection reads `process.env.npm_config_user_agent` to determine if the user invoked the tool with npm, yarn, pnpm, or bun, then uses the appropriate install command.

Post-installation workflows follow a consistent pattern: initialize git repository (with `--disable-git` option to skip), add all files, create initial commit, and display next steps. The git initialization wraps commands in try-catch to gracefully handle missing git installations. Success messages evolved from verbose explanations to concise, actionable instructions—Vite shows three simple commands (cd, install, run dev) while Next.js adds command descriptions to clarify what each does.

Essential CLI libraries form a standard toolkit: **prompts** for interactive input, **chalk** for terminal styling (blue for info, green for success, red for errors, yellow for warnings), **ora** for progress spinners, **commander** or minimist for argument parsing, **fs-extra** for enhanced file operations (copy, ensureDir, outputFile), and **validate-npm-package-name** for project name validation. This dependency set totals roughly 2-3MB, providing professional UX without bloat.

## TypeScript CLI package structure: directories, exports, and build configuration

The optimal directory structure for TypeScript CLI tools separates source, compiled output, executable wrappers, and templates into distinct locations. Source TypeScript lives in `src/` with `cli.ts` as the CLI entry point (containing the shebang comment) and `index.ts` as the library entry for programmatic usage. The build process compiles to `dist/` containing both CommonJS (`.cjs`) and ES modules (`.mjs`) plus type declarations (`.d.ts`). A minimal `bin/` directory holds the generated JavaScript entry point with the actual shebang. Templates or static assets exist in separate top-level directories included via the `files` field.

Package.json configuration requires careful attention to multiple entry points. The `bin` field maps CLI commands to executables: `"bin": { "create-protocol-demo": "./bin/cli.js" }`. The `main` field points to the CommonJS entry (`./dist/index.cjs`), while `module` specifies the ES module entry (`./dist/index.mjs`). The modern `exports` field provides fine-grained control over package entry points, supporting both CommonJS and ES modules with conditional exports:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./package.json": "./package.json"
  }
}
```

The `files` field uses a whitelist approach to minimize package size—include only `bin/`, `dist/`, `templates/`, `README.md`, and `LICENSE`. This excludes source code (`src/`), tests, documentation sources, and build configuration, keeping the published package lean. The `engines` field specifies minimum Node.js version support (e.g., `"node": ">=16.0.0"`), while `publishConfig` ensures public access: `"publishConfig": { "access": "public" }`.

TypeScript configuration for CLI tools targets modern Node.js with specific compiler options. Set `target` to ES2020 or later for modern JavaScript features, `module` to ESNext or Node16 for ES modules, `moduleResolution` to Node16 or NodeNext for correct resolution, `outDir` to `dist/` for compiled output, `declaration` to true for generating `.d.ts` files, and `sourceMap` to true for debugging support (optionally false for production builds). Enable `esModuleInterop` and `skipLibCheck` for better compatibility. The `include` field should reference `["src/**/*"]` while `exclude` removes `["node_modules", "dist", "**/*.test.ts"]`.

Build workflow options range from native `tsc` to modern bundlers. The TypeScript compiler alone works for simple projects: `tsc` reads tsconfig.json and compiles to the output directory. For better performance and bundling, **esbuild** provides 10-100x faster builds, completing in ~50ms versus webpack's 5+ seconds. **Tsup** wraps esbuild with better defaults for library authors, handling dual CommonJS/ESM builds automatically. Configure build scripts in package.json:

```json
{
  "scripts": {
    "build": "tsup src/cli.ts src/index.ts --format cjs,esm --dts",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "prepublishOnly": "npm run clean && npm run build && npm test"
  }
}
```

Version management follows semantic versioning strictly: patch versions (1.0.x) for bug fixes, minor versions (1.x.0) for new backward-compatible features, and major versions (x.0.0) for breaking changes. Modern tooling automates this process—**Changesets** provides an excellent developer experience with `changeset add` to document changes during development and `changeset version` to update versions automatically. **Release-please** integrates with GitHub to create release PRs based on conventional commits. **Semantic-release** offers full automation analyzing commit messages to determine version bumps, generating changelogs, and publishing to npm, though it requires stricter commit discipline.

Pre-publish validation catches issues before they reach npm. The `prepublishOnly` script runs automatically before `npm publish`, making it ideal for running tests and builds: `"prepublishOnly": "npm run build && npm test"`. Additional pre-version hooks enable checks before version bumps: `"preversion": "npm test"` ensures tests pass before updating the version. Post-version hooks automate tagging: `"postversion": "git push && git push --tags"` publishes the version commit and tag to GitHub.

CI/CD integration for automated publishing typically uses GitHub Actions triggered on release creation or tag push. The workflow checks out code, sets up Node.js with registry authentication, runs tests, builds the package, and publishes with provenance. For create-protocol-demo, a practical workflow includes matrix testing across platforms before publishing, ensuring the CLI works on Windows, macOS, and Linux before reaching users.

## Optimizing packages for npx: caching, performance, and first-run experience

Understanding npx's resolution and caching behavior is fundamental to optimization. When executing `npx create-protocol-demo`, npm first checks `./node_modules/.bin/`, then global `$PATH`, and finally downloads from the npm registry to cache at `~/.npm/_npx/`. The cache key combines package name and version into a SHA512 hash (first 16 characters), and critically, **packages remain cached indefinitely**—npx never automatically updates cached packages. Even with cached packages, npm makes HTTP requests to the registry for metadata revalidation (304 checks), causing 3+ second delays that represent an ongoing performance issue tracked in npm/cli #7295.

Package naming for scaffolding tools should follow the `create-*` convention, which aligns with npm's `npm create` shortcut—users can run `npm create protocol-demo` which automatically resolves to `npx create-protocol-demo@latest`. This convention immediately communicates intent and improves discoverability through npm search. Scoped packages work too (`@org/create-protocol-demo`), providing namespace protection while requiring the full `npx @org/create-protocol-demo` invocation. Use descriptive rather than clever names, maintain lowercase throughout, and leverage the keywords field in package.json for search optimization.

First-run experience optimization focuses on minimizing network latency, disk I/O, and dependency resolution. **The single most impactful optimization is reducing total package size**, as every byte must download before execution. Audit dependencies with `npx depcheck` to identify unused packages, prefer lightweight alternatives (prompts over Inquirer, kleur over chalk for size-conscious projects), and use native Node.js APIs where possible. Tree-shaking works best with ES modules—import specific functions (`import { specific } from 'lib'`) rather than entire packages, and avoid barrel exports that import everything. Target CLI tools under 5MB total, ideally under 1MB for the core bundle.

Bundling strategy dramatically affects startup performance. A single bundled file starts 10-100x faster than modular code requiring hundreds of file reads. **Esbuild** represents the current best practice for CLI tools—written in Go, it bundles in ~50ms while simultaneously minifying and tree-shaking. Configure esbuild to bundle the CLI entry point while keeping templates external:

```javascript
{
  entryPoints: ['src/cli.js'],
  bundle: true,
  platform: 'node',
  target: 'node14',
  outfile: 'dist/cli.bundle.js',
  minify: true,
  external: ['fsevents'],
  treeShaking: true,
  banner: { js: '#!/usr/bin/env node' }
}
```

Package size optimization uses the `files` whitelist in package.json rather than .npmignore—explicitly including only `["dist/", "bin/", "templates/", "README.md"]` prevents accidental inclusion of test files, documentation sources, examples, GitHub workflows, and source code. Run `npm pack --dry-run` to preview contents and check the package size. Consider whether source maps are necessary in published packages (they help debugging but add significant size). For templates and large static assets, evaluate whether they should live in separate packages or be downloaded on demand.

The tension between global install and npx usage has resolved clearly in favor of npx for scaffolding tools. **Modern consensus considers global installs bad practice** for project-specific tools, with npx usage preferred for create-* tools that run once per project. Global installs pollute the system namespace, become outdated without manual updates, and complicate version management across projects. Reserve global installs only for frequently used development tools (TypeScript, ESLint), package managers themselves (npm, yarn, pnpm), and version managers (nvm). For create-protocol-demo, optimize exclusively for npx with the expectation users run `npx create-protocol-demo@latest` to ensure they always get the current version.

Performance best practices include lazy loading heavy dependencies—import ora, inquirer, and other large packages only when needed rather than at file top level. Show immediate feedback with a simple `console.log('🚀 Creating project...')` before importing dependencies, providing visual confirmation that something is happening. Use conditional imports for platform-specific code: `if (process.platform === 'darwin') { const macUtils = require('./mac-utils'); }`. For truly large operations, consider progressive enhancement where the tool works with a minimal fast path and offers optional enhanced features requiring additional downloads.

Caching implications for tool developers center on helping users get the latest version. Implement update notifications using update-notifier to display messages when newer versions exist: `updateNotifier({ pkg }).notify()`. Check if running via npx with `process.env.npm_execpath?.includes('npx')` and recommend `@latest` if not specified. Document clearing the npx cache in troubleshooting sections: `rm -rf ~/.npm/_npx`. Test the npx flow locally with `npm pack` followed by `npx ./create-protocol-demo-1.0.0.tgz test-project` to verify behavior matches user experience.

## Implementation roadmap for create-protocol-demo

For the protocol manifest scaffolding tool, adopt create-vite's architecture: **bundled CLI core with external templates**. The structure should place source TypeScript in `src/` with `cli.ts` as the entry point, compile to `dist/cli.bundle.js` via esbuild, provide a minimal shebang wrapper in `bin/create-protocol-demo.js` that requires the bundle, and maintain templates as separate directories under `templates/` for each protocol type (API Protocol, Data Protocol, Event Protocol) with both JavaScript and TypeScript variants.

Build workflow uses esbuild to bundle `src/cli.js` targeting Node.js 14+ with minification enabled, tree-shaking active, and fsevents marked external (platform-specific, not needed on all systems). The package.json `scripts` section includes `"build": "node build.js"`, `"prepublishOnly": "npm run build"` for automatic building before publish, and `"test": "npm pack && npm install -g ./create-protocol-demo-*.tgz && create-protocol-demo test"` for integration testing. The `files` field whitelists only `["bin/", "dist/", "templates/"]` to minimize package size.

Interactive prompt flow should follow this sequence: ask for project name with validation using validate-npm-package-name, offer protocol type selection (API/Data/Event with descriptions), present language choice (TypeScript/JavaScript), ask about package manager preference (npm/yarn/pnpm/bun detected from user agent with override option), confirm whether to include example implementations, and confirm git initialization. Use prompts library rather than Inquirer for lower overhead, with validation functions inline and conditional prompts based on previous answers.

The scaffolding implementation follows this pattern: validate project name and check directory doesn't exist, create target directory with fs-extra's ensureDir, copy appropriate template based on selections, generate package.json merging base structure with template-specific dependencies, optionally run package manager install (with `--skip-install` flag), initialize git repository if confirmed, and display success message with next steps. Wrap the entire flow in try-catch with cleanup on failure—if scaffolding fails mid-process, remove the partially created directory to avoid confusion.

Error handling should provide helpful guidance rather than raw stack traces. For invalid project names, explain the requirements (lowercase, no special characters, no leading dots/underscores) with a correct example in green. For existing directories, offer to use a different name rather than overwriting. For network failures during package installation, suggest offline modes or manual installation. For missing git, simply skip initialization with a note rather than failing entirely. Always exit with appropriate status codes (0 for success, 1 for errors) to support scripting and CI/CD usage.

Testing strategy includes unit tests for validation functions and utility methods, integration tests that run the full scaffolding flow in a temporary directory, and platform tests via GitHub Actions matrix across Ubuntu, Windows, and macOS. The integration test should verify all file operations complete successfully, generated package.json matches expectations, template files copied correctly, and the generated project's package manager can install dependencies. Local testing uses `npm link` for development iteration and `npm pack` followed by local npx invocation to verify the full publication flow.

Performance targets should aim for first run under 30 seconds including dependency installation, bundle size under 500KB excluding templates, cached startup under 100ms, total package size under 5MB, and template copying under 1 second. These targets ensure users experience minimal friction when scaffolding new projects. Monitor bundle size during development with esbuild's built-in size reporting, and periodically audit dependencies to catch bloat before it accumulates.

User experience polish includes visual progress indicators using ora spinners for long-running operations (installing dependencies, copying files), color-coded messages with chalk (blue for info, green for success, yellow for warnings, red for errors), clear next steps in the success message with the actual commands to run highlighted in cyan, update notifications using update-notifier to prompt users toward newer versions, and version checking to warn if not running the @latest tag via npx. The goal is making users feel guided and informed throughout the scaffolding process.

## Publishing workflow: from build to npm registry

The complete publish workflow begins with version management—decide whether to use manual `npm version patch|minor|major`, automated changesets, or release-please. For teams, changesets provides excellent collaboration with `changeset add` creating markdown files documenting changes that get committed with PRs. Run `changeset version` to consume these files and update package.json versions, then `changeset publish` to publish all changed packages (supports monorepos). For solo maintainers, manual versioning with git tags works fine: `npm version minor -m "Release v%s"` updates package.json and creates a git tag in one command.

Pre-publish verification should run the test suite, build the production bundle, test installation locally via npm pack, verify the files list includes necessary files only, check the package size is reasonable, test the CLI command actually works, and review CHANGELOG.md documents all changes. The `npm pack --dry-run` command previews exactly what will publish without creating a tarball. The `tar -tzf create-protocol-demo-1.0.0.tgz` command (after running `npm pack`) shows the exact file list in the package.

Publishing to npm requires being logged in (verify with `npm whoami`), having a verified email, and using the correct access level. For first publish of a scoped public package, use `npm publish --access public`—subsequent publishes remember this setting and just need `npm publish`. If 2FA is enabled for publishing (recommended), append `--otp=123456` with the current one-time password from your authenticator. For provenance (cryptographic linking to source), add `--provenance` flag which requires permissions in CI: `id-token: write`.

The automated GitHub Actions workflow triggers on release creation (manually created through GitHub UI) or pushed tags matching semantic version patterns. The workflow matrix tests across platforms and Node versions first, then a separate publish job runs only on success. Set up Node.js with the npm registry URL, install dependencies with `npm ci` (faster, uses lockfile exactly), run `npm publish --provenance --access public`, and configure the NPM_TOKEN as a repository secret. Use GitHub Environments for additional protection, requiring manual approval for production publishes or restricting to specific branches.

Post-publish tasks include verifying the package appears on npm (can take a minute), testing installation from npm registry (`npm install -g create-protocol-demo` or `npx create-protocol-demo@latest`), creating GitHub release with changelog, updating documentation site if applicable, announcing on relevant channels (Twitter, Discord, blog), and monitoring for issues from early adopters. The npm package page should display correctly with README, install instructions, and provenance badge (green checkmark) if published with --provenance flag.

Version strategy for scaffolding tools follows semantic versioning but with specific considerations. Breaking changes (major versions) include removing CLI flags, changing template structures incompatibly, or dropping Node.js version support. New features (minor versions) include new templates, additional CLI options, or new interactive prompts. Bug fixes (patch versions) include fixing file copying issues, correcting package.json generation, or improving error messages. Since scaffolding tools primarily run via npx with @latest, users automatically get the newest version, making rapid iteration safer than for libraries with many dependents.

## Summary: building production-ready CLI scaffolding tools

Success in npm CLI tooling comes from understanding the full stack: npm's publishing mechanics, cross-platform Node.js intricacies, modern JavaScript build tooling, and user experience design. The create-protocol-demo tool should adopt these specific patterns: **bundle core logic with esbuild** for fast startup (targeting 50-100ms), **keep templates external** as separate directories for easy updates and customization, **use the prompts library** for interactive flows with ~2-3MB total dependency footprint, **publish to npm as a scoped public package** with provenance for supply chain security, and **optimize exclusively for npx usage** with the create-* naming convention.

The modern CLI toolkit consists of prompts for user interaction, chalk for terminal colors, ora for spinners, fs-extra for file operations, validate-npm-package-name for validation, and commander for argument parsing—together providing professional UX at reasonable package size. Build with esbuild for compilation speed and small bundle sizes, test across platforms with GitHub Actions matrices, and publish with automated workflows that ensure quality through comprehensive pre-publish checks.

Performance targets keep users happy: complete first runs under 30 seconds, cache-warmed execution under 100ms, total package size under 5MB, and core bundle under 500KB. Achieve these by minimizing dependencies, bundling strategically, using whitelist `files` fields, and lazy-loading heavy operations. The result is a tool that feels instant, works everywhere, and stays out of the user's way—letting them focus on building protocol implementations rather than fighting tooling.