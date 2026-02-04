/**
 * 🛡️ SECURITY AGENT
 * 
 * Autonomous fraud detection and security monitoring
 * 
 * Features:
 * - Pattern-based fraud detection
 * - Wallet reputation analysis
 * - Anomaly detection in transactions
 * - Real-time security alerts
 */

import { EventEmitter } from 'events';
import { db } from '../db';
import { transactions, pools } from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { logger } from '../logger';
import type { MissoutAgent } from './MissoutAgent';

interface SecurityIncident {
  id: string;
  type: 'suspicious_pattern' | 'rapid_transactions' | 'wallet_anomaly' | 'high_value_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  walletAddress?: string;
  poolId?: number;
  evidence: any;
  timestamp: Date;
  resolved: boolean;
}

interface WalletRiskProfile {
  address: string;
  riskScore: number; // 0-100 (higher = more risky)
  flags: string[];
  transactionCount: number;
  totalValue: number;
  lastActivity: Date;
}

export class SecurityAgent extends EventEmitter {
  private agent: MissoutAgent;
  private isRunning: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private incidents: SecurityIncident[] = [];
  private walletProfiles: Map<string, WalletRiskProfile> = new Map();

  // Detection thresholds
  private readonly RAPID_TX_THRESHOLD = 5; // transactions in 1 minute
  private readonly HIGH_VALUE_THRESHOLD = 100; // SOL
  private readonly SUSPICIOUS_PATTERN_WINDOW = 60000; // 1 minute

  constructor(agent: MissoutAgent) {
    super();
    this.agent = agent;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('[SecurityAgent] 🛡️ Starting Security Agent...');
    this.isRunning = true;

    // Security monitoring every 30 seconds
    this.monitorInterval = setInterval(() => this.monitorSecurity(), 30000);
    
    // Initial security scan
    await this.monitorSecurity();

    logger.info('[SecurityAgent] ✅ Security Agent started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('[SecurityAgent] 🛑 Stopping Security Agent...');
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    logger.info('[SecurityAgent] ✅ Security Agent stopped');
  }

  /**
   * Main security monitoring loop
   */
  private async monitorSecurity(): Promise<void> {
    try {
      await this.detectRapidTransactions();
      await this.detectSuspiciousPatterns();
      await this.detectHighValueAnomalies();
      await this.updateWalletProfiles();
    } catch (error) {
      logger.error('[SecurityAgent] Error in security monitoring', error);
    }
  }

  /**
   * Detect rapid successive transactions (potential bot activity)
   */
  private async detectRapidTransactions(): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    // Get recent transactions
    const recentTxs = await db
      .select()
      .from(transactions)
      .where(gte(transactions.timestamp, oneMinuteAgo))
      .orderBy(desc(transactions.timestamp));

    // Group by wallet
    const walletTxCounts = new Map<string, number>();
    
    for (const tx of recentTxs) {
      const count = (walletTxCounts.get(tx.walletAddress) || 0) + 1;
      walletTxCounts.set(tx.walletAddress, count);
    }

    // Flag wallets with rapid transactions
    for (const [wallet, count] of walletTxCounts) {
      if (count >= this.RAPID_TX_THRESHOLD) {
        const incident: SecurityIncident = {
          id: `rapid-tx-${Date.now()}-${wallet.slice(0, 8)}`,
          type: 'rapid_transactions',
          severity: count > 10 ? 'high' : 'medium',
          description: `Wallet ${wallet.slice(0, 8)}... executed ${count} transactions in 1 minute`,
          walletAddress: wallet,
          evidence: { transactionCount: count, timeWindow: '60s' },
          timestamp: new Date(),
          resolved: false,
        };

        this.addIncident(incident);
      }
    }
  }

  /**
   * Detect suspicious patterns in transaction behavior
   */
  private async detectSuspiciousPatterns(): Promise<void> {
    const recentPools = await db
      .select()
      .from(pools)
      .orderBy(desc(pools.startTime))
      .limit(20);

    for (const pool of recentPools) {
      const poolTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.poolId, pool.id))
        .orderBy(desc(transactions.timestamp));

      // Pattern 1: All transactions from same wallet
      const uniqueWallets = new Set(poolTxs.map(tx => tx.walletAddress));
      if (poolTxs.length >= 3 && uniqueWallets.size === 1) {
        const incident: SecurityIncident = {
          id: `pattern-${Date.now()}-pool-${pool.id}`,
          type: 'suspicious_pattern',
          severity: 'medium',
          description: `Pool ${pool.id} has all transactions from single wallet (possible self-dealing)`,
          poolId: pool.id,
          walletAddress: Array.from(uniqueWallets)[0],
          evidence: { pattern: 'single_wallet_monopoly', transactionCount: poolTxs.length },
          timestamp: new Date(),
          resolved: false,
        };

        this.addIncident(incident);
      }

      // Pattern 2: Extremely rapid pool fill
      if (poolTxs.length >= 5) {
        const firstTx = new Date(poolTxs[poolTxs.length - 1].timestamp);
        const lastTx = new Date(poolTxs[0].timestamp);
        const timeSpan = lastTx.getTime() - firstTx.getTime();

        if (timeSpan < 10000) { // Less than 10 seconds
          const incident: SecurityIncident = {
            id: `rapid-fill-${Date.now()}-pool-${pool.id}`,
            type: 'suspicious_pattern',
            severity: 'high',
            description: `Pool ${pool.id} filled in ${Math.round(timeSpan / 1000)}s (potential coordinated attack)`,
            poolId: pool.id,
            evidence: { 
              pattern: 'rapid_pool_fill', 
              transactionCount: poolTxs.length, 
              timeSpanMs: timeSpan 
            },
            timestamp: new Date(),
            resolved: false,
          };

          this.addIncident(incident);
        }
      }
    }
  }

  /**
   * Detect high-value transaction anomalies
   */
  private async detectHighValueAnomalies(): Promise<void> {
    // Get transactions from last hour
    const oneHourAgo = new Date(Date.now() - 3600000);

    const recentTxs = await db
      .select()
      .from(transactions)
      .where(gte(transactions.timestamp, oneHourAgo))
      .orderBy(desc(transactions.timestamp));

    for (const tx of recentTxs) {
      // Amount is already a number from the database
      const amount = tx.amount;

      if (amount > this.HIGH_VALUE_THRESHOLD) {
        const incident: SecurityIncident = {
          id: `high-value-${Date.now()}-${tx.txHash?.slice(0, 8)}`,
          type: 'high_value_alert',
          severity: amount > 1000 ? 'critical' : 'high',
          description: `High value transaction detected: ${amount.toFixed(2)} tokens`,
          walletAddress: tx.walletAddress,
          poolId: tx.poolId || undefined,
          evidence: { amount, txHash: tx.txHash },
          timestamp: new Date(),
          resolved: false,
        };

        this.addIncident(incident);
      }
    }
  }

  /**
   * Update wallet risk profiles
   */
  private async updateWalletProfiles(): Promise<void> {
    // Get active wallets (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 86400000);

    const recentTxs = await db
      .select()
      .from(transactions)
      .where(gte(transactions.timestamp, oneDayAgo))
      .orderBy(desc(transactions.timestamp));

    const walletData = new Map<string, any[]>();
    
    for (const tx of recentTxs) {
      if (!walletData.has(tx.walletAddress)) {
        walletData.set(tx.walletAddress, []);
      }
      walletData.get(tx.walletAddress)!.push(tx);
    }

    // Calculate risk profiles
    for (const [wallet, txs] of walletData) {
      const profile = this.calculateWalletRisk(wallet, txs);
      this.walletProfiles.set(wallet, profile);
    }
  }

  /**
   * Calculate risk score for a wallet
   */
  private calculateWalletRisk(address: string, txs: any[]): WalletRiskProfile {
    let riskScore = 0;
    const flags: string[] = [];

    // Factor 1: Transaction frequency (rapid = risky)
    if (txs.length > 20) {
      riskScore += 15;
      flags.push('high_frequency_trader');
    }

    // Factor 2: Transaction timing patterns
    const timestamps = txs.map(tx => new Date(tx.timestamp).getTime());
    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    if (avgInterval < 5000 && intervals.length > 5) {
      riskScore += 20;
      flags.push('bot_like_pattern');
    }

    // Factor 3: Value patterns
    const totalValue = txs.reduce((sum, tx) => sum + tx.amount, 0);
    if (totalValue > 1000) {
      riskScore += 10;
      flags.push('high_value_trader');
    }

    // Factor 4: Recent incidents
    const walletIncidents = this.incidents.filter(
      inc => inc.walletAddress === address && !inc.resolved
    );
    
    if (walletIncidents.length > 0) {
      riskScore += walletIncidents.length * 15;
      flags.push(`${walletIncidents.length}_security_incidents`);
    }

    // Normalize risk score (0-100)
    riskScore = Math.min(100, Math.max(0, riskScore));

    return {
      address,
      riskScore,
      flags,
      transactionCount: txs.length,
      totalValue,
      lastActivity: new Date(timestamps[0]),
    };
  }

  /**
   * Add security incident
   */
  private addIncident(incident: SecurityIncident): void {
    // Check for duplicates
    const isDuplicate = this.incidents.some(
      existing => 
        existing.type === incident.type &&
        existing.walletAddress === incident.walletAddress &&
        existing.poolId === incident.poolId &&
        !existing.resolved &&
        (new Date().getTime() - new Date(existing.timestamp).getTime()) < 300000 // 5 min
    );

    if (isDuplicate) return;

    this.incidents.push(incident);
    this.emit('fraud:detected', incident);

    logger.warn('[SecurityAgent] 🚨 Security incident detected', {
      type: incident.type,
      severity: incident.severity,
      description: incident.description,
    });

    // Keep only last 200 incidents
    if (this.incidents.length > 200) {
      this.incidents = this.incidents.slice(-200);
    }
  }

  /**
   * Get wallet risk profile
   */
  getWalletRisk(address: string): WalletRiskProfile | null {
    return this.walletProfiles.get(address) || null;
  }

  /**
   * Get security report
   */
  getSecurityReport() {
    const unresolvedIncidents = this.incidents.filter(inc => !inc.resolved);
    
    return {
      totalIncidents: this.incidents.length,
      unresolvedIncidents: unresolvedIncidents.length,
      incidentsBySeverity: {
        critical: unresolvedIncidents.filter(i => i.severity === 'critical').length,
        high: unresolvedIncidents.filter(i => i.severity === 'high').length,
        medium: unresolvedIncidents.filter(i => i.severity === 'medium').length,
        low: unresolvedIncidents.filter(i => i.severity === 'low').length,
      },
      recentIncidents: this.incidents.slice(-20),
      walletsMonitored: this.walletProfiles.size,
      highRiskWallets: Array.from(this.walletProfiles.values())
        .filter(p => p.riskScore > 70)
        .length,
    };
  }

  /**
   * Get all incidents
   */
  getAllIncidents(limit: number = 50): SecurityIncident[] {
    return this.incidents.slice(-limit);
  }

  /**
   * Resolve incident
   */
  resolveIncident(incidentId: string): boolean {
    const incident = this.incidents.find(inc => inc.id === incidentId);
    if (incident) {
      incident.resolved = true;
      logger.info('[SecurityAgent] Incident resolved', { id: incidentId });
      return true;
    }
    return false;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.isRunning,
      totalIncidents: this.incidents.length,
      unresolvedIncidents: this.incidents.filter(inc => !inc.resolved).length,
      walletsMonitored: this.walletProfiles.size,
      lastCheck: this.incidents.length > 0 
        ? this.incidents[this.incidents.length - 1].timestamp 
        : null,
    };
  }
}
