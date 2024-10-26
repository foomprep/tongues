use epub::doc::EpubDoc;
use serde::{Serialize, Deserialize};
use reqwest::Client;
use serde_json::json;

use scraper::{Html, Selector, ElementRef};

fn wrap_words_with_translate(html: &str) -> String {
    // Parse the HTML string
    let fragment = Html::parse_fragment(html);
    
    // Select all p and h1-h6 tags
    let text_selector = Selector::parse("p, h1, h2, h3, h4, h5, h6").unwrap();
    
    let mut output = String::new();
    
    // Process each element in the document
    for element in fragment.root_element().children() {
        if let Some(element) = ElementRef::wrap(element) {
            if text_selector.matches(&element) {
                // Start tag
                output.push_str(&format!("<{}", element.value().name()));
                for attr in element.value().attrs() {
                    output.push_str(&format!(" {}=\"{}\"", attr.0, attr.1));
                }
                output.push('>');
                
                // Process children
                for child in element.children() {
                    match child.value() {
                        scraper::node::Node::Text(text) => {
                            // Split and wrap words
                            let wrapped = text
                                .split_whitespace()
                                .map(|word| format!(
                                    r#"<span onclick="window.translate(this.innerText)">{}</span>"#, 
                                    word
                                ))
                                .collect::<Vec<_>>()
                                .join(" ");
                            output.push_str(&wrapped);
                        },
                        scraper::node::Node::Element(_) => {
                            if let Some(child_el) = ElementRef::wrap(child) {
                                // Keep other elements as-is
                                output.push_str("<");
                                output.push_str(&child_el.value().name().to_string());
                                for attr in child_el.value().attrs() {
                                    output.push_str(&format!(" {}=\"{}\"", attr.0, attr.1));
                                }
                                output.push_str(">");
                                
                                // Process child element's text
                                for child_node in child_el.children() {
                                    if let scraper::node::Node::Text(text) = child_node.value() {
                                        output.push_str(text);
                                    }
                                }
                                
                                output.push_str("</");
                                output.push_str(&child_el.value().name().to_string());
                                output.push_str(">");
                            }
                        },
                        _ => {}
                    }
                }
                
                // End tag
                output.push_str(&format!("</{}>", element.value().name()));
            } else {
                // Non-matching element, keep as-is
                output.push_str(&format!("<{}", element.value().name()));
                for attr in element.value().attrs() {
                    output.push_str(&format!(" {}=\"{}\"", attr.0, attr.1));
                }
                output.push('>');
                
                for child in element.children() {
                    match child.value() {
                        scraper::node::Node::Text(text) => output.push_str(text),
                        scraper::node::Node::Element(_) => {
                            if let Some(child_el) = ElementRef::wrap(child) {
                                output.push_str("<");
                                output.push_str(&child_el.value().name().to_string());
                                for attr in child_el.value().attrs() {
                                    output.push_str(&format!(" {}=\"{}\"", attr.0, attr.1));
                                }
                                output.push_str(">");
                                
                                for child_node in child_el.children() {
                                    if let scraper::node::Node::Text(text) = child_node.value() {
                                        output.push_str(text);
                                    }
                                }
                                
                                output.push_str("</");
                                output.push_str(&child_el.value().name().to_string());
                                output.push_str(">");
                            }
                        },
                        _ => {}
                    }
                }
                
                output.push_str(&format!("</{}>", element.value().name()));
            }
        }
    }
    
    output
}

#[derive(Debug, Serialize, Deserialize)]
struct Chapter {
    title: String,
    content: String,
    index: usize,
}

#[tauri::command]
async fn read_epub(path: String) -> Result<Vec<Chapter>, String> {
    let mut doc = match EpubDoc::new(&path) {
        Ok(doc) => doc,
        Err(e) => return Err(format!("Failed to open EPUB: {}", e)),
    };
    
    let mut chapters = Vec::new();
    let spine = doc.spine.clone();
    
    for (index, item) in spine.iter().enumerate() {
        if let Some((content, _mimetype)) = doc.get_resource_str(&item) {
            let modified_content = wrap_words_with_translate(&content);
            chapters.push(Chapter {
                title: format!("Chapter {}", index + 1),
                content: modified_content,
                index,
            });
        }
    }
    
    Ok(chapters)
}

#[tauri::command]
async fn get_translation(text: String, source_language: String, target_language: String) -> Result<String, String> {
    let client = Client::new();
    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|e| e.to_string())?;
    let prompt = format!("Translate the text from the source language to the target language.  Only return the translated text. 

Text: {}
Source Language: {}
Target Language: {}
", &text, &source_language, &target_language);

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("X-API-Key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let response_text = response.text().await.map_err(|e| e.to_string())?;
    Ok(response_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![read_epub, get_translation])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
