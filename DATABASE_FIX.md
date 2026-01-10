# 🔧 Fix Database Schema - Add Missing Columns

## Problema
Backend-ul se oprește cu eroarea:
```
error: column "pool_id" of relation "used_transactions" does not exist
```

## Ce Am Făcut

✅ **Actualizat** `shared/schema.ts` - Adăugat coloane lipsă în tabela `used_transactions`:
- `poolId` - integer (optional)
- `operationType` - text (optional)
- `usedAt` - timestamp (default now)

✅ **Fixat** `server/drizzle.config.ts` - Corectat calea către schema (`../shared/schema.ts`)

## 📋 Comenzi de Rulat

### **Pas 1: Generează migrarea**
```bash
cd ~/missout/server
npm run db:generate
```

Aceasta va crea un fișier de migrare în `drizzle/migrations/` bazat pe schimbările din schema.

### **Pas 2: Aplică migrarea la database**
```bash
npm run db:push
```

Aceasta va executa SQL-ul pentru a adăuga coloanele lipsă la tabela `used_transactions`.

### **Pas 3: Repornește backend-ul**
```bash
npm run dev
```

Backend-ul ar trebui să pornească **FĂRĂ** erori de database.

---

## 🎯 Verificare

După ce aplici migrarea, backend-ul ar trebui să afișeze:
```
✅ Server started successfully
✅ Database connection verified
✅ Pool Monitor started
```

**FĂRĂ** erori de tipul:
```
❌ column "pool_id" of relation "used_transactions" does not exist
❌ Unhandled Rejection
```

---

## 🔍 Ce Face Migrarea?

Migrarea va executa SQL similar cu:
```sql
ALTER TABLE used_transactions
ADD COLUMN pool_id INTEGER,
ADD COLUMN operation_type TEXT,
ADD COLUMN used_at TIMESTAMP DEFAULT NOW();
```

Aceasta adaugă coloanele noi fără să șteargă datele existente.

---

## ⚠️ Dacă `npm run db:generate` Nu Există

Adaugă scripturile în `server/package.json`:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

Apoi rulează din nou `npm run db:generate` și `npm run db:push`.

---

## 📝 Schema Actualizată

```typescript
export const usedTransactions = pgTable("used_transactions", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").notNull().unique(),
  poolId: integer("pool_id"),                    // ✅ ADĂUGAT
  walletAddress: text("wallet_address").notNull(),
  operationType: text("operation_type"),         // ✅ ADĂUGAT
  usedAt: timestamp("used_at").defaultNow(),     // ✅ ADĂUGAT
  createdAt: timestamp("created_at").defaultNow(),
});
```
