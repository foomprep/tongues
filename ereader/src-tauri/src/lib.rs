pub mod utils;
pub mod completions;

use std::path::Path;

use aws_config::BehaviorVersion;
use epub::doc::EpubDoc;
use serde::{Serialize, Deserialize};
use reqwest::Client;
use serde_json::{json, Value};
use aws_sdk_polly::Client as PollyClient;
use aws_sdk_polly::types::{VoiceId, OutputFormat::Mp3};
use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;

use anyhow::{Result, Context};

use scraper::{Html, Selector, ElementRef};
use crate::utils::get_epub_language;

#[derive(Serialize)]
struct BinaryResponse {
    data: Vec<u8>,
    mime_type: String,
}

// TODO this function does not seem to wrap all words for given epubs ???
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

#[derive(Debug, Serialize)]
struct Chapter {
    title: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct Book {
    title: String,
    chapters: Vec<Chapter>,
    language: String,
}

#[tauri::command]
async fn parse_epub(epub_path: String) -> Result<Book, String> {
    let mut doc = EpubDoc::new(epub_path.clone())
        .map_err(|e| e.to_string())?;

    let language = match get_epub_language(Path::new(&epub_path)).await.map_err(|e| e.to_string())? {
        Some(l) => l,
        None => "unknown".to_string(), 
    };

    let toc = doc.toc.clone();
    let mut chapters = Vec::<Chapter>::new();
    for nav_point in toc {
        let title = nav_point.label;
        let content = match doc.get_resource_str_by_path(nav_point.content) {
            Some(content_str) => wrap_words_with_translate(&content_str),
            None => "".to_string(),
        };

        let chapter = Chapter {
            title,
            content,
        };
        chapters.push(chapter); 

    }
    let title = match doc.mdata("title") {
        Some(t) => t,
        None => "Unknown title".to_string(),
    };

    let book = Book {
        title,
        chapters,
        language,
    };

    Ok(book)
}


#[derive(Debug, Serialize, Deserialize)]
struct Translation {
    text: String,
}

#[tauri::command]
async fn get_translation(text: String, source_language: String, target_language: String) -> Result<Translation, String> {
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
    let response_json: Value = serde_json::from_str(&response_text).map_err(|e| e.to_string())?;
    let translation = Translation {
        text: response_json["content"][0]["text"].to_string().replace("\"", ""),
    };

    Ok(translation)
}

#[tauri::command]
async fn synthesize_speech(text: &str, language: &str) -> Result<BinaryResponse, String> {
    let config = aws_config::load_defaults(BehaviorVersion::v2024_03_28()).await;
    let client = PollyClient::new(&config);
    
    let voice_id = match language {
        "en" => VoiceId::Matthew,
        "es" => VoiceId::Miguel,
        "fr" => VoiceId::Mathieu,
        _ => return Err("Unsupported language".into()),
    };

    let output = client.synthesize_speech()
        .output_format(Mp3)
        .text(text)
        .voice_id(voice_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let audio_stream = output.audio_stream;
    let data = audio_stream.collect().await.map_err(|e| e.to_string())?;

    Ok(BinaryResponse {
        data: data.to_vec(),
        mime_type: "audio/mp3".to_string(),
    })
}

#[tauri::command]
fn play_mp3(mp3_data: Vec<u8>) -> Result<(), String> {
    let (_stream, stream_handle) = OutputStream::try_default().map_err(|e| e.to_string())?;
    let sink = Sink::try_new(&stream_handle).map_err(|e| e.to_string())?;

    let cursor = Cursor::new(mp3_data);
    let source = Decoder::new(cursor).map_err(|e| e.to_string())?;

    sink.append(source);
    sink.sleep_until_end();

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![parse_epub, get_translation, synthesize_speech, play_mp3])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
