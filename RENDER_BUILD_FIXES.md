# Render Build Fixes - TypeScript Compilation

## Issues Fixed

### 1. TypeScript `rootDir` Configuration
**Problem**: Files outside `rootDir` were causing compilation errors.

**Fix in `server/tsconfig.json`**:
- Removed `"rootDir": "./src"` to allow compilation of files outside src directory
- Added `"baseUrl": "."` for proper path resolution
- Kept `"outDir": "./dist"` for output
- Kept `"paths": { "@shared/*": ["../shared/*"] }` for module resolution

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "outDir": "./dist",
    // REMOVED: "rootDir": "./src",
    "baseUrl": ".",  // ADDED
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  }
}
```

### 2. TypeScript Strict Mode Errors

#### Fixed Files:

1. **`src/replit_integrations/object_storage/objectStorage.ts:297`**
   - **Error**: `Property 'signed_url' does not exist on type 'unknown'`
   - **Fix**: Added type assertion for response.json()
   ```typescript
   // Before:
   const { signed_url: signedURL } = await response.json();
   return signedURL;

   // After:
   const data = await response.json() as { signed_url: string };
   return data.signed_url;
   ```

2. **`src/rpc-manager.ts:230`**
   - **Error**: `Argument of type 'Error' is not assignable to parameter of type 'string'`
   - **Fix**: Removed unnecessary `new Error()` wrapper
   ```typescript
   // Before:
   logger.error(
     new Error(`${operationName} failed after ${this.retryConfig.maxRetries} retries`),
     `RPC Manager - ${this.maskUrl(endpoint.url)}`,
     { error: lastError?.message }
   );

   // After:
   logger.error(
     `${operationName} failed after ${this.retryConfig.maxRetries} retries`,
     `RPC Manager - ${this.maskUrl(endpoint.url)}`,
     { error: lastError?.message }
   );
   ```

3. **`src/tokenDiscoveryService.ts:71-81`**
   - **Error**: `'data' is of type 'unknown'`
   - **Fix**: Added type assertions with `as any`
   ```typescript
   // Before:
   if (data.result?.content?.metadata) {
     const meta = data.result.content.metadata;
     const files = data.result.content.files || [];
     decimals: data.result.token_info?.decimals || 9,
     supply: data.result.token_info?.supply
   }

   // After:
   if ((data as any).result?.content?.metadata) {
     const meta = (data as any).result.content.metadata;
     const files = (data as any).result.content.files || [];
     decimals: (data as any).result.token_info?.decimals || 9,
     supply: (data as any).result.token_info?.supply
   }
   ```

4. **`src/transactionVerifier.ts:56`**
   - **Error**: `Type 'number | null | undefined' is not assignable to type 'number | null'`
   - **Fix**: Added nullish coalescing operator
   ```typescript
   // Before:
   blockTime: tx.blockTime,

   // After:
   blockTime: tx.blockTime ?? null,
   ```

## Testing Build

To test the build locally (from `server/` directory):

```bash
# Clean previous build
rm -rf dist

# Run TypeScript compilation
npx tsc

# Check output
ls -la dist/

# Run copy-files script
npm run copy-files

# Verify shared files copied
ls -la dist/shared/
```

## Expected Output

After successful build, you should see:

```
server/
├── dist/
│   ├── index.js
│   ├── db.js
│   ├── routes.js
│   ├── rpc-manager.js
│   ├── pool-monitor/
│   │   ├── poolMonitor.js
│   │   └── solanaServices.js
│   └── shared/          # ✅ Copied from ../shared/
│       ├── schema.js
│       ├── routes.js
│       └── idl.js
├── src/
└── tsconfig.json
```

## Render Deployment

After pushing these changes to GitHub, Render will:

1. Clone repository
2. Run `npm install` (installs TypeScript 5.6.3)
3. Run `npm run build` which executes:
   - `tsc` - Compiles TypeScript with fixed configuration
   - `npm run copy-files` - Copies shared directory to dist/shared/
4. Run `npm start` to start the server with `node dist/index.js`

## Verification

After deployment, check Render logs for:

```
✅ Build successful
[ENV] ✅ Production mode - using system environment variables
[SECURITY] ✅ CORS enabled for origin: https://your-frontend.vercel.app
[MONITOR] ✅ Solana services initialized
info: Server started successfully
```

## Remaining Environment Variables

Ensure these are set in Render Dashboard → Environment:

- `DATABASE_URL` - Neon PostgreSQL connection string
- `DIRECT_DATABASE_URL` - Same as DATABASE_URL for Neon
- `REDIS_URL` - Upstash Redis connection string
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `DEV_WALLET_PRIVATE_KEY` - Development wallet private key (base58)
- `TREASURY_WALLET_PUBKEY` - Treasury wallet public key
- `FRONTEND_URL` - Frontend origin for CORS (e.g., https://your-app.vercel.app)
- `NODE_ENV=production`
- `PORT=5000` (automatically set by Render)

## Next Steps

1. ✅ Commit and push changes to GitHub
2. ✅ Render will auto-deploy on push
3. ✅ Check Render logs for successful build
4. ✅ Test health endpoint: `curl https://your-backend.onrender.com/health`
5. ✅ Test API: `curl https://your-backend.onrender.com/api/pools`
