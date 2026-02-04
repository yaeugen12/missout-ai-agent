/**
 * 🎯 POOL ORCHESTRATOR AGENT
 * 
 * Non-invasive wrapper over existing pool-monitor
 * Adds AI decision-making and autonomous orchestration
 * 
 * Features:
 * - Observes pool-monitor without modifying it
 * - AI-powered insights on pool health
 * - Autonomous recommendations (not forced actions)
 * - Logging for hackathon demonstration
 */

import { EventEmitter } from 'events';
import { db } from '../db';
import { pools, transactions } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../logger';
import type { MissoutAgent } from './MissoutAgent';

interface PoolInsight {
  poolId: number;
  poolAddress: string;
  status: string;
  participantCount: number;
  totalValue: string;
  healthScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  timestamp: Date;
}

interface PoolDecision {
  poolId: number;
  action: string;
  reasoning: string;
  confidence: number;
  timestamp: Date;
}

export class PoolOrchestrator extends EventEmitter {
  private agent: MissoutAgent;
  private isRunning: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private poolInsights: Map<number, PoolInsight> = new Map();
  private decisions: PoolDecision[] = [];

  constructor(agent: MissoutAgent) {
    super();
    this.agent = agent;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('[PoolOrchestrator] 🎯 Starting Pool Orchestrator...');
    this.isRunning = true;

    // Monitor pools every 15 seconds (non-invasive observation)
    this.monitorInterval = setInterval(() => this.observePools(), 15000);
    
    // Initial observation
    await this.observePools();

    logger.info('[PoolOrchestrator] ✅ Pool Orchestrator started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('[PoolOrchestrator] 🛑 Stopping Pool Orchestrator...');
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    logger.info('[PoolOrchestrator] ✅ Pool Orchestrator stopped');
  }

  /**
   * Non-invasive observation of pool states
   * Generates insights without modifying anything
   */
  private async observePools(): Promise<void> {
    try {
      // Query all active pools (READ-ONLY)
      const activePools = await db
        .select()
        .from(pools)
        .where(eq(pools.status, 'active'))
        .limit(50);

      for (const pool of activePools) {
        const insight = await this.analyzePool(pool);
        this.poolInsights.set(pool.id, insight);
        
        // Emit event for monitoring
        this.emit('pool:monitored', pool.id);

        // Generate autonomous decisions (recommendations only)
        if (insight.healthScore < 30) {
          const decision: PoolDecision = {
            poolId: pool.id,
            action: 'monitor_closely',
            reasoning: `Low health score (${insight.healthScore}/100). Pool requires attention.`,
            confidence: 0.85,
            timestamp: new Date(),
          };
          
          this.decisions.push(decision);
          this.emit('pool:decision', decision);
          
          logger.info('[PoolOrchestrator] 🤖 Autonomous recommendation generated', decision);
        }
      }

      // Keep only last 100 decisions
      if (this.decisions.length > 100) {
        this.decisions = this.decisions.slice(-100);
      }

    } catch (error) {
      logger.error('[PoolOrchestrator] Error observing pools', error);
    }
  }

  /**
   * AI-powered pool analysis
   * Calculates health score and risk level
   */
  private async analyzePool(pool: any): Promise<PoolInsight> {
    // Get participant count from transactions
    const poolTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.poolId, pool.id))
      .orderBy(desc(transactions.timestamp))
      .limit(100);

    const uniqueParticipants = new Set(poolTransactions.map(tx => tx.walletAddress)).size;
    
    // Calculate health score (0-100)
    let healthScore = 50; // Base score
    
    // More participants = healthier
    if (uniqueParticipants > 10) healthScore += 20;
    else if (uniqueParticipants > 5) healthScore += 10;
    
    // Active status = healthy
    if (pool.status === 'active') healthScore += 10;
    
    // Has minimum stake = healthy
    if (parseFloat(pool.minStakeAmount) > 0) healthScore += 10;
    
    // Time-based scoring
    const createdAt = new Date(pool.createdAt);
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) healthScore += 10; // Fresh pool
    
    // Risk level determination
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (healthScore < 40) riskLevel = 'high';
    else if (healthScore < 70) riskLevel = 'medium';
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (uniqueParticipants < 3) {
      recommendations.push('Low participation - consider promotional activities');
    }
    
    if (healthScore < 50) {
      recommendations.push('Below average health - monitor closely');
    }
    
    if (riskLevel === 'high') {
      recommendations.push('High risk detected - implement additional safeguards');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Pool operating normally');
    }

    return {
      poolId: pool.id,
      poolAddress: pool.poolAddress,
      status: pool.status,
      participantCount: uniqueParticipants,
      totalValue: pool.minStakeAmount || '0',
      healthScore: Math.min(100, Math.max(0, healthScore)),
      riskLevel,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Get current pool insights
   */
  getPoolInsights(): PoolInsight[] {
    return Array.from(this.poolInsights.values());
  }

  /**
   * Get recent autonomous decisions
   */
  getRecentDecisions(limit: number = 20): PoolDecision[] {
    return this.decisions.slice(-limit);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.isRunning,
      poolsMonitored: this.poolInsights.size,
      decisionsGenerated: this.decisions.length,
      lastObservation: this.decisions.length > 0 
        ? this.decisions[this.decisions.length - 1].timestamp 
        : null,
    };
  }

  /**
   * Get insight for specific pool
   */
  getPoolInsight(poolId: number): PoolInsight | undefined {
    return this.poolInsights.get(poolId);
  }

  /**
   * AI-powered prediction: Will this pool succeed?
   */
  async predictPoolSuccess(poolId: number): Promise<{
    prediction: 'likely' | 'uncertain' | 'unlikely';
    confidence: number;
    factors: string[];
  }> {
    const insight = this.poolInsights.get(poolId);
    
    if (!insight) {
      return {
        prediction: 'uncertain',
        confidence: 0,
        factors: ['Insufficient data for prediction'],
      };
    }

    const factors: string[] = [];
    let successScore = 50;

    // Health score impact
    if (insight.healthScore > 70) {
      successScore += 20;
      factors.push('High health score');
    } else if (insight.healthScore < 40) {
      successScore -= 20;
      factors.push('Low health score');
    }

    // Participation impact
    if (insight.participantCount > 10) {
      successScore += 15;
      factors.push('Strong participation');
    } else if (insight.participantCount < 3) {
      successScore -= 15;
      factors.push('Low participation');
    }

    // Risk level impact
    if (insight.riskLevel === 'low') {
      successScore += 10;
      factors.push('Low risk profile');
    } else if (insight.riskLevel === 'high') {
      successScore -= 10;
      factors.push('High risk detected');
    }

    // Determine prediction
    let prediction: 'likely' | 'uncertain' | 'unlikely';
    if (successScore > 65) prediction = 'likely';
    else if (successScore < 45) prediction = 'unlikely';
    else prediction = 'uncertain';

    const confidence = Math.abs(successScore - 50) / 50;

    return {
      prediction,
      confidence: Math.min(0.95, confidence),
      factors,
    };
  }
}
