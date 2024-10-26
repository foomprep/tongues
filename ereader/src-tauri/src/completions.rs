pub async fn query_haiku(prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let api_key = std::env::var("ANTHROPIC_API_KEY").expect("ANTHROPIC_API_KEY must be set");
    let response = client
        .post("https://api.anthropic.com/v1/completions")
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01")
        .header("X-API-Key", api_key)
        .json(&serde_json::json!({
            "model": "claude-3-haiku-20240307",
            "prompt": prompt, 
            "max_tokens_to_sample": 100,
            "temperature": 0.0
        }))
        .send()
        .await?;

    let body: serde_json::Value = response.json().await?;

    Ok(body.to_string())
}
