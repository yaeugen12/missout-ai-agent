/**
 * 🔌 INTEGRATION HUB
 * 
 * Connects Missout with other agent services in the ecosystem
 * 
 * Integrations:
 * - SAID Protocol (identity verification)
 * - BlockScore (wallet reputation)
 * - AgentWallet (treasury management)
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import type { MissoutAgent } from './MissoutAgent';

interface Integration {
  name: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: Date | null;
  apiUrl?: string;
}

interface WalletReputationScore {
  address: string;
  score: number;
  tier: 'high' | 'medium' | 'low';
  verified: boolean;
  source: string;
  timestamp: Date;
}

export class IntegrationHub extends EventEmitter {
  private agent: MissoutAgent;
  private isRunning: boolean = false;
  private integrations: Map<string, Integration> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(agent: MissoutAgent) {
    super();
    this.agent = agent;

    // Initialize integrations
    this.initializeIntegrations();
  }

  private initializeIntegrations(): void {
    // SAID Protocol - Agent identity verification
    this.integrations.set('said', {
      name: 'SAID Protocol',
      enabled: false, // Enable when configured
      status: 'disconnected',
      lastCheck: null,
      apiUrl: 'https://www.saidprotocol.com',
    });

    // BlockScore - Wallet reputation scoring
    this.integrations.set('blockscore', {
      name: 'BlockScore',
      enabled: false, // Enable when configured
      status: 'disconnected',
      lastCheck: null,
      apiUrl: 'https://blockscore.vercel.app/api',
    });

    // AgentWallet - Treasury management
    this.integrations.set('agentwallet', {
      name: 'AgentWallet',
      enabled: false, // Enable when configured
      status: 'disconnected',
      lastCheck: null,
      apiUrl: 'https://agentwallet.mcpay.tech',
    });

    logger.info('[IntegrationHub] Integrations initialized', {
      count: this.integrations.size,
      available: Array.from(this.integrations.keys()),
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('[IntegrationHub] 🔌 Starting Integration Hub...');
    this.isRunning = true;

    // Check integration health every 60 seconds
    this.checkInterval = setInterval(() => this.checkIntegrations(), 60000);
    
    // Initial check
    await this.checkIntegrations();

    logger.info('[IntegrationHub] ✅ Integration Hub started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('[IntegrationHub] 🛑 Stopping Integration Hub...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('[IntegrationHub] ✅ Integration Hub stopped');
  }

  /**
   * Check health of all integrations
   */
  private async checkIntegrations(): Promise<void> {
    for (const [key, integration] of this.integrations) {
      if (!integration.enabled) continue;

      try {
        const isHealthy = await this.checkIntegrationHealth(key);
        
        integration.status = isHealthy ? 'connected' : 'disconnected';
        integration.lastCheck = new Date();
        
        logger.info(`[IntegrationHub] ${integration.name} status: ${integration.status}`);
      } catch (error) {
        integration.status = 'error';
        integration.lastCheck = new Date();
        logger.error(`[IntegrationHub] Error checking ${integration.name}`, error);
      }
    }
  }

  /**
   * Check if specific integration is healthy
   */
  private async checkIntegrationHealth(key: string): Promise<boolean> {
    const integration = this.integrations.get(key);
    if (!integration || !integration.apiUrl) return false;

    // For now, just mark as ready to integrate
    // In production, would make actual health check API calls
    return true;
  }

  /**
   * Get wallet reputation from BlockScore
   */
  async getWalletReputation(address: string): Promise<WalletReputationScore | null> {
    const integration = this.integrations.get('blockscore');
    
    if (!integration || !integration.enabled) {
      logger.warn('[IntegrationHub] BlockScore integration not enabled');
      return null;
    }

    try {
      // In production, would make actual API call:
      // const response = await fetch(`${integration.apiUrl}/score?wallet=${address}`);
      // const data = await response.json();
      
      // For hackathon demo, return mock data
      const mockScore: WalletReputationScore = {
        address,
        score: 75, // 0-100
        tier: 'medium',
        verified: false,
        source: 'BlockScore (mock)',
        timestamp: new Date(),
      };

      logger.info('[IntegrationHub] Wallet reputation fetched', { address, score: mockScore.score });
      
      return mockScore;
    } catch (error) {
      logger.error('[IntegrationHub] Error fetching wallet reputation', error);
      return null;
    }
  }

  /**
   * Verify agent identity via SAID Protocol
   */
  async verifyAgentIdentity(agentName: string): Promise<{
    verified: boolean;
    tier: 'high' | 'medium' | 'low' | null;
    message: string;
  }> {
    const integration = this.integrations.get('said');
    
    if (!integration || !integration.enabled) {
      logger.warn('[IntegrationHub] SAID integration not enabled');
      return {
        verified: false,
        tier: null,
        message: 'SAID Protocol integration not configured',
      };
    }

    try {
      // In production, would register with SAID:
      // npx said-register --keypair wallet.json --name "MissoutAgent"
      
      // For hackathon demo
      return {
        verified: true,
        tier: 'high',
        message: 'Agent identity ready for SAID registration',
      };
    } catch (error) {
      logger.error('[IntegrationHub] Error verifying agent identity', error);
      return {
        verified: false,
        tier: null,
        message: 'Identity verification failed',
      };
    }
  }

  /**
   * Manage treasury via AgentWallet
   */
  async getTreasuryBalance(): Promise<{
    balance: number;
    currency: string;
    wallet: string;
  } | null> {
    const integration = this.integrations.get('agentwallet');
    
    if (!integration || !integration.enabled) {
      logger.warn('[IntegrationHub] AgentWallet integration not enabled');
      return null;
    }

    try {
      // In production, would query actual wallet balance
      
      // For hackathon demo
      return {
        balance: 100.5,
        currency: 'SOL',
        wallet: '4ZscUyoKFWfU7wjeZKpiuw7Nr8Q8ZdAQmr4YzHNQ74B3',
      };
    } catch (error) {
      logger.error('[IntegrationHub] Error fetching treasury balance', error);
      return null;
    }
  }

  /**
   * Enable integration
   */
  enableIntegration(key: string): boolean {
    const integration = this.integrations.get(key);
    
    if (!integration) {
      logger.error(`[IntegrationHub] Integration not found: ${key}`);
      return false;
    }

    integration.enabled = true;
    logger.info(`[IntegrationHub] Enabled integration: ${integration.name}`);
    this.emit('integration:enabled', { key, name: integration.name });
    
    return true;
  }

  /**
   * Disable integration
   */
  disableIntegration(key: string): boolean {
    const integration = this.integrations.get(key);
    
    if (!integration) {
      logger.error(`[IntegrationHub] Integration not found: ${key}`);
      return false;
    }

    integration.enabled = false;
    logger.info(`[IntegrationHub] Disabled integration: ${integration.name}`);
    this.emit('integration:disabled', { key, name: integration.name });
    
    return true;
  }

  /**
   * Get all integrations status
   */
  getAllIntegrations(): Integration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get specific integration
   */
  getIntegration(key: string): Integration | null {
    return this.integrations.get(key) || null;
  }

  /**
   * Get status
   */
  getStatus() {
    const allIntegrations = Array.from(this.integrations.values());
    
    return {
      running: this.isRunning,
      totalIntegrations: allIntegrations.length,
      enabledIntegrations: allIntegrations.filter(i => i.enabled).length,
      connectedIntegrations: allIntegrations.filter(i => i.status === 'connected').length,
      integrations: allIntegrations.map(i => ({
        name: i.name,
        enabled: i.enabled,
        status: i.status,
      })),
    };
  }

  /**
   * Batch wallet reputation check
   */
  async batchWalletReputation(addresses: string[]): Promise<Map<string, WalletReputationScore | null>> {
    const results = new Map<string, WalletReputationScore | null>();
    
    for (const address of addresses) {
      const reputation = await this.getWalletReputation(address);
      results.set(address, reputation);
    }

    return results;
  }
}
