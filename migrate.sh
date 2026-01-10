#!/bin/bash

# Missout - Automated Migration Script
# Moves files from old structure to new split monorepo

set -e  # Exit on error

echo "🚀 Starting Missout Project Migration..."
echo ""

# Step 1: Create directory structure
echo "📁 Creating new directory structure..."
mkdir -p server/src
mkdir -p client/src
mkdir -p shared

# Step 2: Move server files
echo "📦 Moving backend files to server/src/..."

# Move main server files
if [ -d "server" ]; then
    # Move TypeScript files
    find server -maxdepth 1 -name "*.ts" -exec mv {} server/src/ \;

    # Move directories
    [ -d "server/pool-monitor" ] && mv server/pool-monitor server/src/
    [ -d "server/replit_integrations" ] && mv server/replit_integrations server/src/
    [ -d "server/ml" ] && mv server/ml server/src/

    echo "  ✅ Moved server/*.ts to server/src/"
    echo "  ✅ Moved server/pool-monitor to server/src/pool-monitor"
    echo "  ✅ Moved server/ml to server/src/ml"
fi

# Move drizzle config to server
[ -f "drizzle.config.ts" ] && cp drizzle.config.ts server/

# Step 3: Verify client structure
echo "📦 Verifying frontend structure..."
if [ -d "client/src" ]; then
    echo "  ✅ Client structure already correct"
else
    echo "  ⚠️  Client structure needs manual verification"
fi

# Step 4: Move shared files
echo "📦 Moving shared types..."
if [ -d "shared" ]; then
    echo "  ✅ Shared directory already in place"
else
    echo "  ⚠️  Create shared/ directory and add routes.ts, schema.ts"
fi

# Step 5: Create .env files
echo "📝 Creating environment files..."

# Backend .env
if [ ! -f "server/.env" ]; then
    cp server/.env.example server/.env 2>/dev/null || echo "DATABASE_URL=
REDIS_URL=
SOLANA_RPC_URL=" > server/.env
    echo "  ✅ Created server/.env (update with your credentials)"
fi

# Frontend .env
if [ ! -f "client/.env" ]; then
    cp client/.env.example client/.env 2>/dev/null || echo "VITE_API_URL=http://localhost:5000
VITE_SOLANA_NETWORK=devnet" > client/.env
    echo "  ✅ Created client/.env"
fi

# Step 6: Install dependencies
echo ""
echo "📦 Installing dependencies..."

# Root
if [ -f "package.json" ]; then
    echo "  Installing root dependencies..."
    npm install
fi

# Backend
echo "  Installing backend dependencies..."
cd server
npm install
cd ..

# Frontend
echo "  Installing frontend dependencies..."
cd client
npm install
cd ..

echo ""
echo "✅ Migration complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Update import paths in server/src/*.ts files (add .js extension)"
echo "  2. Update API calls in client/src/**/*.ts files (use VITE_API_URL)"
echo "  3. Update server/.env with your credentials"
echo "  4. Run: cd server && npm run dev (in terminal 1)"
echo "  5. Run: cd client && npm run dev (in terminal 2)"
echo ""
echo "📚 See MIGRATION_GUIDE.md for detailed instructions"
