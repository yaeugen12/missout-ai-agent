/**
 * Pattern Detection Framework
 * 
 * Ported from profit/ trading bot analysis system
 * Adapted to work with Helius RPC on-chain data
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenContext {
    pub mint: String,
    pub holders: Vec<HolderInfo>,
    pub transactions: Vec<TransactionInfo>,
    pub creation_time: i64,
    pub current_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HolderInfo {
    pub address: String,
    pub balance: f64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub signature: String,
    pub timestamp: i64,
    pub tx_type: String, // "buy", "sell", "transfer"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternSignal {
    pub name: String,
    pub score: f64,       // 0.0 to 1.0
    pub confidence: f64,  // 0.0 to 1.0
    pub details: String,
    pub weight: f64,
}

impl TokenContext {
    /// Get token age in seconds
    pub fn age_seconds(&self) -> i64 {
        self.current_time - self.creation_time
    }

    /// Get token age in hours
    pub fn age_hours(&self) -> f64 {
        self.age_seconds() as f64 / 3600.0
    }

    /// Calculate whale concentration (top N holders)
    pub fn whale_concentration(&self, top_n: usize) -> f64 {
        self.holders
            .iter()
            .take(top_n)
            .map(|h| h.percent)
            .sum()
    }

    /// Get top holder percentage
    pub fn top_holder_percent(&self) -> f64 {
        self.holders
            .first()
            .map(|h| h.percent)
            .unwrap_or(0.0)
    }

    /// Count unique wallets from transactions
    pub fn unique_wallets(&self) -> usize {
        self.holders.len()
    }

    /// Get transaction count
    pub fn transaction_count(&self) -> usize {
        self.transactions.len()
    }

    /// Detect coordinated pump (many txs in short time)
    pub fn has_coordinated_pump(&self, min_txs: usize, time_window_secs: i64) -> bool {
        if self.transactions.len() < min_txs {
            return false;
        }

        // Check first N transactions
        let first_txs: Vec<_> = self.transactions
            .iter()
            .take(10)
            .collect();

        if first_txs.len() < min_txs {
            return false;
        }

        let time_span = first_txs.last().unwrap().timestamp - first_txs.first().unwrap().timestamp;
        time_span < time_window_secs
    }

    /// Detect bot activity (regular intervals)
    pub fn has_bot_activity(&self, min_repeats: usize) -> bool {
        if self.transactions.len() < 10 {
            return false;
        }

        // Calculate intervals
        let mut intervals: HashMap<i64, usize> = HashMap::new();
        for i in 1..self.transactions.len().min(20) {
            let interval = (self.transactions[i].timestamp - self.transactions[i - 1].timestamp).abs();
            *intervals.entry(interval).or_insert(0) += 1;
        }

        // If any interval repeats min_repeats times = bot
        intervals.values().any(|&count| count >= min_repeats)
    }
}

pub trait PatternDetector {
    fn name(&self) -> &str;
    fn detect(&self, ctx: &TokenContext) -> PatternSignal;
    fn weight(&self) -> f64;
}
