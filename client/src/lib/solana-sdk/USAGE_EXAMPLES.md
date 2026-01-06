# SDK Usage Examples

Exemple practice de utilizare a SDK-ului MissOut după migrarea la noul IDL.

## 📦 Import

```typescript
import {
  getMissoutClient,
  createPool,
  joinPool,
  donateToPool,
  // Instrucțiuni noi
  pausePool,
  unpausePool,
  adminClosePool,
  // Events
  createEventListener,
  ActionType,
  // Errors
  MissoutErrorCode,
  isPoolFullError,
  parseProgramError,
} from '@/lib/solana-sdk';
```

## 🎯 1. Client Setup

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

function MyComponent() {
  const wallet = useWallet();
  const client = getMissoutClient();

  // Set wallet când se conectează
  useEffect(() => {
    if (wallet) {
      client.setWallet(wallet);
    }
  }, [wallet]);

  // Client este gata!
  const isReady = client.isReady();
}
```

## 🏊 2. Citire Pool State (cu noile câmpuri)

```typescript
async function getPoolDetails(poolId: string) {
  const client = getMissoutClient();
  const pool = await client.getPoolState(poolId);

  if (!pool) {
    console.error('Pool not found');
    return;
  }

  // Câmpuri vechi (funcționează ca înainte)
  console.log('Creator:', pool.creator.toBase58());
  console.log('Amount:', pool.amount.toString());
  console.log('Max Participants:', pool.maxParticipants);

  // ✨ CÂMPURI NOI disponibile acum:
  console.log('Pool ID (numeric):', pool.poolId.toString());
  console.log('Start Time:', new Date(pool.startTime.toNumber() * 1000));
  console.log('End Time:', new Date(pool.endTime.toNumber() * 1000));
  console.log('Total Joins:', pool.totalJoins);
  console.log('Total Donations:', pool.totalDonations);
  console.log('Total Amount:', pool.totalAmount.toString());
  console.log('Total Volume:', pool.totalVolume.toString());
  console.log('Is Paused:', pool.paused);
  console.log('Last Join Time:', new Date(pool.lastJoinTime.toNumber() * 1000));
  console.log('Status Reason:', pool.statusReason);
  console.log('Randomness:', pool.randomness.toString());
}
```

## 👥 3. Citire Participants (array fix [20])

```typescript
async function getParticipantsList(poolId: string) {
  const client = getMissoutClient();
  const participants = await client.getParticipantsState(poolId);

  if (!participants) {
    console.log('No participants yet');
    return;
  }

  // ✨ Array-ul este deja filtrat (fără pubkeys default)
  console.log('Total participants:', participants.count);
  console.log('Participant list:', participants.list.length);

  participants.list.forEach((pk, index) => {
    console.log(`#${index + 1}: ${pk.toBase58()}`);
  });
}
```

## 🆕 4. Folosire Instrucțiuni Noi

### Pause/Unpause Pool

```typescript
async function togglePause(poolId: string, shouldPause: boolean) {
  try {
    const result = shouldPause
      ? await pausePool(poolId)
      : await unpausePool(poolId);

    console.log('Pool paused/unpaused:', result.tx);
    return result.tx;
  } catch (err) {
    console.error('Failed to toggle pause:', err);
    throw err;
  }
}
```

### Admin Close Pool

```typescript
async function closePoolAsAdmin(poolId: string) {
  try {
    const result = await adminClosePool(poolId);
    console.log('Pool closed by admin:', result.tx);
    return result.tx;
  } catch (err) {
    if (isUnauthorizedError(err)) {
      console.error('Not authorized to close this pool');
    }
    throw err;
  }
}
```

### Set Lock Duration

```typescript
async function updateLockDuration(poolId: string, newDurationSeconds: number) {
  try {
    const result = await setLockDuration(poolId, newDurationSeconds);
    console.log('Lock duration updated:', result.tx);
    return result.tx;
  } catch (err) {
    const parsed = parseProgramError(err);
    if (parsed?.code === MissoutErrorCode.CannotChangeAfterJoins) {
      console.error('Cannot change lock duration after participants joined');
    }
    throw err;
  }
}
```

### Force Expire

```typescript
async function expirePool(poolId: string) {
  const result = await forceExpire(poolId);
  console.log('Pool expired:', result.tx);
  return result.tx;
}
```

### Sweep Expired Pool

```typescript
async function cleanupExpiredPool(poolId: string) {
  const result = await sweepExpiredPool(poolId);
  console.log('Expired pool cleaned up:', result.tx);
  return result.tx;
}
```

### Finalize Forfeited Pool

```typescript
async function forfeitToTreasury(poolId: string) {
  const result = await finalizeForfeitedPool(poolId);
  console.log('Pool forfeited to treasury:', result.tx);
  return result.tx;
}
```

## 🎧 5. Event Listening

### Real-time Events

```typescript
import { createEventListener, type MissoutEvent } from '@/lib/solana-sdk';

function usePoolEvents(poolId?: string) {
  const client = getMissoutClient();
  const [events, setEvents] = useState<MissoutEvent[]>([]);

  useEffect(() => {
    const listener = createEventListener(client.getConnection());

    // Subscribe la evenimente
    const subscriptionId = listener.subscribe(
      (event) => {
        console.log('New event:', event.type, event.data);

        // Filtrare pe pool specific
        if (poolId && 'pool' in event.data) {
          if (event.data.pool.toBase58() === poolId) {
            setEvents((prev) => [...prev, event]);
          }
        }

        // Handle specific events
        switch (event.type) {
          case 'PoolActivityEvent':
            if (event.data.action === ActionType.Joined) {
              console.log('User joined pool!');
            }
            break;

          case 'WinnerSelectedEvent':
            console.log('Winner selected:', event.data.winner.toBase58());
            console.log('Total amount:', event.data.totalAmount.toString());
            break;

          case 'PoolStateEvent':
            console.log('Pool status changed:', event.data.newStatus);
            break;
        }
      },
      (error) => {
        console.error('Event error:', error);
      }
    );

    // Cleanup
    return () => {
      listener.unsubscribe();
    };
  }, [poolId]);

  return events;
}
```

### Fetch Historical Events

```typescript
async function getPoolHistory(poolId: string) {
  const client = getMissoutClient();
  const listener = createEventListener(client.getConnection());

  try {
    const events = await listener.fetchPoolEvents(
      new PublicKey(poolId),
      100 // limit
    );

    console.log(`Found ${events.length} historical events`);

    events.forEach((event) => {
      console.log(`Event: ${event.type}`);
      if (event.type === 'PoolActivityEvent') {
        console.log(`  Action: ${event.data.action}`);
        console.log(`  User: ${event.data.user.toBase58()}`);
        console.log(`  Amount: ${event.data.amount.toString()}`);
      }
    });

    return events;
  } catch (err) {
    console.error('Failed to fetch events:', err);
    return [];
  }
}
```

## ❌ 6. Error Handling

```typescript
import {
  MissoutErrorCode,
  parseProgramError,
  isPoolFullError,
  isPoolClosedError,
  isPausedError,
} from '@/lib/solana-sdk';

async function safeJoinPool(poolId: string, amount: string) {
  try {
    const result = await joinPool({ poolId, amount });
    return result;
  } catch (err: any) {
    // Parse program error
    const programError = parseProgramError(err);

    if (programError) {
      console.log('Program error code:', programError.code);
      console.log('Error message:', programError.message);

      // Helper functions pentru common errors
      if (isPoolFullError(err)) {
        alert('Pool is full - maximum participants reached');
      } else if (isPoolClosedError(err)) {
        alert('Pool is closed and cannot accept new participants');
      } else if (isPausedError(err)) {
        alert('Pool is currently paused');
      } else if (programError.code === MissoutErrorCode.AlreadyParticipated) {
        alert('You have already joined this pool');
      } else if (programError.code === MissoutErrorCode.PoolLockedForJoin) {
        alert('Pool lock has started - joining is no longer allowed');
      } else if (programError.code === MissoutErrorCode.InsufficientFunds) {
        alert('Insufficient funds in your wallet');
      }
    } else {
      // Generic error (wallet, network, etc.)
      console.error('Non-program error:', err.message);
      alert('Transaction failed: ' + err.message);
    }

    throw err;
  }
}
```

## 🎨 7. React Hook Example

```typescript
import { useQuery } from '@tanstack/react-query';

function usePoolData(poolId: string | undefined) {
  const client = getMissoutClient();

  return useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      if (!poolId) return null;

      const [pool, participants] = await Promise.all([
        client.getPoolState(poolId),
        client.getParticipantsState(poolId),
      ]);

      return {
        pool,
        participants,
        // ✨ Noile câmpuri sunt disponibile automat
        stats: pool
          ? {
              totalJoins: pool.totalJoins,
              totalDonations: pool.totalDonations,
              totalVolume: pool.totalVolume.toString(),
              isPaused: pool.paused,
              lastActivity: new Date(pool.lastJoinTime.toNumber() * 1000),
            }
          : null,
      };
    },
    enabled: !!poolId,
    refetchInterval: 5000, // Refresh every 5s
  });
}

// Usage
function PoolDetails({ poolId }: { poolId: string }) {
  const { data, isLoading, error } = usePoolData(poolId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data?.pool) return <div>Pool not found</div>;

  return (
    <div>
      <h2>Pool Stats</h2>
      <p>Total Joins: {data.stats?.totalJoins}</p>
      <p>Total Donations: {data.stats?.totalDonations}</p>
      <p>Total Volume: {data.stats?.totalVolume}</p>
      <p>Paused: {data.stats?.isPaused ? 'Yes' : 'No'}</p>
      <p>Participants: {data.participants?.count || 0}</p>
    </div>
  );
}
```

## 🔧 8. TypeScript Types

Toate tipurile sunt exportate și pot fi folosite în cod:

```typescript
import type {
  PoolState,
  ParticipantsState,
  MissoutEvent,
  PoolActivityEvent,
  WinnerSelectedEvent,
  CreatePoolParams,
} from '@/lib/solana-sdk';

// Use in function signatures
function processPoolState(pool: PoolState) {
  // TypeScript autocomplete pentru toate câmpurile!
  console.log(pool.totalJoins); // ✅
  console.log(pool.paused); // ✅
  console.log(pool.poolId); // ✅
}

// Event handlers
function handleEvent(event: MissoutEvent) {
  if (event.type === 'PoolActivityEvent') {
    // TypeScript știe că event.data este PoolActivityEvent
    console.log(event.data.action); // ✅ autocomplete
  }
}
```

## 🚀 Quick Start Checklist

1. ✅ Import SDK functions
2. ✅ Initialize client și set wallet
3. ✅ Folosește `getPoolState()` pentru a citi pool-uri (cu toate noile câmpuri)
4. ✅ Folosește noile funcții (`pausePool`, `adminClosePool`, etc.)
5. ✅ Subscribe la evenimente cu `EventListener`
6. ✅ Handle erori cu `parseProgramError()` și helpers
7. ✅ Enjoy type-safety complet cu TypeScript! 🎉
