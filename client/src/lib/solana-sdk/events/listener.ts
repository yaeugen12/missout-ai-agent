import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { BorshCoder, EventParser, Event } from "@coral-xyz/anchor";
import { IDL } from "@shared/idl";
import { PROGRAM_ID } from "../programs/program-id";
import {
  MissoutEvent,
  PoolActivityEvent,
  PoolStateEvent,
  WinnerSelectedEvent,
  RefundClaimedEvent,
  ForfeitedToTreasuryEvent,
  RefundBurnedEvent,
  RentClaimedEvent,
  UIHintEvent,
  ActionType,
  HintType,
} from "./types";

/**
 * Event Listener for Solana program events
 */
export class EventListener {
  private connection: Connection;
  private eventParser: EventParser;
  private subscriptionId: number | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
    const coder = new BorshCoder(IDL as any);
    this.eventParser = new EventParser(PROGRAM_ID, coder);
  }

  /**
   * Subscribe to real-time events
   */
  subscribe(
    callback: (event: MissoutEvent) => void,
    onError?: (error: Error) => void
  ): number {
    console.log("[EventListener] Subscribing to program events...");

    this.subscriptionId = this.connection.onLogs(
      PROGRAM_ID,
      (logs: Logs) => {
        try {
          const events = this.eventParser.parseLogs(logs.logs);
          events.forEach((event) => {
            const mappedEvent = this.mapEvent(event);
            if (mappedEvent) {
              callback(mappedEvent);
            }
          });
        } catch (err: any) {
          console.error("[EventListener] Error parsing logs:", err);
          if (onError) {
            onError(err);
          }
        }
      },
      "confirmed"
    );

    console.log("[EventListener] Subscribed with ID:", this.subscriptionId);
    return this.subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(): Promise<void> {
    if (this.subscriptionId !== null) {
      console.log("[EventListener] Unsubscribing from events...");
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      console.log("[EventListener] Unsubscribed successfully");
    }
  }

  /**
   * Fetch historical events for a specific pool
   */
  async fetchPoolEvents(
    poolId: PublicKey,
    limit: number = 100
  ): Promise<MissoutEvent[]> {
    console.log(`[EventListener] Fetching events for pool ${poolId.toBase58()}`);

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        poolId,
        { limit },
        "confirmed"
      );

      const events: MissoutEvent[] = [];

      for (const sig of signatures) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta || !tx.meta.logMessages) {
            continue;
          }

          const parsedEvents = this.eventParser.parseLogs(tx.meta.logMessages);
          parsedEvents.forEach((event) => {
            const mappedEvent = this.mapEvent(event);
            if (mappedEvent) {
              events.push(mappedEvent);
            }
          });
        } catch (err) {
          console.warn(
            `[EventListener] Failed to parse transaction ${sig.signature}:`,
            err
          );
        }
      }

      console.log(`[EventListener] Found ${events.length} events`);
      return events;
    } catch (err: any) {
      console.error("[EventListener] Error fetching pool events:", err);
      throw err;
    }
  }

  /**
   * Map Anchor event to typed MissoutEvent
   */
  private mapEvent(anchorEvent: Event): MissoutEvent | null {
    const eventName = anchorEvent.name;

    try {
      switch (eventName) {
        case "PoolActivityEvent":
          return {
            type: "PoolActivityEvent",
            data: this.parsePoolActivityEvent(anchorEvent.data),
          };

        case "PoolStateEvent":
          return {
            type: "PoolStateEvent",
            data: this.parsePoolStateEvent(anchorEvent.data),
          };

        case "WinnerSelectedEvent":
          return {
            type: "WinnerSelectedEvent",
            data: this.parseWinnerSelectedEvent(anchorEvent.data),
          };

        case "RefundClaimedEvent":
          return {
            type: "RefundClaimedEvent",
            data: this.parseRefundClaimedEvent(anchorEvent.data),
          };

        case "ForfeitedToTreasuryEvent":
          return {
            type: "ForfeitedToTreasuryEvent",
            data: this.parseForfeitedToTreasuryEvent(anchorEvent.data),
          };

        case "RefundBurnedEvent":
          return {
            type: "RefundBurnedEvent",
            data: this.parseRefundBurnedEvent(anchorEvent.data),
          };

        case "RentClaimedEvent":
          return {
            type: "RentClaimedEvent",
            data: this.parseRentClaimedEvent(anchorEvent.data),
          };

        case "UIHintEvent":
          return {
            type: "UIHintEvent",
            data: this.parseUIHintEvent(anchorEvent.data),
          };

        default:
          console.warn(`[EventListener] Unknown event type: ${eventName}`);
          return null;
      }
    } catch (err: any) {
      console.error(`[EventListener] Error mapping event ${eventName}:`, err);
      return null;
    }
  }

  // ============================================================================
  // Event Parsers
  // ============================================================================

  private parsePoolActivityEvent(data: any): PoolActivityEvent {
    return {
      pool: new PublicKey(data.pool),
      user: new PublicKey(data.user),
      action: this.parseActionType(data.action),
      amount: data.amount,
      timestamp: data.timestamp,
      participantCount: data.participantCount,
    };
  }

  private parsePoolStateEvent(data: any): PoolStateEvent {
    return {
      pool: new PublicKey(data.pool),
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      timestamp: data.timestamp,
      reason: data.reason,
    };
  }

  private parseWinnerSelectedEvent(data: any): WinnerSelectedEvent {
    return {
      pool: new PublicKey(data.pool),
      winner: new PublicKey(data.winner),
      totalAmount: data.totalAmount,
      participantCount: data.participantCount,
      randomness: data.randomness,
      timestamp: data.timestamp,
    };
  }

  private parseRefundClaimedEvent(data: any): RefundClaimedEvent {
    return {
      pool: new PublicKey(data.pool),
      user: new PublicKey(data.user),
      amount: data.amount,
      burnAmount: data.burnAmount,
      timestamp: data.timestamp,
    };
  }

  private parseForfeitedToTreasuryEvent(data: any): ForfeitedToTreasuryEvent {
    return {
      pool: new PublicKey(data.pool),
      amount: data.amount,
      treasury: new PublicKey(data.treasury),
      timestamp: data.timestamp,
      reason: data.reason,
    };
  }

  private parseRefundBurnedEvent(data: any): RefundBurnedEvent {
    return {
      pool: new PublicKey(data.pool),
      user: new PublicKey(data.user),
      amount: data.amount,
      timestamp: data.timestamp,
    };
  }

  private parseRentClaimedEvent(data: any): RentClaimedEvent {
    return {
      pool: new PublicKey(data.pool),
      claimedBy: new PublicKey(data.claimedBy),
      amount: data.amount,
      timestamp: data.timestamp,
    };
  }

  private parseUIHintEvent(data: any): UIHintEvent {
    return {
      pool: new PublicKey(data.pool),
      hintType: this.parseHintType(data.hintType),
      timestamp: data.timestamp,
      data: data.data,
    };
  }

  // ============================================================================
  // Enum Parsers
  // ============================================================================

  private parseActionType(action: any): ActionType {
    const actionKeys = Object.keys(action);
    if (actionKeys.length === 0) {
      throw new Error("Invalid action type: empty object");
    }

    const key = actionKeys[0];
    const actionMap: Record<string, ActionType> = {
      created: ActionType.Created,
      joined: ActionType.Joined,
      donated: ActionType.Donated,
      closed: ActionType.Closed,
      ended: ActionType.Ended,
      cancelled: ActionType.Cancelled,
      randomnessCommitted: ActionType.RandomnessCommitted,
      randomnessMockCommitted: ActionType.RandomnessMockCommitted,
      reachedMax: ActionType.ReachedMax,
      unlocked: ActionType.Unlocked,
      adminClosed: ActionType.AdminClosed,
      emergencyReveal: ActionType.EmergencyReveal,
      expired: ActionType.Expired,
    };

    return actionMap[key] || ActionType.Created;
  }

  private parseHintType(hint: any): HintType {
    const hintKeys = Object.keys(hint);
    if (hintKeys.length === 0) {
      throw new Error("Invalid hint type: empty object");
    }

    const key = hintKeys[0];
    const hintMap: Record<string, HintType> = {
      reachedMax: HintType.ReachedMax,
      nearExpire: HintType.NearExpire,
      unlocked: HintType.Unlocked,
    };

    return hintMap[key] || HintType.ReachedMax;
  }
}

/**
 * Create an EventListener instance
 */
export function createEventListener(connection: Connection): EventListener {
  return new EventListener(connection);
}
