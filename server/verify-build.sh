#!/bin/bash
# Verify build structure for debugging

echo "=== Build Verification ==="
echo "Current directory: $(pwd)"
echo ""
echo "Contents of dist/:"
ls -la dist/ 2>/dev/null || echo "dist/ does not exist!"
echo ""
echo "Looking for index.js:"
find dist/ -name "index.js" 2>/dev/null || echo "index.js not found!"
echo ""
echo "First 10 .js files in dist/:"
find dist/ -name "*.js" 2>/dev/null | head -10
