use epub::doc::EpubDoc;
use serde::{Serialize, Deserialize};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![read_epub])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

