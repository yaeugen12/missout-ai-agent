#!/bin/bash

# Fix TypeScript strict mode errors for Render deployment

echo "Fixing TypeScript errors..."

# Fix 1: objectStorage.ts - line 297
sed -i '297s/.*const { signed_url: signedURL } = await response.json();/  const data = await response.json() as { signed_url: string };/' src/replit_integrations/object_storage/objectStorage.ts
sed -i '298s/.*return signedURL;/  return data.signed_url;/' src/replit_integrations/object_storage/objectStorage.ts

# Fix 2: rpc-manager.ts - line 230
sed -i '230s/.*new Error.*$/        \`${operationName} failed after ${this.retryConfig.maxRetries} retries\`,/' src/rpc-manager.ts

# Fix 3: tokenDiscoveryService.ts - lines 71-81
sed -i '71s/.*if (data.result?.content?.metadata) {/    if ((data as any).result?.content?.metadata) {/' src/tokenDiscoveryService.ts
sed -i '72s/.*const meta = data.result.content.metadata;/      const meta = (data as any).result.content.metadata;/' src/tokenDiscoveryService.ts
sed -i '73s/.*const files = data.result.content.files || \[\];/      const files = (data as any).result.content.files || [];/' src/tokenDiscoveryService.ts
sed -i '79s/.*decimals: data.result.token_info?.decimals || 9,/        decimals: (data as any).result.token_info?.decimals || 9,/' src/tokenDiscoveryService.ts
sed -i '81s/.*supply: data.result.token_info?.supply/        supply: (data as any).result.token_info?.supply/' src/tokenDiscoveryService.ts

# Fix 4: transactionVerifier.ts - line 56
sed -i '56s/.*blockTime: tx.blockTime,/      blockTime: tx.blockTime ?? null,/' src/transactionVerifier.ts

echo "All TypeScript errors fixed!"
echo "Running build test..."

cd /home/meme_lottery/missout/server
npm run build
