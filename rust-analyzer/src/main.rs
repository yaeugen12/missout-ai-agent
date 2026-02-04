use anyhow::Result;
use serde::Serialize;

mod analysis;
use analysis::SafetyAnalysis;
use analysis::TokenAnalyzer;

#[derive(Debug, Serialize)]
struct AnalysisOutput {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<SafetyAnalysis>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    
    if args.len() < 2 {
        eprintln!("Usage: analyze-token <MINT_ADDRESS>");
        std::process::exit(1);
    }
    
    let mint_address = &args[1];
    
    // Initialize analyzer
    let analyzer = TokenAnalyzer::new()?;
    
    // Perform analysis
    let result = match analyzer.analyze(mint_address).await {
        Ok(analysis) => AnalysisOutput {
            success: true,
            data: Some(analysis),
            error: None,
        },
        Err(e) => AnalysisOutput {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    };
    
    // Output JSON to stdout
    println!("{}", serde_json::to_string(&result)?);
    
    Ok(())
}
