use std::{io::Read, path::Path};
use zip::ZipArchive;
use std::fs::File;
use crate::completions::query_haiku;

// TODO implement better error handling
pub async fn get_epub_language(epub_path: &Path) -> Result<Option<String>, String> {
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
        println!("{}", language);
        Ok(Some(language))
    }
}
