/**
 * 🛡️ TOKEN SAFETY AGENT
 * 
 * Autonomous token safety analysis powered by Rust
 * Protects users from rug pulls and scam tokens
 * 
 * Features:
 * - Whale concentration analysis
 * - Coordinated pump detection
 * - Bot activity detection
 * - Risk scoring (0-100)
 * - Autonomous recommendations
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger';
import type { MissoutAgent } from './MissoutAgent';
import path from 'path';

const execAsync = promisify(exec);

interface TokenSafetyAnalysis {
  mintAddress: string;
  safeScore: number;          // 0-100
  riskLevel: string;           // "low", "medium", "high", "critical"
  recommendation: string;
  reasons: string[];
  metrics: {
    whaleConcentration: number;
    holderCount: number;
    transactionCount: number;
    topHolderPercent: number;
    tokenAgeHours: number;
    bondingCurveProgress: number;
    botActivityDetected: boolean;
    coordinatedPump: boolean;
    distributionTop10: number;
  };
  aiRecommendation?: string;  // Claude's natural language advice
  aiConfidence?: number;       // 0-100
}

interface AnalysisResult {
  success: boolean;
  data?: TokenSafetyAnalysis;
  error?: string;
}

export class TokenSafetyAgent extends EventEmitter {
  private agent: MissoutAgent;
  private isRunning: boolean = false;
  private analyzerPath: string;
  private rustAvailable: boolean = false;
  private claudeEnabled: boolean = false;
  private analysisCache: Map<string, { result: TokenSafetyAnalysis; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(agent: MissoutAgent) {
    super();
    this.agent = agent;
    
    // Path to Rust binary
    this.analyzerPath = path.join(process.cwd(), '..', 'rust-analyzer', 'target', 'release', 'analyze-token');
    
    // Check if Claude AI is available
    this.claudeEnabled = !!process.env.ANTHROPIC_API_KEY;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('[TokenSafetyAgent] 🛡️ Starting Token Safety Agent...');
    this.isRunning = true;

    // Try to ensure Rust binary is built (optional in production)
    try {
      await this.ensureBinaryBuilt();
      this.rustAvailable = true;
      logger.info('[TokenSafetyAgent] ✅ Rust analyzer available');
    } catch (error: any) {
      this.rustAvailable = false;
      logger.warn('[TokenSafetyAgent] ⚠️ Rust analyzer not available:', error.message);
      if (this.claudeEnabled) {
        logger.warn('[TokenSafetyAgent] Will use Claude AI only for token analysis');
      } else {
        logger.error('[TokenSafetyAgent] No fallback available - token analysis will fail!');
      }
    }

    logger.info('[TokenSafetyAgent] ✅ Token Safety Agent started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('[TokenSafetyAgent] 🛑 Stopping Token Safety Agent...');
    this.isRunning = false;
    this.analysisCache.clear();

    logger.info('[TokenSafetyAgent] ✅ Token Safety Agent stopped');
  }

  /**
   * Ensure Rust binary is compiled (optional - throws if not available)
   */
  private async ensureBinaryBuilt(): Promise<void> {
    const rustDir = path.join(process.cwd(), '..', 'rust-analyzer');
    
    // Check if Rust is available first
    try {
      await execAsync('which cargo');
    } catch {
      throw new Error('Cargo not found - Rust analyzer unavailable in this environment');
    }
    
    try {
      const { stdout, stderr } = await execAsync('cargo build --release', {
        cwd: rustDir,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}`,
        },
        timeout: 60000, // 1 minute timeout
      });
      
      if (stderr && !stderr.includes('Finished')) {
        logger.warn('[TokenSafetyAgent] Rust build warnings:', stderr);
      }
      
      logger.info('[TokenSafetyAgent] ✅ Rust analyzer binary built successfully');
    } catch (error: any) {
      throw new Error(`Rust analyzer binary build failed: ${error.message}`);
    }
  }

  /**
   * Analyze token safety using Rust binary
   */
  async analyzeToken(mintAddress: string): Promise<TokenSafetyAnalysis> {
    // Check cache first
    const cached = this.analysisCache.get(mintAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info('[TokenSafetyAgent] Using cached analysis for', mintAddress.slice(0, 8));
      return cached.result;
    }

    logger.info('[TokenSafetyAgent] Analyzing token:', mintAddress.slice(0, 8) + '...');

    try {
      // Call Rust binary
      const { stdout, stderr } = await execAsync(
        `${this.analyzerPath} ${mintAddress}`,
        {
          env: {
            ...process.env,
            SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (stderr && !stderr.includes('Finished')) {
        logger.warn('[TokenSafetyAgent] Rust analyzer stderr:', stderr);
      }

      // Parse JSON output
      const result: AnalysisResult = JSON.parse(stdout.trim());

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Analysis failed');
      }

      const analysis = this.convertSnakeToCamel(result.data);

      // Cache result
      this.analysisCache.set(mintAddress, {
        result: analysis,
        timestamp: Date.now(),
      });

      // Emit event
      this.emit('token:analyzed', {
        mintAddress,
        safeScore: analysis.safeScore,
        riskLevel: analysis.riskLevel,
      });

      logger.info('[TokenSafetyAgent] Analysis complete:', {
        mint: mintAddress.slice(0, 8) + '...',
        score: analysis.safeScore,
        risk: analysis.riskLevel,
      });

      // Get Claude AI recommendation if API key is available
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const aiRec = await this.getClaudeRecommendation(analysis);
          analysis.aiRecommendation = aiRec.recommendation;
          analysis.aiConfidence = aiRec.confidence;
          logger.info('[TokenSafetyAgent] Claude recommendation added');
        } catch (error: any) {
          logger.warn('[TokenSafetyAgent] Claude recommendation failed:', error.message);
          // Continue without AI recommendation
        }
      }

      return analysis;
    } catch (error: any) {
      logger.error('[TokenSafetyAgent] Rust analysis error:', error.message);
      
      // Fallback to Claude AI if available
      if (this.claudeEnabled) {
        logger.info('[TokenSafetyAgent] Falling back to Claude AI analysis...');
        try {
          return await this.analyzeTokenWithClaude(mintAddress);
        } catch (claudeError: any) {
          logger.error('[TokenSafetyAgent] Claude fallback also failed:', claudeError.message);
        }
      }
      
      // Return safe defaults on error (fail-safe)
      return {
        mintAddress,
        safeScore: 50,
        riskLevel: 'medium',
        recommendation: '⚠️ Analysis failed. Exercise extreme caution with this token.',
        reasons: [
          'Unable to fetch token data',
          'Recommend using established tokens only',
        ],
        metrics: {
          whaleConcentration: 0,
          holderCount: 0,
          transactionCount: 0,
          topHolderPercent: 0,
          tokenAgeHours: 0,
          bondingCurveProgress: 0,
          botActivityDetected: false,
          coordinatedPump: false,
          distributionTop10: 0,
        },
      };
    }
  }

  /**
   * Convert snake_case keys from Rust to camelCase for TypeScript
   */
  private convertSnakeToCamel(obj: any): TokenSafetyAnalysis {
    return {
      mintAddress: obj.mint_address,
      safeScore: obj.safe_score,
      riskLevel: obj.risk_level,
      recommendation: obj.recommendation,
      reasons: obj.reasons,
      metrics: {
        whaleConcentration: obj.metrics.whale_concentration,
        holderCount: obj.metrics.holder_count,
        transactionCount: obj.metrics.transaction_count,
        topHolderPercent: obj.metrics.top_holder_percent,
        tokenAgeHours: obj.metrics.token_age_hours,
        bondingCurveProgress: obj.metrics.bonding_curve_progress || 0,
        botActivityDetected: obj.metrics.bot_activity_detected,
        coordinatedPump: obj.metrics.coordinated_pump,
        distributionTop10: obj.metrics.distribution_top10,
      },
    };
  }

  /**
   * Quick safety check - returns true if safe to proceed
   */
  async isTokenSafe(mintAddress: string, minScore: number = 50): Promise<boolean> {
    const analysis = await this.analyzeToken(mintAddress);
    return analysis.safeScore >= minScore;
  }

  /**
   * Get cached analysis if available
   */
  getCachedAnalysis(mintAddress: string): TokenSafetyAnalysis | null {
    const cached = this.analysisCache.get(mintAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }
    return null;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
    logger.info('[TokenSafetyAgent] Analysis cache cleared');
  }

  /**
   * Get Claude AI recommendation for a token
   */
  private async getClaudeRecommendation(analysis: TokenSafetyAnalysis): Promise<{
    recommendation: string;
    confidence: number;
  }> {
    const prompt = `You are a Solana blockchain security expert. Analyze this token and provide a brief trading recommendation (2-3 sentences max).

TOKEN ANALYSIS:
- Safety Score: ${analysis.safeScore.toFixed(1)}/100
- Risk Level: ${analysis.riskLevel}
- Whale Concentration: ${analysis.metrics.whaleConcentration.toFixed(1)}%
- Holders: ${analysis.metrics.holderCount}
- Token Age: ${analysis.metrics.tokenAgeHours.toFixed(1)} hours
- Bot Activity: ${analysis.metrics.botActivityDetected ? 'DETECTED' : 'None'}
- Coordinated Pump: ${analysis.metrics.coordinatedPump ? 'DETECTED' : 'None'}
- Top 10 Distribution: ${analysis.metrics.distributionTop10.toFixed(1)}%

PATTERN DETECTION VERDICT:
${analysis.recommendation}

Key Issues:
${analysis.reasons.join('\n')}

Provide:
1. A concise recommendation (2-3 sentences)
2. Your confidence level (0-100)

Respond in JSON format:
{
  "recommendation": "your brief analysis here",
  "confidence": 85
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Claude response');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    return {
      recommendation: result.recommendation,
      confidence: result.confidence || 75,
    };
  }

  /**
   * Analyze token using Claude AI only (fallback when Rust unavailable)
   */
  private async analyzeTokenWithClaude(mintAddress: string): Promise<TokenSafetyAnalysis> {
    logger.info('[TokenSafetyAgent] Analyzing with Claude AI:', mintAddress.slice(0, 8) + '...');

    // Fetch basic on-chain data via Helius
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY not configured for Claude fallback');
    }

    // Get token metadata
    const metadataResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'token-analysis',
        method: 'getAsset',
        params: { id: mintAddress },
      }),
    });

    const metadataData = await metadataResponse.json();
    const tokenData = metadataData.result || {};

    // Build prompt for Claude
    const prompt = `You are a Solana token safety analyst. Analyze this token for rug pull risk.

TOKEN: ${mintAddress}
METADATA: ${JSON.stringify(tokenData, null, 2)}

Analyze for:
1. Whale concentration risk (large holders)
2. Liquidity and market cap
3. Token age and history
4. Holder distribution
5. Suspicious patterns

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "safeScore": 0-100,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "recommendation": "Brief recommendation",
  "reasons": ["reason1", "reason2"],
  "confidence": 0-100
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON response (handle markdown code blocks)
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const claudeResult = JSON.parse(jsonStr);

    const analysis: TokenSafetyAnalysis = {
      mintAddress,
      safeScore: claudeResult.safeScore,
      riskLevel: claudeResult.riskLevel,
      recommendation: claudeResult.recommendation,
      reasons: claudeResult.reasons,
      aiRecommendation: claudeResult.recommendation,
      aiConfidence: claudeResult.confidence,
      metrics: {
        whaleConcentration: 0,
        holderCount: tokenData.ownership?.owner ? 1 : 0,
        transactionCount: 0,
        topHolderPercent: 0,
        tokenAgeHours: 0,
        bondingCurveProgress: 0,
        botActivityDetected: false,
        coordinatedPump: false,
        distributionTop10: 0,
      },
    };

    // Cache result
    this.analysisCache.set(mintAddress, {
      result: analysis,
      timestamp: Date.now(),
    });

    logger.info('[TokenSafetyAgent] Claude analysis complete:', {
      mint: mintAddress.slice(0, 8) + '...',
      score: analysis.safeScore,
      risk: analysis.riskLevel,
    });

    return analysis;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.isRunning,
      cacheSize: this.analysisCache.size,
      analyzerPath: this.analyzerPath,
      claudeEnabled: this.claudeEnabled,
    };
  }

  /**
   * Batch analyze multiple tokens
   */
  async analyzeTokens(mintAddresses: string[]): Promise<Map<string, TokenSafetyAnalysis>> {
    const results = new Map<string, TokenSafetyAnalysis>();
    
    for (const mint of mintAddresses) {
      try {
        const analysis = await this.analyzeToken(mint);
        results.set(mint, analysis);
      } catch (error: any) {
        logger.error(`[TokenSafetyAgent] Failed to analyze ${mint}:`, error.message);
      }
    }
    
    return results;
  }
}
