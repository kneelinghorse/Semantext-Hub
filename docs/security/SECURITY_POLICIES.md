# Security Policies

This document outlines the security policies and guardrails implemented for the OSSP-AGI project to detect secrets, disallowed licenses, and security vulnerabilities in protocol artifacts.

## Overview

The security scanning system provides comprehensive protection against:
- **Secrets**: API keys, passwords, tokens, and other sensitive credentials
- **License Violations**: Disallowed licenses that could create legal issues
- **Security Vulnerabilities**: Code patterns that could lead to security exploits

## Security Scan Command

### Usage

```bash
# Scan current directory
node cli/commands/security-scan.js

# Scan specific file or directory
node cli/commands/security-scan.js --target ./protocols

# Generate detailed report
node cli/commands/security-scan.js --target . --format detailed --output security-report.md

# Allow violations (for testing)
node cli/commands/security-scan.js --target . --allow-violations
```

### Options

- `--target <path>`: Target file or directory to scan (default: current directory)
- `--allow-violations`: Allow security violations without failing
- `--output <file>`: Output file path for reports
- `--format <format>`: Output format (summary, detailed, json, github)
- `--policy <name>`: Security policy to use (default: default)
- `--verbose`: Show detailed output

## Detected Patterns

### Secrets Detection

The scanner detects the following secret patterns:

#### API Keys and Tokens
- `api_key`, `apikey`, `api-key`
- `secret_key`, `secretkey`, `secret-key`
- `access_token`, `accesstoken`, `access-token`
- `bearer_token`, `bearertoken`, `bearer-token`
- `jwt_token`, `jwttoken`, `jwt-token`
- `oauth_token`, `oauthtoken`, `oauth-token`

#### Passwords and Credentials
- `password`, `passwd`, `pwd`
- `private_key`, `privatekey`, `private-key`

#### Pattern Matching
- Minimum length: 20 characters for keys/tokens
- Minimum length: 8 characters for passwords
- Supports various delimiters: `:`, `=`, quotes, spaces

### License Violations

#### Disallowed Licenses
The following licenses are **disallowed** and will trigger violations:
- `GPL-2.0`, `GPL-3.0` (GNU General Public License)
- `AGPL-1.0`, `AGPL-3.0` (GNU Affero General Public License)
- `Copyleft` (Any copyleft license)
- `CC-BY-NC`, `CC-BY-NC-SA`, `CC-BY-NC-ND` (Creative Commons Non-Commercial)

#### Allowed Licenses
The following licenses are **allowed**:
- `MIT` (MIT License)
- `Apache-2.0` (Apache License 2.0)
- `BSD-2-Clause`, `BSD-3-Clause` (BSD Licenses)
- `ISC` (ISC License)
- `Unlicense` (Unlicense)
- `CC0-1.0` (Creative Commons Zero)
- `CC-BY`, `CC-BY-SA` (Creative Commons)

### Security Vulnerabilities

#### Code Injection Risks
- `eval()` function calls
- `Function()` constructor
- `setTimeout()` with string arguments
- `setInterval()` with string arguments

#### XSS Risks
- `innerHTML` assignments
- `outerHTML` assignments
- `document.write()` calls
- `document.writeln()` calls

#### HTTP Dependencies
- `require('http')` imports
- `import ... from 'http'` statements

## Pre-commit Hook

### Installation

The pre-commit security hook is automatically installed and runs on every commit:

```bash
# The hook is located at:
app/scripts/hooks/pre-commit-security

# Make it executable (if not already):
chmod +x app/scripts/hooks/pre-commit-security
```

### Behavior

1. **Automatic Detection**: Scans all staged files for security violations
2. **Blocking**: Prevents commits with security violations
3. **Bypass**: Use `git commit --no-verify` to bypass (not recommended)

### Hook Output

The hook provides clear feedback:
- ✅ **Success**: No violations detected
- ❌ **Failure**: Violations found with detailed report
- ⚠️ **Warning**: Skip conditions (not in git repo, no relevant files)

## CI/CD Integration

### GitHub Actions Workflow

The security scan is integrated into the CI/CD pipeline via `security-scan.yml`:

```yaml
name: Security Scan

on:
  pull_request:
    paths:
      - '**/*.js'
      - '**/*.ts'
      - '**/*.json'
      - '**/*.yaml'
      - '**/*.yml'
      - 'artifacts/**'
      - 'protocols/**'
    types: [opened, synchronize, reopened]
```

### Workflow Features

1. **Automatic Triggering**: Runs on PR creation and updates
2. **File Filtering**: Only scans relevant files
3. **PR Comments**: Posts detailed violation reports
4. **Failure on Violations**: Fails the build if violations are found
5. **Artifact Upload**: Saves scan reports as artifacts

### PR Integration

The workflow automatically:
- Comments on PRs with violation details
- Fails the build on security violations
- Provides remediation guidance
- Links to security policies

## Custom Policies

### Policy Configuration

Create a `security-policies.json` file in the project root to customize policies:

```json
{
  "secrets": {
    "patterns": [
      {
        "pattern": "your-custom-pattern",
        "description": "Custom secret pattern"
      }
    ],
    "severity": "high"
  },
  "licenses": {
    "disallowed": ["CUSTOM-DISALLOWED"],
    "allowed": ["CUSTOM-ALLOWED"],
    "severity": "medium"
  },
  "vulnerabilities": {
    "patterns": [
      {
        "pattern": "your-vulnerability-pattern",
        "description": "Custom vulnerability"
      }
    ],
    "severity": "high"
  }
}
```

### Policy Inheritance

Custom policies inherit from default policies and override matching sections.

## Severity Levels

### High Severity
- **Secrets**: API keys, passwords, tokens
- **Vulnerabilities**: Code injection, XSS risks
- **Action**: Block commit, fail CI/CD

### Medium Severity
- **License Violations**: Disallowed licenses
- **Action**: Block commit, fail CI/CD

### Low Severity
- **Policy Violations**: Minor policy deviations
- **Action**: Warning only, allow commit

## Remediation

### Common Violations

#### Secret Detection
```bash
# Remove or replace the secret
# Use environment variables instead
export API_KEY="your-secret-key"
```

#### License Violations
```bash
# Replace disallowed license
# Use MIT or Apache-2.0 instead
```

#### Vulnerability Fixes
```bash
# Replace eval() with safer alternatives
# Use proper DOM manipulation
# Validate HTTP dependencies
```

### Bypass Options

#### Development
```bash
# Use --allow-violations flag
node cli/commands/security-scan.js --target . --allow-violations
```

#### Emergency
```bash
# Bypass pre-commit hook
git commit --no-verify -m "Emergency commit"
```

## Best Practices

### Development Workflow

1. **Pre-commit**: Always run security checks before committing
2. **CI/CD**: Let automated scans catch violations
3. **Review**: Manually review security reports
4. **Remediate**: Fix violations promptly

### Security Guidelines

1. **No Secrets**: Never commit secrets to version control
2. **License Compliance**: Use only allowed licenses
3. **Secure Coding**: Follow secure coding practices
4. **Regular Updates**: Keep security policies updated

### Policy Maintenance

1. **Regular Review**: Review and update policies quarterly
2. **Pattern Updates**: Add new patterns as threats evolve
3. **Team Training**: Educate team on security policies
4. **Documentation**: Keep this document current

## Troubleshooting

### Common Issues

#### Hook Not Running
```bash
# Check if hook is executable
ls -la app/scripts/hooks/pre-commit-security

# Make executable if needed
chmod +x app/scripts/hooks/pre-commit-security
```

#### False Positives
```bash
# Use custom policies to exclude patterns
# Create security-policies.json with exclusions
```

#### Performance Issues
```bash
# Use --target to limit scan scope
# Use --format json for faster processing
```

### Support

For security policy questions or issues:
1. Check this documentation
2. Review security scan output
3. Consult the development team
4. Create an issue in the project repository

## Changelog

### Version 1.0.0 (B11.7)
- Initial security policy implementation
- Secret detection patterns
- License violation checking
- Vulnerability scanning
- Pre-commit hook integration
- CI/CD workflow implementation

---

*This document is part of the OSSP-AGI security framework. For updates and questions, refer to the project documentation.*
