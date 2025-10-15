# OSSP-AGI Quickstart Guide

Get up and running with OSSP-AGI in under 2 minutes using our interactive quickstart wizard.

## Prerequisites

- Node.js 18 or higher
- Git (optional but recommended)
- Basic familiarity with command line

## Quick Start (2 minutes)

### Option 1: Interactive Wizard (Recommended)

```bash
# Run the interactive quickstart wizard
ossp quickstart
```

The wizard will guide you through:
1. **Project Setup** - Choose a name and template
2. **Template Selection** - Pick from microservices, API discovery, or event-driven patterns
3. **Configuration** - Enable governance docs and test scaffolds
4. **Validation** - Automatic setup verification

### Option 2: Command Line

```bash
# Quick setup with microservices template
ossp quickstart --template microservices --name my-project

# API discovery only
ossp quickstart --template api-discovery --name my-api-project

# Event-driven architecture
ossp quickstart --template event-driven --name my-event-project
```

## What Gets Created

The quickstart creates a complete project structure:

```
my-project/
├── package.json              # Project configuration
├── .gitignore               # Git ignore rules
├── README.md                # Project documentation
├── artifacts/                # Protocol artifacts
│   ├── service-a-protocol.json
│   ├── service-b-protocol.json
│   └── service-c-protocol.json
├── workflows/                # Workflow definitions
│   └── microservices-integration.yaml
└── GOVERNANCE.md            # Generated governance docs
```

## Next Steps

After quickstart completes:

1. **Navigate to your project:**
   ```bash
   cd my-project
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Validate your setup:**
   ```bash
   npm run validate
   ```

4. **Generate governance documentation:**
   ```bash
   npm run governance
   ```

5. **Explore the examples:**
   ```bash
   # List available protocols
   ls artifacts/
   
   # View a protocol
   cat artifacts/service-a-protocol.json
   
   # Check workflow
   cat workflows/microservices-integration.yaml
   ```

## Templates Explained

### Microservices Integration Pattern

**Best for:** Multi-service architectures, API composition, service orchestration

**Includes:**
- 3 example microservices (User Management, Order Management, Payment Processing)
- Cross-service dependencies and validation
- Workflow orchestration example
- Governance documentation

**Use cases:**
- E-commerce platforms
- Multi-tenant SaaS applications
- Service mesh architectures
- API gateway patterns

### API Discovery Only

**Best for:** Single service API documentation, contract-first development

**Includes:**
- Basic API protocol template
- OpenAPI specification structure
- Validation framework
- Documentation generation

**Use cases:**
- REST API documentation
- Contract testing
- API versioning strategies
- Developer onboarding

### Event-Driven Architecture

**Best for:** Asynchronous systems, event streaming, message-driven architectures

**Includes:**
- Event schema definitions
- Producer/consumer patterns
- Event sourcing examples
- Message validation

**Use cases:**
- Real-time applications
- Microservices communication
- Data streaming pipelines
- Event-driven workflows

## Common Commands

### Discovery Commands

```bash
# Discover API from OpenAPI spec
ossp discover api https://api.example.com/openapi.json

# Discover from local file
ossp discover api ./local-spec.json

# List available test files
ossp discover list
```

### Validation Commands

```bash
# Validate single protocol
ossp validate ./artifacts/my-protocol.json

# Validate entire ecosystem
ossp validate --ecosystem

# Validate with detailed output
ossp validate --ecosystem --verbose
```

### Governance Commands

```bash
# Generate governance documentation
ossp governance

# Generate with specific sections
ossp governance --sections security,metrics

# Update existing governance doc
ossp governance --update
```

### Workflow Commands

```bash
# Validate workflow
ossp workflow validate ./workflows/my-workflow.yaml

# Simulate workflow execution
ossp workflow simulate ./workflows/my-workflow.yaml

# List workflow examples
ossp workflow examples
```

## Troubleshooting

### Common Issues

**"Node.js version too old"**
```bash
# Check Node.js version
node --version

# Install Node.js 18+ from https://nodejs.org
```

**"Permission denied"**
```bash
# Fix file permissions
chmod +x node_modules/.bin/ossp

# Or run with sudo (not recommended)
sudo ossp quickstart
```

**"Network connectivity issues"**
```bash
# Check internet connection
ping google.com

# Try with verbose output
ossp quickstart --verbose
```

**"Git repository issues"**
```bash
# Initialize git repository
git init

# Or skip git integration
ossp quickstart --no-git
```

### Getting Help

```bash
# Show help
ossp --help

# Show command-specific help
ossp discover --help
ossp validate --help
ossp governance --help

# Verbose output for debugging
ossp quickstart --verbose
```

## Advanced Usage

### Custom Templates

Create your own templates by extending the existing ones:

```bash
# Copy template directory
cp -r examples/microservices-pattern my-custom-template

# Modify template files
# ...

# Use custom template
ossp quickstart --template ./my-custom-template
```

### Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/validate.yml
name: Validate Protocols
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: ossp validate --ecosystem
```

### IDE Integration

**VS Code:**
- Install JSON language support
- Use protocol validation extensions
- Configure workspace settings

**IntelliJ/WebStorm:**
- Enable JSON schema validation
- Configure file associations
- Use protocol-specific plugins

## Performance Tips

- Use `--no-tests` for faster setup
- Skip governance generation with `--no-governance`
- Use local templates for offline development
- Enable caching for repeated operations

## Security Considerations

- Never commit sensitive data to protocol files
- Use environment variables for API keys
- Validate all external API specifications
- Review generated governance documentation

## Support

- **Documentation:** [docs/](docs/)
- **Examples:** [examples/](examples/)
- **Issues:** [GitHub Issues](https://github.com/your-org/ossp-agi/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/ossp-agi/discussions)

## What's Next?

After completing quickstart:

1. **Explore Examples** - Check out the `examples/` directory
2. **Read Documentation** - Browse `docs/` for detailed guides
3. **Join Community** - Participate in discussions and issues
4. **Contribute** - Help improve OSSP-AGI with your feedback

Happy protocol discovery! 🚀
