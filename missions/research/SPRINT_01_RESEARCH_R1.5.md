# Building Extensible CLI Tools: Architecture Patterns for Protocol Discovery

Modern CLI tools for protocol discovery require careful architectural design to balance extensibility, user experience, and operational robustness. The architecture patterns employed by tools like kubectl, Docker, Git, and ESLint reveal a sophisticated approach to command structure, plugin systems, progress feedback, error recovery, and configuration management. These battle-tested patterns provide a blueprint for building CLI tools that can evolve without core modifications while maintaining excellent user experience across interactive terminals and CI/CD pipelines.

## Command structures that scale from simple to complex

The verb-noun command pattern has emerged as the dominant structure for modern CLI tools, with Docker and kubectl demonstrating how management command prefixes enable clean scaling. The standard syntax follows `tool [global options] command [command options] [arguments]`, where anything before the command applies globally and anything after is command-specific. This separation prevents interface ambiguity and enables parallel team development on different command subsystems.

For protocol discovery workflows involving sequential stages like discover → review → approve → generate → report, three architectural patterns stand out. The **flat subcommand pattern** treats each stage as an independent command (`mytool discover`, `mytool review`, `mytool approve`), offering simplicity and scriptability. The **resource-based pattern** groups operations around resources (`mytool discovery create`, `mytool discovery review <id>`), providing built-in resource tracking and natural audit trails. The **pipeline pattern** makes workflows explicit (`mytool workflow start`, `mytool workflow discover`), with clear state tracking and pause/resume capabilities. The choice depends on whether workflows are long-running (favoring resource-based or pipeline patterns) or quick and scriptable (favoring flat subcommands).

The Cobra framework, used by Kubernetes and Docker with over 173,000 projects, exemplifies extensibility through its command tree architecture. Commands are registered programmatically using `rootCmd.AddCommand()`, enabling unlimited nesting with persistent flag inheritance. The framework provides pre/post run hooks for validation and cleanup, automatic help generation, and shell completion support. For protocol discovery tools, this translates to organizing commands in dedicated packages with clear separation between CLI logic and business logic.

kubectl demonstrates command taxonomy through logical categorization: resource management commands (create, get, describe, delete), application lifecycle commands (apply, rollout, scale), and troubleshooting commands (logs, exec, port-forward). This grouping prevents namespace pollution as tools grow and makes commands discoverable through natural mental models. Docker evolved from a flat namespace of 40+ commands to grouped management categories (container, image, network, volume, system) while maintaining backward compatibility by mapping legacy commands to the new structure.

Git's approach to workflow commands offers another proven pattern: composing atomic commands rather than building monolithic workflow commands. Git provides small, focused commands (add, commit, push, branch, merge) that work together, with workflows emerging from composition rather than being baked into the tool. This design enables users to create custom workflows while keeping the core tool simple. The distinction between porcelain (user-facing) and plumbing (low-level) commands further demonstrates progressive disclosure, where simple commands are easy but complex operations remain possible.

## Plugin architectures that extend without modification

The most successful plugin architectures employ multiple discovery mechanisms to balance flexibility with ease of use. **Naming convention discovery**, used by ESLint and kubectl, makes plugins discoverable by scanning for executables or packages matching specific patterns like `eslint-plugin-*` or `kubectl-*`. Any executable prefixed with `kubectl-` becomes a subcommand, enabling language-agnostic extensibility with zero core modifications. **Entry points**, standard in the Python ecosystem through setuptools, allow plugins to register themselves via package metadata without requiring filesystem scanning or core code changes.

Python's entry points pattern provides the most elegant approach to plugin registration. In the plugin's setup.py, developers declare entry points that map names to importable objects:

```python
setup(
    name='my-cli-plugin',
    entry_points={
        'my_cli.plugins': [
            'formatter = my_plugin.formatters:JSONFormatter',
            'validator = my_plugin.validators:SchemaValidator',
        ],
    },
)
```

The host application discovers plugins using importlib.metadata, loading all registered plugins for a specific group without knowing which packages provide them. This decoupling enables true extensibility where plugins can be distributed independently and installed via standard package managers.

For dynamic loading patterns, Node.js provides async imports that enable lazy loading and conditional plugin loading. Go offers two approaches: the standard library's plugin package for shared objects, and HashiCorp's go-plugin for RPC-based process isolation. The RPC approach provides stronger isolation where plugin crashes don't affect the host, communicating via net/rpc or gRPC with clear process boundaries. This architecture supports language-agnostic plugins and enhanced security through sandboxing.

**Hook-based architectures**, exemplified by Webpack's Tapable system, allow plugins to tap into lifecycle hooks provided by the core application. Webpack plugins implement an `apply` method that receives a compiler object and registers callbacks for specific lifecycle events:

```javascript
class MyPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('MyPlugin', (compilation) => {
      compilation.hooks.processAssets.tap({
        name: 'MyPlugin',
        stage: compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
      }, (assets) => {
        // Manipulate assets
      });
    });
  }
}
```

Tapable supports synchronous hooks, asynchronous serial and parallel execution, bail hooks that can stop execution, and waterfall hooks where each plugin receives the previous result. This flexible event system enables plugins to inject behavior at precise points without modifying core code.

**Interface-based design**, used by ESLint for rules, provides a contract that plugins must implement. ESLint rules export a `meta` object describing the rule and a `create` function returning an AST visitor. This standardized interface enables validation of plugin structure, automatic documentation generation, and consistent behavior across plugins. The visitor pattern, employed by Babel for AST transformation, allows plugins to specify functions that run when visiting specific node types, making code transformation composable and modular.

For protocol discovery tools, a combined approach works best: use naming conventions or entry points for initial discovery, implement hook-based architecture for workflow extension points (before/after discovery, during review, etc.), and define clear interfaces for importers (protocol data sources) and generators (report/config generators). Version the plugin API semantically and check compatibility at load time, failing gracefully with clear error messages when version mismatches occur.

## Progress reporting that adapts to environment

Progress reporting must adapt to execution context, with TTY detection serving as the primary decision point. The standard approach checks `process.stdout.isTTY` in Node.js, `sys.stdout.isatty()` in Python, or uses libraries like indicatif in Rust that automatically detect non-TTY environments. When output is redirected to a file, piped to another process, or running in CI, progress bars must be disabled in favor of structured logging to avoid cluttering logs with thousands of ANSI escape sequences.

Three core UI patterns serve different use cases. **Spinners** work best for short-duration tasks under 10 seconds with unknown completion time, providing visual feedback that the process is active. Libraries like ora for Node.js and indicatif for Rust automatically suppress spinners in non-TTY environments. **The X of Y pattern** should be the default choice when progress metrics are available, showing "Processing 45/100 items" which provides concrete information, works in both TTY and non-TTY environments, and helps users detect stuck processes. **Progress bars** are appropriate for multiple parallel operations or very long single operations where visual representation aids time estimation, but should be avoided for quick tasks under 2 seconds or non-TTY environments without proper detection.

For concurrent operations, multi-progress bar libraries enable coordinated display of multiple parallel tasks. Rust's indicatif MultiProgress provides thread-safe progress bars with automatic rendering coordination:

```rust
let multi = MultiProgress::new();
let pb1 = multi.add(ProgressBar::new(128));
let pb2 = multi.add(ProgressBar::new(256));

thread::spawn(move || {
    for _ in 0..128 {
        pb1.inc(1);
        thread::sleep(Duration::from_millis(15));
    }
    pb1.finish_with_message("Complete");
});
```

Bars can be added and removed dynamically, with the multi-progress manager handling rendering coordination to prevent visual artifacts. Python's Rich library and Node.js's cli-progress offer similar capabilities with varying degrees of sophistication.

**CI/CD environments require different strategies** to avoid excessive log output. Instead of updating progress bars every 50ms, which generates thousands of log lines, use milestone-based logging that outputs discrete updates at 25%, 50%, 75%, and 100% completion. Docker BuildKit demonstrates this with its `--progress` flag offering three modes: `auto` (detects environment), `tty` (interactive progress bars), and `plain` (line-by-line output for CI). Cargo automatically adapts output based on TTY detection and provides the `CARGO_TERM_PROGRESS_WHEN` environment variable for explicit control.

The hybrid approach combines environment detection with configuration flags. Provide a `--progress` flag accepting values like `auto`, `bar`, `plain`, `json`, and `quiet`, with auto mode detecting TTY and CI environment variables. GitHub Actions sets `CI=true`, while GitLab, Jenkins, and CircleCI set their own environment variables that should be checked. JSON logging mode enables machine parsing in monitoring systems, structured logging pipelines, or custom UI overlays.

Integrating logging with progress bars requires careful handling to prevent disruption. Solutions include using separate streams (progress bars on stderr, logs on stdout), suspending progress displays when logging (indicatif's `pb.suspend()` method), or using console bypass mechanisms that print above the progress bar area. For protocol discovery tools performing network scans or file analysis, showing both aggregate progress and individual item status requires multi-progress displays with one bar for overall progress and additional bars or log lines for significant events.

## Error recovery through state persistence and rollback

State persistence mechanisms enable resumable operations that survive interruptions, with temporary files and journals serving as the foundation. Cloud CLIs demonstrate sophisticated resumable upload patterns: Google Cloud's gcloud automatically manages resumable uploads for large files using chunk-based uploading with server-side state persistence via upload IDs. If an upload is interrupted, running the same command resumes from the last completed chunk rather than restarting. Oracle Cloud's oci CLI makes resume operations explicit with `oci os object resume-put --upload-id`, allowing users to track and manage interrupted uploads.

For workflow state persistence, the pattern involves storing operation state in local databases or files that capture the current stage, completed items, pending items, and any failures with error details. A practical implementation creates a state manager that loads existing state on initialization or returns empty state:

```python
class OperationState:
    def __init__(self, operation_id):
        self.operation_id = operation_id
        self.state_file = Path(f'/tmp/.cli_state_{operation_id}.pkl')
        self.state = self.load_state()
    
    def load_state(self):
        if self.state_file.exists():
            with open(self.state_file, 'rb') as f:
                return pickle.load(f)
        return {'completed': [], 'pending': [], 'failed': []}
    
    def mark_completed(self, item):
        self.state['completed'].append(item)
        self.state['pending'].remove(item)
        self.save_state()
```

Protocol discovery operations can use this pattern to store discovered protocols, review decisions, and approval status, enabling users to interrupt long-running scans and resume exactly where they left off. Clean up state files on successful completion but preserve them on failure for debugging.

**Rollback capabilities** provide safety for destructive operations, with Git's reflog serving as the gold standard. The reflog tracks all HEAD movements in `.git/logs/refs/heads/`, storing commit SHA, operation type, and timestamp with 90-day retention for reachable commits and 30-day retention for unreachable commits. Recovery operations like `git reset --hard HEAD@{2}` restore previous states, while time-based recovery enables commands like `git diff main@{0} main@{1.day.ago}`. Each ref (branch, stash) maintains its own reflog, providing comprehensive audit trails and recovery options.

Implementing transaction-like behavior requires a rollback manager that registers undo actions as operations proceed:

```python
class RollbackManager:
    def __init__(self):
        self.actions = []
    
    def add_action(self, action, description=""):
        self.actions.append((action, description))
    
    def rollback(self):
        for action, description in reversed(self.actions):
            try:
                if description:
                    logging.info(f"Rollback: {description}")
                action()
            except Exception as e:
                logging.error(f"Rollback failed: {e}")
```

When installing packages or modifying configurations, add rollback actions that restore previous state. On success, clear the rollback actions; on failure, execute them in reverse order. For protocol discovery tools, this enables safe approval workflows where users can undo approvals, regeneration of configurations with fallback to previous versions, and atomic multi-step operations.

**Graceful failure handling** requires proper error classification. Expected errors like missing files or invalid input should produce clean, actionable messages without stack traces. System errors involving network timeouts or disk issues should support retry with exponential backoff. Unexpected errors indicating bugs should log full stack traces to debug files while showing clean messages to users. Exit codes should follow conventions: 0 for success, 1-124 for application errors with specific codes for different error types (2 for config errors, 3 for network errors, 4 for auth errors).

Retry patterns with exponential backoff handle transient failures gracefully:

```python
def retry_with_backoff(max_retries=3, base_delay=1, max_delay=60):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for retry in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except RetryableError as e:
                    if retry >= max_retries - 1:
                        raise
                    delay = min(base_delay * (2 ** retry), max_delay)
                    logging.warning(f"Retry {retry+1} in {delay}s: {e}")
                    time.sleep(delay)
        return wrapper
    return decorator
```

Error messages should provide context, suggest fixes, and offer debugging commands. Instead of "Connection failed", show "Failed to connect to database at localhost:5432. Check if PostgreSQL is running with 'systemctl status postgresql'. Verify credentials in config file. Check firewall settings with 'sudo ufw status'."

Verbose logging patterns enable debugging with multiple verbosity levels: no flag shows warnings and errors, `-v` adds informational messages, `-vv` enables debug output, and `-q` suppresses everything except errors. AWS CLI's `--debug` flag exemplifies comprehensive debug output, showing CLI version, arguments entered, event hooks, HTTP requests/responses, and credential loading. For protocol discovery, debug mode should log network interactions, protocol parsing details, and decision logic for review/approval.

## Configuration management with clear precedence

Configuration precedence follows a standard hierarchy across successful CLI tools: command-line flags override everything (highest priority), followed by environment variables, project-local configuration files, user configuration files, system-wide configuration files, and finally built-in defaults (lowest priority). This ordering respects user intent, supports deployment flexibility, and enables team standardization while allowing individual customization.

Git implements a four-level hierarchy that demonstrates proper configuration layering. System-wide configuration in `/etc/gitconfig` applies to all users, user-global configuration in `~/.gitconfig` applies to the current user, repository-local configuration in `.git/config` applies to the current repository, and command-line options with `-c` override all files. Files are read in order with later values overriding earlier ones, except for multi-valued keys where all values accumulate. The command `git config --list --show-origin` reveals the effective configuration with source files, making debugging configuration issues straightforward.

**Environment variable integration** follows the 12-factor app methodology's principle of storing configuration that varies across deployments in environment variables. Credentials, resource handles, and per-deploy values belong in environment variables, while internal application structure that doesn't vary belongs in code. The litmus test: "Could the codebase be made open source without compromising credentials?" Successful tools use prefixed environment variables to avoid collisions: `AWS_ACCESS_KEY_ID`, `DOCKER_HOST`, `npm_config_registry`, converting dashes in flag names to underscores.

Docker Compose demonstrates variable interpolation with shell-style syntax supporting defaults and error handling. The expression `${TAG:-latest}` uses the TAG variable if set and non-empty, otherwise "latest". The expression `${VAR:?error message}` requires VAR to be set and non-empty, failing with an error message otherwise. This enables flexible configuration files that work across environments with minimal changes.

Configuration file formats serve different use cases. **YAML** works well for Docker Compose and Kubernetes with human-readable nested structures and comment support. **TOML** provides clear sections with strong typing, favored by Cargo and modern Rust tools. **JSON** offers universal parsing support, used by npm's package.json, though lacking comments and having strict syntax. **INI format** remains simple and widely supported, used by Git and pip with straightforward key-value pairs and section headers.

The **XDG Base Directory Specification** defines standard locations for user-specific files on Unix-like systems, preventing home directory clutter. Configuration files belong in `$XDG_CONFIG_HOME` (defaulting to `~/.config`), data files in `$XDG_DATA_HOME` (`~/.local/share`), cache files in `$XDG_CACHE_HOME` (`~/.cache`), and state files like logs in `$XDG_STATE_HOME` (`~/.local/state`). A tool named "mytool" should store its configuration in `~/.config/mytool/config.toml`, maintaining clean organization and enabling easy backup or removal.

**Configuration merging strategies** require careful consideration of merge semantics. Single-valued keys use full override where the highest-priority source wins. Multi-valued keys use additive merging where all values accumulate. Nested structures support deep merging where objects merge at each level, with later sources overriding specific keys while preserving others. kubectl demonstrates kubeconfig merging when `$KUBECONFIG` contains multiple colon-delimited files, combining clusters, users, and contexts from all files with duplicate names resolved by later files winning.

For protocol discovery tools, configuration should support global settings (timeouts, retry limits, output formats), per-project settings (target systems, protocol filters, approval workflows), and per-user settings (credentials, preferred editors, default reviewers). Store sensitive data like credentials in environment variables or secure keychains, never in version-controlled files. Provide a `config show` command displaying effective configuration with source attribution, helping users understand why specific values are being used.

Security considerations require treating secrets carefully. Store credentials in environment variables or secret management systems like AWS Secrets Manager or HashiCorp Vault. Use separate files for secrets with restricted permissions (chmod 600). Support credential helpers that integrate with system keychains. Provide .gitignore templates that exclude sensitive files like `.env.local` or `secrets.yml`. Never log or display sensitive values, and avoid transmitting secrets in command-line arguments which are visible in process lists.

## Putting patterns into practice

Building an extensible protocol discovery CLI requires synthesizing these patterns into a coherent architecture. Start with Cobra for command structure, organizing commands into logical groups: `protool discover` for protocol scanning, `protool review` for examining results, `protool approve` for marking protocols as verified, `protool generate` for producing configurations, and `protool report` for analysis output. Each command group lives in a dedicated package with clear separation between CLI logic and protocol discovery business logic.

Implement plugin discovery using Python's entry points pattern or Go's plugin system, defining interfaces for protocol importers (systems that provide protocol data), protocol analyzers (tools that enhance discovered data), approval providers (systems that track approvals), and report generators (output formats). Enable plugins to register hooks for lifecycle events: before/after discovery, during review, on approval, before generation. Version the plugin API and validate compatibility at load time.

Add progress reporting with environment detection, using the X of Y pattern for discovery progress ("Discovered 45/100 endpoints"), multi-progress bars for parallel network scans, and milestone logging in CI environments. Provide `--progress` flags for explicit control. Integrate logging that doesn't disrupt progress displays using separate streams or suspension mechanisms.

Implement state persistence for long-running discovery operations, storing partial results in `~/.local/state/protool/scans/`, enabling resume with `protool discover --resume <scan-id>`. Add rollback capabilities through operation journals, allowing `protool rollback <operation-id>` to undo approvals or regenerations. Support verbose logging with `-v` and `-vv` flags, writing debug logs to files on errors.

Design configuration following XDG standards with precedence from CLI flags → environment variables → `.protool.yml` → `~/.config/protool/config.yml` → `/etc/protool/config.yml` → defaults. Support interpolation in config files and provide `protool config show` displaying effective configuration. Store credentials in environment variables like `PROTOOL_API_TOKEN` or integrate with system keychains.

These architecture patterns, proven by tools serving millions of developers, provide a foundation for building CLI tools that start simple, scale gracefully, extend without core modifications, provide excellent user experience, and operate reliably in production environments. The key is not implementing every pattern immediately but choosing the right patterns for current needs while designing interfaces that enable future extensibility.