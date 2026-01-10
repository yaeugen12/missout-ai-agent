# 🔧 Fix pentru "504 Outdated Optimize Dep"

## Problema
Frontend arată ecran alb și eroarea în consolă:
```
Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)
GET http://localhost:5173/node_modules/.vite/deps/@sentry_react.js?v=27a60a78 net::ERR_ABORTED 504
```

## Soluție Aplicată

### ✅ Ce Am Făcut Deja
1. Șters cache-ul Vite (`.vite` și `node_modules/.vite`)
2. Actualizat `vite.config.ts` cu `optimizeDeps.force = true`

### 📋 Comenzi de Rulat

#### **Pas 1: Oprește serverul Vite** (Ctrl+C în terminal)

#### **Pas 2: Șterge toate cache-urile**
```bash
cd ~/missout/client
rm -rf .vite node_modules/.vite dist
```

#### **Pas 3: Pornește din nou frontend-ul**
```bash
npm run dev
```

#### **Pas 4: După prima rulare reușită**
După ce vezi aplicația încărcată complet **FĂRĂ** erori, editează `vite.config.ts`:

Schimbă linia 26 din:
```typescript
    force: true,
```

În:
```typescript
    force: false,  // Dezactivat după prima rulare reușită
```

Acest lucru va face Vite să ruleze mai rapid la următoarele porniri.

---

## 🔍 Ce Face `optimizeDeps`?

```typescript
optimizeDeps: {
  include: [
    'react',           // React core
    'react-dom',       // React DOM
    '@sentry/react',   // Sentry error tracking
    '@solana/web3.js', // Solana SDK
    '@solana/wallet-adapter-react', // Wallet adapters
    '@coral-xyz/anchor', // Anchor framework
  ],
  force: true,  // Forțează re-optimizarea (doar prima dată)
}
```

Aceasta forțează Vite să:
1. Pre-optimizeze toate dependințele listate
2. Creeze bundle-uri ESM compatibile
3. Cache-eze corect pentru încărcări rapide

---

## 🎯 Rezultat Așteptat

După ce rulezi comenzile, ar trebui să vezi:
- ✅ Vite construiește cache-ul de dependințe (~30 secunde)
- ✅ Server pornește pe `http://localhost:5173`
- ✅ **FĂRĂ** erori 504 în consolă
- ✅ Aplicația se încarcă cu theme-ul cyberpunk (dark background, cyan/purple)

---

## ⚠️ Dacă Tot Vezi Erori

Rulează:
```bash
cd ~/missout/client
rm -rf node_modules package-lock.json .vite
npm cache clean --force
npm install
npm run dev
```

Aceasta va reinstala complet toate dependințele.
