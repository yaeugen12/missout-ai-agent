#!/bin/bash
set -e

echo "🦀 Installing Rust for token analyzer..."

# Install Rust if not already installed
if ! command -v cargo &> /dev/null; then
    echo "Installing rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust already installed"
fi

# Verify installation
cargo --version
rustc --version

# Build the Rust analyzer
echo "🔨 Building Rust token analyzer..."
cd rust-analyzer
cargo build --release

# Verify binary was created
if [ -f "target/release/analyze-token" ]; then
    echo "✅ Rust analyzer built successfully"
    ls -lh target/release/analyze-token
else
    echo "❌ Failed to build Rust analyzer"
    exit 1
fi
