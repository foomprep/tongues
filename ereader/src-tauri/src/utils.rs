use std::{io::Read, path::Path};
use zip::ZipArchive;
use std::fs::File;
use crate::completions::query_haiku;
use std::error::Error;
use std::collections::HashMap;
use xml::reader::{EventReader, XmlEvent};
use std::io::BufReader;

pub fn parse_epub_toc(epub_path: &Path) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let file = File::open(epub_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut toc = HashMap::new();

    // Read the container.xml file to find the OPF file
    let container_xml = archive.by_name("META-INF/container.xml")?;
    let parser = EventReader::new(BufReader::new(container_xml));
    let mut opf_path = String::new();

    for event in parser {
        if let Ok(XmlEvent::StartElement { name, attributes, .. }) = event {
            if name.local_name == "rootfile" {
                if let Some(attr) = attributes.iter().find(|a| a.name.local_name == "full-path") {
                    opf_path = attr.value.clone();
                    break;
                }
            }
        }
    }

    if opf_path.is_empty() {
        return Err("OPF file not found".into());
    }

    // Read the OPF file to find the TOC file
    let opf_content = archive.by_name(&opf_path)?;
    let parser = EventReader::new(BufReader::new(opf_content));
    let mut toc_id = String::new();
    let mut toc_href = String::new();

    for event in parser {
        if let Ok(XmlEvent::StartElement { name, attributes, .. }) = event {
            if name.local_name == "spine" {
                if let Some(attr) = attributes.iter().find(|a| a.name.local_name == "toc") {
                    toc_id = attr.value.clone();
                }
            } else if name.local_name == "item" {
                if let (Some(id), Some(href)) = (
                    attributes.iter().find(|a| a.name.local_name == "id"),
                    attributes.iter().find(|a| a.name.local_name == "href")
                ) {
                    if id.value == toc_id {
                        toc_href = href.value.clone();
                        break;
                    }
                }
            }
        }
    }

    if toc_href.is_empty() {
        return Err("TOC file not found".into());
    }

    // Read the TOC file
    let toc_content = archive.by_name(&toc_href)?;
    let mut parser = EventReader::new(BufReader::new(toc_content));

    if toc_href.ends_with(".ncx") {
        // EPUB 2 TOC
        let mut current_label = String::new();
        let mut current_content = String::new();

        while let Ok(event) = parser.next() {
            match event {
                XmlEvent::StartElement { name, .. } if name.local_name == "text" => {
                    let next_event = parser.next().unwrap();
                    match next_event {
                        XmlEvent::Characters(text) => {
                            current_label = text;
                        }
                        _ => {}
                    }
                }
                XmlEvent::StartElement { name, attributes, .. } if name.local_name == "content" => {
                    if let Some(attr) = attributes.iter().find(|a| a.name.local_name == "src") {
                        current_content = attr.value.clone();
                    }
                }
                XmlEvent::EndElement { name } if name.local_name == "navPoint" => {
                    if !current_label.is_empty() && !current_content.is_empty() {
                        toc.insert(current_label.trim().to_string(), current_content.clone());
                    }
                    current_label.clear();
                    current_content.clear();
                }
                XmlEvent::EndDocument => break,
                _ => {}
            }
        }

    } else {
        // EPUB 3 TOC
        let mut current_label = String::new();
        let mut current_content = String::new();

        for event in parser {
            match event {
                Ok(XmlEvent::StartElement { name, attributes, .. }) if name.local_name == "a" => {
                    if let Some(attr) = attributes.iter().find(|a| a.name.local_name == "href") {
                        current_content = attr.value.clone();
                    }
                }
                Ok(XmlEvent::Characters(text)) => {
                    current_label.push_str(&text);
                }
                Ok(XmlEvent::EndElement { name }) if name.local_name == "a" => {
                    if !current_label.is_empty() && !current_content.is_empty() {
                        toc.insert(current_label.trim().to_string(), current_content.clone());
                    }
                    current_label.clear();
                    current_content.clear();
                }
                _ => {}
            }
        }
    }


    Ok(toc)
}

// TODO implement better error handling
pub async fn get_epub_language(epub_path: &Path) -> Result<Option<String>, Box<dyn Error>> {
    // Open the EPUB file
    let file = File::open(epub_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Extract content from EPUB
    let mut content = String::new();
    if let Ok(mut file) = archive.by_index(5) {
        if file.name().ends_with(".xhtml") || file.name().ends_with(".html") {
            let mut file_content = String::new();
            if file.read_to_string(&mut file_content).is_ok() {
                content.push_str(&file_content);
            }
        }
    }

    // Truncate content if it's too long
    if content.len() > 5000 {
        content.truncate(5000);
    }

    // Create prompt for language detection
    let prompt = format!("You are a language detector. You will be given an html string and will determine the language of the page. If unable to determine, respond with only word unknown, otherwise only return the language. \n\nHtml: {}\n", content);

    // Query Haiku for language detection
    let response = query_haiku(&prompt).await.map_err(|e| e.to_string())?;
let language = response["content"][0]["text"].to_string().replace("\"", "");

    // Return the detected language, or None if it's "unknown"
    if language == "unknown" {
        Ok(None)
    } else {
        Ok(Some(language))
    }
}

