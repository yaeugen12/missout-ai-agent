/**
 * 🤖 MISSOUT AUTONOMOUS AGENT
 * 
 * Main orchestration layer for Colosseum Agent Hackathon
 * Non-invasive wrapper over existing pool-monitor system
 * 
 * Features:
 * - Autonomous pool monitoring with AI decision-making
 * - Security & fraud detection
 * - Real-time analytics & insights
 * - Integration with SAID, BlockScore, AgentWallet
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import { PoolOrchestrator } from './PoolOrchestrator';
import { SecurityAgent } from './SecurityAgent';
import { AnalyticsAgent } from './AnalyticsAgent';
import { IntegrationHub } from './IntegrationHub';
import { TokenSafetyAgent } from './TokenSafetyAgent';

interface AgentConfig {
  enabled: boolean;
  autonomousMode: boolean;
  integrations: {
    blockScore: boolean;
    said: boolean;
    agentWallet: boolean;
  };
}

interface AgentMetrics {
  poolsMonitored: number;
  decisionsExecuted: number;
  fraudDetected: number;
  uptimeSeconds: number;
  lastAction: Date | null;
}

export class MissoutAgent extends EventEmitter {
  private config: AgentConfig;
  private metrics: AgentMetrics;
  private startTime: Date;
  private isRunning: boolean = false;

  // Sub-agents
  private poolOrchestrator: PoolOrchestrator;
  private securityAgent: SecurityAgent;
  private analyticsAgent: AnalyticsAgent;
  private integrationHub: IntegrationHub;
  private tokenSafetyAgent: TokenSafetyAgent;

  // Heartbeat interval
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<AgentConfig> = {}) {
    super();
    
    this.config = {
      enabled: config.enabled ?? true,
      autonomousMode: config.autonomousMode ?? true,
      integrations: {
        blockScore: config.integrations?.blockScore ?? false,
        said: config.integrations?.said ?? false,
        agentWallet: config.integrations?.agentWallet ?? false,
      },
    };

    this.metrics = {
      poolsMonitored: 0,
      decisionsExecuted: 0,
      fraudDetected: 0,
      uptimeSeconds: 0,
      lastAction: null,
    };

    this.startTime = new Date();

    // Initialize sub-agents
    this.poolOrchestrator = new PoolOrchestrator(this);
    this.securityAgent = new SecurityAgent(this);
    this.analyticsAgent = new AnalyticsAgent(this);
    this.integrationHub = new IntegrationHub(this);
    this.tokenSafetyAgent = new TokenSafetyAgent(this);

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Pool events
    this.poolOrchestrator.on('pool:monitored', (poolId: number) => {
      this.metrics.poolsMonitored++;
      this.emit('metrics:updated', this.metrics);
    });

    this.poolOrchestrator.on('pool:decision', (decision: any) => {
      this.metrics.decisionsExecuted++;
      this.metrics.lastAction = new Date();
      this.emit('metrics:updated', this.metrics);
      logger.info('[MissoutAgent] Autonomous decision executed', decision);
    });

    // Security events
    this.securityAgent.on('fraud:detected', (incident: any) => {
      this.metrics.fraudDetected++;
      this.emit('security:alert', incident);
      logger.warn('[MissoutAgent] Fraud detected', incident);
    });

    // Analytics events
    this.analyticsAgent.on('insight:generated', (insight: any) => {
      this.emit('analytics:insight', insight);
      logger.info('[MissoutAgent] New insight generated', insight);
    });
  }

  /**
   * Start autonomous agent operation
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[MissoutAgent] Agent already running');
      return;
    }

    logger.info('[MissoutAgent] 🤖 Starting Missout Autonomous Agent...');
    logger.info('[MissoutAgent] Config:', this.config);

    this.isRunning = true;
    this.startTime = new Date();

    // Start sub-agents
    await this.poolOrchestrator.start();
    await this.securityAgent.start();
    await this.analyticsAgent.start();
    await this.integrationHub.start();
    await this.tokenSafetyAgent.start();

    // Start heartbeat (every 10 seconds)
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 10000);

    logger.info('[MissoutAgent] ✅ Agent started successfully');
    this.emit('agent:started');
  }

  /**
   * Stop autonomous agent operation
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('[MissoutAgent] Agent not running');
      return;
    }

    logger.info('[MissoutAgent] 🛑 Stopping Missout Autonomous Agent...');

    this.isRunning = false;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop sub-agents
    await this.poolOrchestrator.stop();
    await this.securityAgent.stop();
    await this.analyticsAgent.stop();
    await this.integrationHub.stop();
    await this.tokenSafetyAgent.stop();

    logger.info('[MissoutAgent] ✅ Agent stopped successfully');
    this.emit('agent:stopped');
  }

  /**
   * Periodic heartbeat - updates metrics and performs health checks
   */
  private heartbeat(): void {
    this.metrics.uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    this.emit('agent:heartbeat', this.metrics);
  }

  /**
   * Get current agent status
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: this.config,
      metrics: {
        ...this.metrics,
        uptimeSeconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      },
      subAgents: {
        poolOrchestrator: this.poolOrchestrator.getStatus(),
        securityAgent: this.securityAgent.getStatus(),
        analyticsAgent: this.analyticsAgent.getStatus(),
        integrationHub: this.integrationHub.getStatus(),
        tokenSafetyAgent: this.tokenSafetyAgent.getStatus(),
      },
      startTime: this.startTime,
    };
  }

  /**
   * Update agent configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('[MissoutAgent] Config updated', this.config);
    this.emit('config:updated', this.config);
  }

  /**
   * Get real-time analytics
   */
  async getAnalytics() {
    return this.analyticsAgent.getLatestInsights();
  }

  /**
   * Get security report
   */
  async getSecurityReport() {
    return this.securityAgent.getSecurityReport();
  }

  /**
   * Execute autonomous action (for demonstration)
   */
  async executeAutonomousAction(action: string, params: any = {}) {
    logger.info('[MissoutAgent] Executing autonomous action', { action, params });
    
    this.metrics.decisionsExecuted++;
    this.metrics.lastAction = new Date();
    
    this.emit('action:executed', { action, params, timestamp: new Date() });
    
    return {
      success: true,
      action,
      params,
      timestamp: new Date(),
    };
  }

  /**
   * Analyze token safety (exposed for API use)
   */
  async analyzeTokenSafety(mintAddress: string) {
    return this.tokenSafetyAgent.analyzeToken(mintAddress);
  }

  /**
   * Get token safety agent (for direct access)
   */
  getTokenSafetyAgent() {
    return this.tokenSafetyAgent;
  }
}

// Singleton instance
let missoutAgent: MissoutAgent | null = null;

/**
 * Get or create the global MissoutAgent instance
 */
export function getMissoutAgent(): MissoutAgent {
  if (!missoutAgent) {
    missoutAgent = new MissoutAgent({
      enabled: true,
      autonomousMode: true,
      integrations: {
        blockScore: false, // Enable when API key available
        said: false,       // Enable when configured
        agentWallet: false, // Enable when needed
      },
    });
  }
  return missoutAgent;
}

/**
 * Initialize and start the agent
 */
export async function initializeMissoutAgent(): Promise<MissoutAgent> {
  const agent = getMissoutAgent();
  
  if (!agent.getStatus().running) {
    await agent.start();
  }
  
  return agent;
}
