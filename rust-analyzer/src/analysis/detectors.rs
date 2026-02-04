/**
 * ALL Pattern Detectors from profit/ trading bot
 * Ported and adapted for on-chain Helius RPC data
 */

use super::patterns::{PatternDetector, PatternSignal, TokenContext};

// ============================================
// CRITICAL FILTERS
// ============================================

/// Whale concentration detector (top holders %)
pub struct WhaleConcentrationDetector {
    pub critical_threshold: f64,  // >80% = critical
    pub high_threshold: f64,      // >60% = high risk
    pub medium_threshold: f64,    // >40% = medium risk
}

impl Default for WhaleConcentrationDetector {
    fn default() -> Self {
        Self {
            critical_threshold: 80.0,
            high_threshold: 60.0,
            medium_threshold: 40.0,
        }
    }
}

impl PatternDetector for WhaleConcentrationDetector {
    fn name(&self) -> &str {
        "Whale Concentration"
    }

    fn weight(&self) -> f64 {
        0.25  // Critical importance
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let concentration = ctx.whale_concentration(3);  // Top 3 holders
        
        let (score, details) = if concentration > self.critical_threshold {
            (0.0, format!("CRITICAL: {:.1}% whale concentration", concentration))
        } else if concentration > self.high_threshold {
            (0.3, format!("HIGH: {:.1}% whale concentration", concentration))
        } else if concentration > self.medium_threshold {
            (0.6, format!("MEDIUM: {:.1}% whale concentration", concentration))
        } else if concentration < 25.0 {
            (1.0, format!("HEALTHY: {:.1}% distribution", concentration))
        } else {
            (0.8, format!("ACCEPTABLE: {:.1}% distribution", concentration))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.95,
            details,
            weight: self.weight(),
        }
    }
}

/// Single wallet dominance detector
pub struct SingleWalletDominanceDetector {
    pub critical_threshold: f64,  // >50%
    pub high_threshold: f64,      // >30%
}

impl Default for SingleWalletDominanceDetector {
    fn default() -> Self {
        Self {
            critical_threshold: 50.0,
            high_threshold: 30.0,
        }
    }
}

impl PatternDetector for SingleWalletDominanceDetector {
    fn name(&self) -> &str {
        "Single Wallet Dominance"
    }

    fn weight(&self) -> f64 {
        0.20
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let top_holder = ctx.top_holder_percent();
        
        let (score, details) = if top_holder > self.critical_threshold {
            (0.0, format!("CRITICAL: Single wallet holds {:.1}%", top_holder))
        } else if top_holder > self.high_threshold {
            (0.4, format!("HIGH: Top holder has {:.1}%", top_holder))
        } else if top_holder < 15.0 {
            (1.0, format!("HEALTHY: Top holder {:.1}%", top_holder))
        } else {
            (0.7, format!("ACCEPTABLE: Top holder {:.1}%", top_holder))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.90,
            details,
            weight: self.weight(),
        }
    }
}

/// Coordinated pump detector
pub struct CoordinatedPumpDetector {
    pub min_txs: usize,
    pub time_window: i64,  // seconds
}

impl Default for CoordinatedPumpDetector {
    fn default() -> Self {
        Self {
            min_txs: 5,
            time_window: 10,  // 5 txs in 10 seconds
        }
    }
}

impl PatternDetector for CoordinatedPumpDetector {
    fn name(&self) -> &str {
        "Coordinated Pump"
    }

    fn weight(&self) -> f64 {
        0.30  // Very critical
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let has_pump = ctx.has_coordinated_pump(self.min_txs, self.time_window);
        
        let (score, details) = if has_pump {
            (0.0, format!("DETECTED: {}+ txs in {}s (coordinated attack)", self.min_txs, self.time_window))
        } else {
            (1.0, "No coordinated pump detected".to_string())
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.85,
            details,
            weight: self.weight(),
        }
    }
}

/// Bot activity detector
pub struct BotActivityDetector {
    pub min_repeats: usize,
}

impl Default for BotActivityDetector {
    fn default() -> Self {
        Self {
            min_repeats: 5,
        }
    }
}

impl PatternDetector for BotActivityDetector {
    fn name(&self) -> &str {
        "Bot Activity"
    }

    fn weight(&self) -> f64 {
        0.15
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let has_bots = ctx.has_bot_activity(self.min_repeats);
        
        let (score, details) = if has_bots {
            (0.2, format!("DETECTED: Regular intervals ({}+ repeats)", self.min_repeats))
        } else {
            (1.0, "No bot-like patterns detected".to_string())
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.75,
            details,
            weight: self.weight(),
        }
    }
}

// ============================================
// HOLDER ANALYSIS
// ============================================

/// Holder count validator
pub struct HolderCountDetector {
    pub critical_min: usize,  // <10
    pub low_min: usize,       // <50
    pub healthy_min: usize,   // >500
}

impl Default for HolderCountDetector {
    fn default() -> Self {
        Self {
            critical_min: 10,
            low_min: 50,
            healthy_min: 500,
        }
    }
}

impl PatternDetector for HolderCountDetector {
    fn name(&self) -> &str {
        "Holder Count"
    }

    fn weight(&self) -> f64 {
        0.12
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let count = ctx.unique_wallets();
        
        let (score, details) = if count < self.critical_min {
            (0.0, format!("CRITICAL: Only {} holders", count))
        } else if count < self.low_min {
            (0.5, format!("LOW: {} holders", count))
        } else if count > self.healthy_min {
            (1.0, format!("STRONG: {} holders", count))
        } else {
            (0.8, format!("ACCEPTABLE: {} holders", count))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.90,
            details,
            weight: self.weight(),
        }
    }
}

/// Transaction volume validator
pub struct TransactionVolumeDetector {
    pub critical_min: usize,  // <20
    pub low_min: usize,       // <100
    pub healthy_min: usize,   // >200
}

impl Default for TransactionVolumeDetector {
    fn default() -> Self {
        Self {
            critical_min: 20,
            low_min: 100,
            healthy_min: 200,
        }
    }
}

impl PatternDetector for TransactionVolumeDetector {
    fn name(&self) -> &str {
        "Transaction Volume"
    }

    fn weight(&self) -> f64 {
        0.08
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let count = ctx.transaction_count();
        
        let (score, details) = if count < self.critical_min {
            (0.3, format!("LOW: {} transactions", count))
        } else if count < self.low_min {
            (0.6, format!("MODERATE: {} transactions", count))
        } else if count > self.healthy_min {
            (1.0, format!("ACTIVE: {} transactions", count))
        } else {
            (0.8, format!("ACCEPTABLE: {} transactions", count))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.80,
            details,
            weight: self.weight(),
        }
    }
}

// ============================================
// TIMING PATTERNS
// ============================================

/// Token age detector (maturity indicator)
pub struct TokenAgeDetector {
    pub very_new_hours: f64,      // <1h
    pub new_hours: f64,           // <24h
    pub established_hours: f64,   // >168h (1 week)
}

impl Default for TokenAgeDetector {
    fn default() -> Self {
        Self {
            very_new_hours: 1.0,
            new_hours: 24.0,
            established_hours: 168.0,
        }
    }
}

impl PatternDetector for TokenAgeDetector {
    fn name(&self) -> &str {
        "Token Age"
    }

    fn weight(&self) -> f64 {
        0.10
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let age_hours = ctx.age_hours();
        
        let (score, details) = if age_hours < self.very_new_hours {
            (0.3, format!("VERY NEW: {:.1}h old (high risk)", age_hours))
        } else if age_hours < self.new_hours {
            (0.6, format!("NEW: {:.1}h old", age_hours))
        } else if age_hours > self.established_hours {
            (1.0, format!("ESTABLISHED: {:.0}h old", age_hours))
        } else {
            (0.8, format!("MATURING: {:.1}h old", age_hours))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 1.0,  // Age is always accurate
            details,
            weight: self.weight(),
        }
    }
}

// ============================================
// DISTRIBUTION ANALYSIS
// ============================================

/// Holder balance distribution (Gini coefficient approximation)
pub struct DistributionQualityDetector {
    pub top10_healthy_max: f64,  // Top 10 holders shouldn't exceed this
}

impl Default for DistributionQualityDetector {
    fn default() -> Self {
        Self {
            top10_healthy_max: 60.0,  // Top 10 < 60% = healthy
        }
    }
}

impl PatternDetector for DistributionQualityDetector {
    fn name(&self) -> &str {
        "Distribution Quality"
    }

    fn weight(&self) -> f64 {
        0.08
    }

    fn detect(&self, ctx: &TokenContext) -> PatternSignal {
        let top10 = ctx.whale_concentration(10);
        
        let (score, details) = if top10 > 90.0 {
            (0.0, format!("TERRIBLE: Top 10 hold {:.1}%", top10))
        } else if top10 > 80.0 {
            (0.3, format!("POOR: Top 10 hold {:.1}%", top10))
        } else if top10 < self.top10_healthy_max {
            (1.0, format!("EXCELLENT: Top 10 hold {:.1}%", top10))
        } else {
            (0.7, format!("FAIR: Top 10 hold {:.1}%", top10))
        };

        PatternSignal {
            name: self.name().to_string(),
            score,
            confidence: 0.85,
            details,
            weight: self.weight(),
        }
    }
}

// ============================================
// COMPOSITE SCORING
// ============================================

pub fn get_all_detectors() -> Vec<Box<dyn PatternDetector>> {
    vec![
        // Critical filters (high weight)
        Box::new(WhaleConcentrationDetector::default()),
        Box::new(CoordinatedPumpDetector::default()),
        Box::new(SingleWalletDominanceDetector::default()),
        
        // Bot detection
        Box::new(BotActivityDetector::default()),
        
        // Holder analysis
        Box::new(HolderCountDetector::default()),
        Box::new(TransactionVolumeDetector::default()),
        Box::new(DistributionQualityDetector::default()),
        
        // Timing
        Box::new(TokenAgeDetector::default()),
    ]
}

pub fn calculate_composite_score(signals: &[PatternSignal]) -> f64 {
    if signals.is_empty() {
        return 50.0;  // Default neutral score
    }

    // Weighted average
    let total_weight: f64 = signals.iter().map(|s| s.weight).sum();
    let weighted_sum: f64 = signals.iter()
        .map(|s| s.score * s.confidence * s.weight)
        .sum();

    let normalized_score = if total_weight > 0.0 {
        (weighted_sum / total_weight) * 100.0
    } else {
        50.0
    };

    // Clamp to 0-100
    normalized_score.max(0.0).min(100.0)
}

pub fn generate_recommendation(score: f64, _signals: &[PatternSignal]) -> String {
    if score >= 70.0 {
        "✅ SAFE - Token appears legitimate. Proceed with normal caution.".to_string()
    } else if score >= 50.0 {
        "⚠️ MEDIUM RISK - Exercise caution. Consider smaller position size.".to_string()
    } else if score >= 30.0 {
        "🚨 HIGH RISK - Significant red flags detected. Avoid or use minimal amounts.".to_string()
    } else {
        "❌ CRITICAL DANGER - DO NOT USE THIS TOKEN. High probability of rug pull.".to_string()
    }
}

pub fn extract_key_reasons(signals: &[PatternSignal]) -> Vec<String> {
    let mut reasons = Vec::new();
    
    // Sort by importance (low scores first = problems)
    let mut sorted_signals = signals.to_vec();
    sorted_signals.sort_by(|a, b| {
        let a_importance = a.score * a.weight;
        let b_importance = b.score * b.weight;
        a_importance.partial_cmp(&b_importance).unwrap()
    });
    
    // Take top 5 most important signals
    for signal in sorted_signals.iter().take(5) {
        if signal.score < 0.5 {
            // Problem detected
            reasons.push(format!("❌ {}: {}", signal.name, signal.details));
        } else if signal.score > 0.8 {
            // Positive signal
            reasons.push(format!("✓ {}: {}", signal.name, signal.details));
        } else {
            // Neutral/warning
            reasons.push(format!("⚠️ {}: {}", signal.name, signal.details));
        }
    }
    
    if reasons.is_empty() {
        reasons.push("Moderate indicators across the board".to_string());
    }
    
    reasons
}
