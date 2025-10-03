#!/bin/bash

# Simple CMOS Project Installer
# For new projects - copies starter files to target directory

set -e

usage() {
    echo "Usage: $0 /path/to/new/project"
    echo ""
    echo "Installs CMOS (Context + Mission Orchestration System) to a new project directory"
    echo ""
    echo "For existing projects, use the migration tool instead:"
    echo "  node smart_migrate.js migrate /path/to/existing/project"
}

if [ "$#" -ne 1 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    usage
    exit 0
fi

TARGET_DIR="$1"

# Check if target exists and is not empty
if [ -d "$TARGET_DIR" ] && [ "$(ls -A "$TARGET_DIR")" ]; then
    echo "⚠️  Warning: Target directory is not empty!"
    echo ""
    echo "For existing projects, use migration instead:"
    echo "  node smart_migrate.js migrate $TARGET_DIR"
    echo ""
    read -p "Continue with fresh installation? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled"
        exit 1
    fi
fi

echo "🚀 Installing CMOS..."
echo "Target: $TARGET_DIR"

# Create target directory
mkdir -p "$TARGET_DIR"

# Copy all starter files
echo "📦 Copying starter files..."
cp -r ./* "$TARGET_DIR/" 2>/dev/null || true
cp -r ./.[^.]* "$TARGET_DIR/" 2>/dev/null || true

# Remove this installer script and test files from target
rm -f "$TARGET_DIR/install.sh"
rm -f "$TARGET_DIR/test_migration.sh"
rm -f "$TARGET_DIR/install_migration.sh"  # Remove old migration script
rm -f "$TARGET_DIR/migration_tool.js"     # Remove old migration tool

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  cd $TARGET_DIR"
echo "  python3 project_context.py init"
echo ""
echo "For help:"
echo "  python3 project_context.py --help"
