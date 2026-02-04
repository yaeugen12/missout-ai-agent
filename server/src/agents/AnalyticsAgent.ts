/**
 * 📊 ANALYTICS AGENT
 * 
 * Real-time insights and predictive analytics
 * 
 * Features:
 * - Platform statistics
 * - Trend analysis
 * - Predictive insights
 * - Performance metrics
 */

import { EventEmitter } from 'events';
import { db } from '../db';
import { pools, transactions, profiles } from '@shared/schema';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { logger } from '../logger';
import type { MissoutAgent } from './MissoutAgent';

interface PlatformMetrics {
  totalPools: number;
  activePools: number;
  totalTransactions: number;
  totalVolume: number;
  uniqueParticipants: number;
  averagePoolSize: number;
  timestamp: Date;
}

interface TrendInsight {
  type: 'pool_activity' | 'transaction_volume' | 'user_growth' | 'success_rate';
  trend: 'increasing' | 'stable' | 'decreasing';
  change: number; // percentage
  description: string;
  confidence: number;
  timestamp: Date;
}

interface PredictiveInsight {
  prediction: string;
  probability: number;
  factors: string[];
  timeframe: string;
  timestamp: Date;
}

export class AnalyticsAgent extends EventEmitter {
  private agent: MissoutAgent;
  private isRunning: boolean = false;
  private analysisInterval: NodeJS.Timeout | null = null;
  private currentMetrics: PlatformMetrics | null = null;
  private historicalMetrics: PlatformMetrics[] = [];
  private insights: TrendInsight[] = [];
  private predictions: PredictiveInsight[] = [];

  constructor(agent: MissoutAgent) {
    super();
    this.agent = agent;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('[AnalyticsAgent] 📊 Starting Analytics Agent...');
    this.isRunning = true;

    // Analysis every 20 seconds
    this.analysisInterval = setInterval(() => this.performAnalysis(), 20000);
    
    // Initial analysis
    await this.performAnalysis();

    logger.info('[AnalyticsAgent] ✅ Analytics Agent started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('[AnalyticsAgent] 🛑 Stopping Analytics Agent...');
    this.isRunning = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    logger.info('[AnalyticsAgent] ✅ Analytics Agent stopped');
  }

  /**
   * Main analysis loop
   */
  private async performAnalysis(): Promise<void> {
    try {
      await this.collectMetrics();
      await this.analyzeTrends();
      await this.generatePredictions();
    } catch (error) {
      logger.error('[AnalyticsAgent] Error in analysis', error);
    }
  }

  /**
   * Collect current platform metrics
   */
  private async collectMetrics(): Promise<void> {
    // Total pools
    const allPools = await db.select().from(pools);
    const totalPools = allPools.length;
    const activePools = allPools.filter(p => p.status === 'active').length;

    // Total transactions
    const allTransactions = await db.select().from(transactions);
    const totalTransactions = allTransactions.length;

    // Calculate total volume
    const totalVolume = allTransactions.reduce((sum, tx) => {
      return sum + tx.amount;
    }, 0);

    // Unique participants
    const uniqueParticipants = new Set(allTransactions.map(tx => tx.walletAddress)).size;

    // Average pool size
    const averagePoolSize = totalPools > 0 
      ? allTransactions.length / totalPools 
      : 0;

    const metrics: PlatformMetrics = {
      totalPools,
      activePools,
      totalTransactions,
      totalVolume,
      uniqueParticipants,
      averagePoolSize,
      timestamp: new Date(),
    };

    // Store metrics
    this.currentMetrics = metrics;
    this.historicalMetrics.push(metrics);

    // Keep only last 100 data points
    if (this.historicalMetrics.length > 100) {
      this.historicalMetrics = this.historicalMetrics.slice(-100);
    }
  }

  /**
   * Analyze trends from historical data
   */
  private async analyzeTrends(): Promise<void> {
    if (this.historicalMetrics.length < 5) return;

    const recent = this.historicalMetrics.slice(-10);
    const older = this.historicalMetrics.slice(-20, -10);

    if (older.length === 0) return;

    // Pool activity trend
    const recentAvgPools = recent.reduce((sum, m) => sum + m.activePools, 0) / recent.length;
    const olderAvgPools = older.reduce((sum, m) => sum + m.activePools, 0) / older.length;
    const poolChange = olderAvgPools > 0 
      ? ((recentAvgPools - olderAvgPools) / olderAvgPools) * 100 
      : 0;

    if (Math.abs(poolChange) > 5) {
      const insight: TrendInsight = {
        type: 'pool_activity',
        trend: poolChange > 0 ? 'increasing' : 'decreasing',
        change: poolChange,
        description: `Pool activity ${poolChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(poolChange).toFixed(1)}%`,
        confidence: Math.min(0.9, Math.abs(poolChange) / 100),
        timestamp: new Date(),
      };

      this.addInsight(insight);
    }

    // Transaction volume trend
    const recentAvgVolume = recent.reduce((sum, m) => sum + m.totalVolume, 0) / recent.length;
    const olderAvgVolume = older.reduce((sum, m) => sum + m.totalVolume, 0) / older.length;
    const volumeChange = olderAvgVolume > 0 
      ? ((recentAvgVolume - olderAvgVolume) / olderAvgVolume) * 100 
      : 0;

    if (Math.abs(volumeChange) > 10) {
      const insight: TrendInsight = {
        type: 'transaction_volume',
        trend: volumeChange > 0 ? 'increasing' : 'decreasing',
        change: volumeChange,
        description: `Transaction volume ${volumeChange > 0 ? 'surged' : 'dropped'} by ${Math.abs(volumeChange).toFixed(1)}%`,
        confidence: Math.min(0.85, Math.abs(volumeChange) / 100),
        timestamp: new Date(),
      };

      this.addInsight(insight);
    }

    // User growth trend
    const recentAvgUsers = recent.reduce((sum, m) => sum + m.uniqueParticipants, 0) / recent.length;
    const olderAvgUsers = older.reduce((sum, m) => sum + m.uniqueParticipants, 0) / older.length;
    const userChange = olderAvgUsers > 0 
      ? ((recentAvgUsers - olderAvgUsers) / olderAvgUsers) * 100 
      : 0;

    if (Math.abs(userChange) > 5) {
      const insight: TrendInsight = {
        type: 'user_growth',
        trend: userChange > 0 ? 'increasing' : 'decreasing',
        change: userChange,
        description: `User base ${userChange > 0 ? 'growing' : 'shrinking'} by ${Math.abs(userChange).toFixed(1)}%`,
        confidence: Math.min(0.8, Math.abs(userChange) / 100),
        timestamp: new Date(),
      };

      this.addInsight(insight);
    }
  }

  /**
   * Generate predictive insights
   */
  private async generatePredictions(): Promise<void> {
    if (!this.currentMetrics || this.historicalMetrics.length < 10) return;

    // Prediction 1: Platform growth trajectory
    const growthRate = this.calculateGrowthRate();
    
    if (Math.abs(growthRate) > 1) {
      const prediction: PredictiveInsight = {
        prediction: growthRate > 0 
          ? `Platform expected to grow by ${growthRate.toFixed(1)}% in next hour` 
          : `Platform activity may decline by ${Math.abs(growthRate).toFixed(1)}% in next hour`,
        probability: Math.min(0.75, Math.abs(growthRate) / 100),
        factors: [
          'Recent transaction trend',
          'Active pool count',
          'User engagement rate',
        ],
        timeframe: '1 hour',
        timestamp: new Date(),
      };

      this.addPrediction(prediction);
    }

    // Prediction 2: Pool success rate
    const successRate = await this.calculatePoolSuccessRate();
    
    if (successRate > 0) {
      const prediction: PredictiveInsight = {
        prediction: `New pools have ${successRate.toFixed(0)}% chance of reaching minimum participation`,
        probability: 0.7,
        factors: [
          'Historical success patterns',
          'Current platform activity',
          'Average pool participation',
        ],
        timeframe: '24 hours',
        timestamp: new Date(),
      };

      this.addPrediction(prediction);
    }
  }

  /**
   * Calculate platform growth rate
   */
  private calculateGrowthRate(): number {
    if (this.historicalMetrics.length < 10) return 0;

    const recent = this.historicalMetrics.slice(-5);
    const older = this.historicalMetrics.slice(-10, -5);

    const recentAvg = recent.reduce((sum, m) => sum + m.totalTransactions, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.totalTransactions, 0) / older.length;

    return olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  }

  /**
   * Calculate pool success rate
   */
  private async calculatePoolSuccessRate(): Promise<number> {
    const recentPools = await db
      .select()
      .from(pools)
      .orderBy(desc(pools.startTime))
      .limit(50);

    if (recentPools.length === 0) return 0;

    let successCount = 0;

    for (const pool of recentPools) {
      const poolTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.poolId, pool.id));

      // Consider "successful" if has 3+ participants
      const uniqueParticipants = new Set(poolTxs.map(tx => tx.walletAddress)).size;
      if (uniqueParticipants >= 3) {
        successCount++;
      }
    }

    return (successCount / recentPools.length) * 100;
  }

  /**
   * Add trend insight
   */
  private addInsight(insight: TrendInsight): void {
    // Avoid duplicate insights
    const isDuplicate = this.insights.some(
      existing => 
        existing.type === insight.type &&
        (new Date().getTime() - new Date(existing.timestamp).getTime()) < 60000 // 1 min
    );

    if (isDuplicate) return;

    this.insights.push(insight);
    this.emit('insight:generated', insight);

    logger.info('[AnalyticsAgent] 💡 New insight generated', {
      type: insight.type,
      trend: insight.trend,
      change: insight.change,
    });

    // Keep only last 50 insights
    if (this.insights.length > 50) {
      this.insights = this.insights.slice(-50);
    }
  }

  /**
   * Add prediction
   */
  private addPrediction(prediction: PredictiveInsight): void {
    this.predictions.push(prediction);

    logger.info('[AnalyticsAgent] 🔮 New prediction generated', {
      prediction: prediction.prediction,
      probability: prediction.probability,
    });

    // Keep only last 30 predictions
    if (this.predictions.length > 30) {
      this.predictions = this.predictions.slice(-30);
    }
  }

  /**
   * Get latest insights
   */
  getLatestInsights() {
    return {
      currentMetrics: this.currentMetrics,
      recentInsights: this.insights.slice(-10),
      predictions: this.predictions.slice(-5),
      dataPoints: this.historicalMetrics.length,
    };
  }

  /**
   * Get specific metric history
   */
  getMetricHistory(metric: keyof PlatformMetrics, limit: number = 20) {
    return this.historicalMetrics
      .slice(-limit)
      .map(m => ({
        value: m[metric],
        timestamp: m.timestamp,
      }));
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.isRunning,
      dataPoints: this.historicalMetrics.length,
      insightsGenerated: this.insights.length,
      predictions: this.predictions.length,
      lastAnalysis: this.currentMetrics?.timestamp || null,
    };
  }
}
