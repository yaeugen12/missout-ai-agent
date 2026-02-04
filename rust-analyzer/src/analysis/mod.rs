/**
 * COMPREHENSIVE TOKEN SAFETY ANALYSIS
 * 
 * Ported from profit/ trading bot with 20+ pattern detectors
 * Adapted for on-chain Helius RPC data
 */

pub mod patterns;
pub mod detectors;

use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use patterns::{TokenContext, HolderInfo, TransactionInfo};
use detectors::{get_all_detectors, calculate_composite_score, generate_recommendation, extract_key_reasons};

#[derive(Debug, Serialize, Deserialize)]
pub struct SafetyAnalysis {
    pub mint_address: String,
    pub safe_score: f64,         // 0-100
    pub risk_level: String,       // "low", "medium", "high", "critical"
    pub recommendation: String,
    pub reasons: Vec<String>,
    pub metrics: SafetyMetrics,
    pub pattern_signals: Vec<PatternSignalOutput>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PatternSignalOutput {
    pub name: String,
    pub score: f64,
    pub confidence: f64,
    pub details: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SafetyMetrics {
    pub whale_concentration: f64,  // Top 3 holders %
    pub holder_count: usize,
    pub transaction_count: usize,
    pub top_holder_percent: f64,
    pub token_age_hours: f64,
    pub bot_activity_detected: bool,
    pub coordinated_pump: bool,
    pub distribution_top10: f64,
}

#[derive(Debug, Deserialize)]
struct HeliusTokenAccount {
    account: String,
    amount: String,
}

#[derive(Debug, Deserialize)]
struct HeliusLargestAccounts {
    value: Vec<HeliusTokenAccount>,
}

#[derive(Debug, Deserialize)]
struct HeliusAccountInfo {
    data: HeliusAccountData,
}

#[derive(Debug, Deserialize)]
struct HeliusAccountData {
    parsed: HeliusParsedData,
}

#[derive(Debug, Deserialize)]
struct HeliusParsedData {
    info: HeliusTokenInfo,
}

#[derive(Debug, Deserialize)]
struct HeliusTokenInfo {
    #[serde(rename = "tokenAmount")]
    token_amount: TokenAmount,
    owner: String,
}

#[derive(Debug, Deserialize)]
struct TokenAmount {
    amount: String,
    decimals: u8,
    #[serde(rename = "uiAmount")]
    ui_amount: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct HeliusSignature {
    signature: String,
    #[serde(rename = "blockTime")]
    block_time: Option<i64>,
}

pub struct TokenAnalyzer {
    client: Client,
    rpc_url: String,
}

impl TokenAnalyzer {
    pub fn new() -> Result<Self> {
        let rpc_url = std::env::var("SOLANA_RPC_URL")
            .unwrap_or_else(|_| "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY".to_string());
        
        Ok(Self {
            client: Client::new(),
            rpc_url,
        })
    }
    
    pub async fn analyze(&self, mint_address: &str) -> Result<SafetyAnalysis> {
        // Fetch token holders
        let holders = self.fetch_token_holders(mint_address).await?;
        
        // Fetch recent transactions
        let transactions = self.fetch_recent_transactions(mint_address).await?;
        
        // Estimate creation time (oldest transaction)
        let creation_time = transactions
            .iter()
            .map(|tx| tx.timestamp)
            .filter(|&t| t > 0)
            .min()
            .unwrap_or_else(|| chrono::Utc::now().timestamp());
        
        let current_time = chrono::Utc::now().timestamp();
        
        // Build context for pattern analysis
        let context = self.build_context(
            mint_address,
            &holders,
            &transactions,
            creation_time,
            current_time,
        )?;
        
        // Run all pattern detectors
        let detectors = get_all_detectors();
        let mut signals = Vec::new();
        
        for detector in detectors {
            let signal = detector.detect(&context);
            signals.push(signal);
        }
        
        // Calculate composite score
        let safe_score = calculate_composite_score(&signals);
        
        // Determine risk level
        let risk_level = self.determine_risk_level(safe_score);
        
        // Generate recommendation
        let recommendation = generate_recommendation(safe_score, &signals);
        
        // Extract key reasons
        let reasons = extract_key_reasons(&signals);
        
        // Build metrics
        let metrics = SafetyMetrics {
            whale_concentration: context.whale_concentration(3),
            holder_count: context.unique_wallets(),
            transaction_count: context.transaction_count(),
            top_holder_percent: context.top_holder_percent(),
            token_age_hours: context.age_hours(),
            bot_activity_detected: context.has_bot_activity(5),
            coordinated_pump: context.has_coordinated_pump(5, 10),
            distribution_top10: context.whale_concentration(10),
        };
        
        // Convert signals for output
        let pattern_signals: Vec<PatternSignalOutput> = signals
            .iter()
            .map(|s| PatternSignalOutput {
                name: s.name.clone(),
                score: s.score,
                confidence: s.confidence,
                details: s.details.clone(),
            })
            .collect();
        
        Ok(SafetyAnalysis {
            mint_address: mint_address.to_string(),
            safe_score,
            risk_level,
            recommendation,
            reasons,
            metrics,
            pattern_signals,
        })
    }
    
    fn build_context(
        &self,
        mint: &str,
        holders: &[HolderInfo],
        transactions: &[TransactionInfo],
        creation_time: i64,
        current_time: i64,
    ) -> Result<TokenContext> {
        Ok(TokenContext {
            mint: mint.to_string(),
            holders: holders.to_vec(),
            transactions: transactions.to_vec(),
            creation_time,
            current_time,
        })
    }
    
    async fn fetch_token_holders(&self, mint: &str) -> Result<Vec<HolderInfo>> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenLargestAccounts",
            "params": [mint]
        });
        
        let response: serde_json::Value = self.client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await?
            .json()
            .await?;
        
        if let Some(error) = response.get("error") {
            return Err(anyhow!("RPC error: {}", error));
        }
        
        let accounts = response["result"]["value"]
            .as_array()
            .ok_or_else(|| anyhow!("Invalid response format"))?;
        
        // Calculate total supply
        let mut total_supply: f64 = 0.0;
        let mut raw_holders = Vec::new();
        
        for account in accounts {
            if let Some(amount_str) = account["amount"].as_str() {
                if let Ok(amount) = amount_str.parse::<f64>() {
                    let ui_amount = amount / 1_000_000.0; // Assuming 6 decimals
                    total_supply += ui_amount;
                    
                    if let Some(address) = account["address"].as_str() {
                        raw_holders.push((address.to_string(), ui_amount));
                    }
                }
            }
        }
        
        if total_supply == 0.0 {
            return Err(anyhow!("Zero total supply"));
        }
        
        // Calculate percentages and sort by balance
        let mut holders: Vec<HolderInfo> = raw_holders
            .into_iter()
            .map(|(address, balance)| HolderInfo {
                address,
                balance,
                percent: (balance / total_supply) * 100.0,
            })
            .collect();
        
        holders.sort_by(|a, b| b.percent.partial_cmp(&a.percent).unwrap());
        
        Ok(holders)
    }
    
    async fn fetch_recent_transactions(&self, mint: &str) -> Result<Vec<TransactionInfo>> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [mint, {"limit": 100}]
        });
        
        let response: serde_json::Value = self.client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await?
            .json()
            .await?;
        
        if let Some(error) = response.get("error") {
            return Err(anyhow!("RPC error: {}", error));
        }
        
        let sigs = response["result"]
            .as_array()
            .ok_or_else(|| anyhow!("Invalid response format"))?;
        
        let mut transactions = Vec::new();
        for sig in sigs {
            if let Some(signature) = sig["signature"].as_str() {
                let timestamp = sig["blockTime"].as_i64().unwrap_or(0);
                
                transactions.push(TransactionInfo {
                    signature: signature.to_string(),
                    timestamp,
                    tx_type: "unknown".to_string(), // We don't parse tx type for now
                });
            }
        }
        
        // Sort by timestamp (oldest first)
        transactions.sort_by_key(|tx| tx.timestamp);
        
        Ok(transactions)
    }
    
    fn determine_risk_level(&self, score: f64) -> String {
        if score >= 70.0 {
            "low".to_string()
        } else if score >= 50.0 {
            "medium".to_string()
        } else if score >= 30.0 {
            "high".to_string()
        } else {
            "critical".to_string()
        }
    }
}
