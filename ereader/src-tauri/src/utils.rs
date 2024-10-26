use std::path::Path;
use zip::ZipArchive;
use std::fs::File;
use quick_xml::Reader;
use quick_xml::events::Event;
use std::io::BufReader;
use crate::completions::query_haiku;

#[derive(Debug)]
pub enum EpubLanguageError {
    ZipError(zip::result::ZipError),
    XmlError(quick_xml::Error),
    IoError(std::io::Error),
    ContentOpfNotFound,
}

impl From<zip::result::ZipError> for EpubLanguageError {
    fn from(err: zip::result::ZipError) -> Self {
        EpubLanguageError::ZipError(err)
    }
}

impl From<quick_xml::Error> for EpubLanguageError {
    fn from(err: quick_xml::Error) -> Self {
        EpubLanguageError::XmlError(err)
    }
}

impl From<std::io::Error> for EpubLanguageError {
    fn from(err: std::io::Error) -> Self {
        EpubLanguageError::IoError(err)
    }
}

pub fn get_epub_language(epub_path: &Path) -> Result<Option<String>, EpubLanguageError> {
    // Open the EPUB file
    let file = File::open(epub_path)?;
    let mut archive = ZipArchive::new(file)?;

    // First try to find and parse container.xml to get content.opf path
    let content_opf_path = {
        let mut path = String::new();
        if let Ok(container) = archive.by_name("META-INF/container.xml") {
            let mut reader = Reader::from_reader(BufReader::new(container));
            let mut buf = Vec::new();
            
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                        if e.name().as_ref() == b"rootfile" {
                            if let Some(p) = e.attributes()
                                .find(|a| a.as_ref().map(|a| a.key.as_ref() == b"full-path").unwrap_or(false))
                                .and_then(|a| a.ok())
                                .and_then(|a| String::from_utf8(a.value.to_vec()).ok())
                            {
                                path = p;
                                break;
                            }
                        }
                    }
                    Ok(Event::Eof) | Err(_) => break,
                    _ => (),
                }
                buf.clear();
            }
        }
        path
    };

    // If we couldn't find content.opf path in container.xml, try common locations
    let content_opf_path = if content_opf_path.is_empty() {
        let common_paths = ["content.opf", "OEBPS/content.opf", "OPS/content.opf"];
        let mut found_path = String::new();
        for path in common_paths.iter() {
            if archive.by_name(path).is_ok() {
                found_path = path.to_string();
                break;
            }
        }
        found_path
    } else {
        content_opf_path
    };

    // If we still haven't found content.opf, return error
    if content_opf_path.is_empty() {
        return Err(EpubLanguageError::ContentOpfNotFound);
    }

    // Now parse content.opf for language
    let language = {
        let mut language = None;
        if let Ok(content_opf) = archive.by_name(&content_opf_path) {
            let mut reader = Reader::from_reader(BufReader::new(content_opf));
            let mut buf = Vec::new();
            let mut in_metadata = false;

            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Start(ref e)) => {
                        if e.name().as_ref() == b"metadata" {
                            in_metadata = true;
                        }
                    }
                    Ok(Event::End(ref e)) => {
                        if e.name().as_ref() == b"metadata" {
                            in_metadata = false;
                        }
                    }
                    Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) if in_metadata => {
                        if e.name().as_ref() == b"dc:language" || e.name().as_ref() == b"language" {
                            if let Ok(Event::Text(text)) = reader.read_event_into(&mut buf) {
                                let lang = text.unescape()?.into_owned();
                                if !lang.trim().is_empty() {
                                    language = Some(lang);
                                    break;
                                }
                            }
                        }
                    }
                    Ok(Event::Eof) | Err(_) => break,
                    _ => (),
                }
                buf.clear();
            }
        }
        language
    };

    // If no language found in content.opf, try checking XHTML files for lang attribute
    let language = if language.is_none() {
        let mut found_lang = None;
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                let name = file.name().to_string();
                if name.ends_with(".xhtml") || name.ends_with(".html") {
                    let mut reader = Reader::from_reader(BufReader::new(file));
                    let mut buf = Vec::new();

                    loop {
                        match reader.read_event_into(&mut buf) {
                            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                                if e.name().as_ref() == b"html" {
                                    if let Some(lang) = e.attributes()
                                        .find(|a| a.as_ref().map(|a| a.key.as_ref() == b"lang").unwrap_or(false))
                                        .and_then(|a| a.ok())
                                        .and_then(|a| String::from_utf8(a.value.to_vec()).ok())
                                    {
                                        if !lang.trim().is_empty() {
                                            found_lang = Some(lang);
                                            break;
                                        }
                                    }
                                }
                            }
                            Ok(Event::Eof) | Err(_) => break,
                            _ => (),
                        }
                        buf.clear();
                    }

                    if found_lang.is_some() {
                        break;
                    }
                }
            }
        }
        found_lang
    } else {
        language
    };

    Ok(language)
}


