const SCRIPT: &str = r#"
<div id="myModal" class="modal">
    <div class="modal-content" id="modal-content">
        <div id="container">
            <div class="word-box">
                <h1 id="original"></h1>
                <button id="audio-btn">Play</button>
            </div>
            <div id="translation"></div>
        </div>
        <div id="spinner"></div>
    </div>
</div>

<style>
    .word-box {
        display: flex;
        gap: 10px;
        justifyContent: 'center';
        cursor: pointer;
    }

    .modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        z-index: 1; /* Sit on top */
        left: 0;
        top: 0;
        width: 100%; /* Full width */
        height: 100%; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0,0,0); /* Fallback color */
        background-color: rgba(0,0,0,0.4); /* Black w/ opacity */
        justify-content: center; /* Center horizontally */
        align-items: center; /* Center vertically */
    }

    .modal-content {
        border-radius: 20px;
        elevation: 5;
        background-color: #fefefe;
        padding: 20px;
        border: 1px solid #888;
        width: fit-content;
        max-width: 80%; /* Limit width to 80% of the viewport */
    }

    .close {
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
    }

    .close:hover,
    .close:focus {
        color: black;
        text-decoration: none;
        cursor: pointer;
    }
</style>
<script type="text/javascript">
    const CircularLoader = {
        loader: null,
        canvas: null,
        ctx: null,
        size: 50,
        lineWidth: 5,
        rotationSpeed: 5,
        color: '#000000',
        rotation: 0,

        init(container, options = {}) {
            this.size = options.size || this.size;
            this.lineWidth = options.lineWidth || this.lineWidth;
            this.rotationSpeed = options.rotationSpeed || this.rotationSpeed;
            this.color = options.color || this.color;

            this.canvas = document.createElement('canvas');
            this.canvas.width = this.size;
            this.canvas.height = this.size;
            this.ctx = this.canvas.getContext('2d');

            this.loader = document.createElement('div');
            this.loader.style.width = `${this.size}px`;
            this.loader.style.height = `${this.size}px`;
            this.loader.style.position = 'relative';
            this.loader.style.display = 'inline-block';
            this.loader.appendChild(this.canvas);

            if (container) {
                container.appendChild(this.loader);
            }

            this.draw();
            this.start();

            return this.loader;
        },

        draw() {
            const centerX = this.size / 2;
            const centerY = this.size / 2;
            const radius = (this.size - this.lineWidth) / 2;

            this.ctx.clearRect(0, 0, this.size, this.size);
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 1.5);
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();
        },

        rotate() {
            this.rotation += this.rotationSpeed;
            this.canvas.style.transform = `rotate(${this.rotation}deg)`;
            requestAnimationFrame(() => this.rotate());
        },

        start() {
            this.rotate();
        },

        stop() {
            cancelAnimationFrame(this.rotate);
        },

        show() {
            this.loader.style.display = 'inline-block';
        },

        hide() {
            this.loader.style.display = 'none';
        }
    };

    const getSpeechFromText = async (text, language) => {
        try {
            const response = await fetch('http://localhost:3000/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, language }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const audioBlob = await response.blob();
            return audioBlob;
        } catch (error) {
            console.error("Error:", error);
        }
    };

    const getTranslation = async (
        text, 
        language, 
    ) => {
        try {
            const response = await fetch('http://localhost:3000/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, language }),
            });
            
            if (!response.ok) {
                throw new Error('Translation request failed');
            }
            
            const data = await response.json();
            return data.translated_text;
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    function stripPuncs(text) {
        return text
            .replace('.', '')
            .replace(',', '')
            .replace('?', '')
            .replace('!', '')
            .replace('¿', '');
    }

    const getSelectedText = () => {
        // window.getSelection() method
        if (window.getSelection) {
            return window.getSelection().toString();
        }
        // document.selection for older IE versions
        else if (document.selection && document.selection.type != "Control") {
            return document.selection.createRange().text;
        }
        return '';
    }

    // Event listener for when text is selected
    document.addEventListener('mouseup', function() {
        const selectedText = getSelectedText();
        if (selectedText) {
            window.translate(selectedText);
        }
    });

    const modal = document.getElementById('myModal');
    const modalContent = document.getElementById('modal-content');
    const original = document.getElementById('original');
    const translation = document.getElementById('translation');
    const audioButton = document.getElementById('audio-btn');
    const container = document.getElementById('container');
    const spinner = document.getElementById('spinner');

    const loader = Object.create(CircularLoader);
    loader.init(spinner, {
        size: 60,
        lineWidth: 6,
        rotationSpeed: 8,
        color: '#3498db'
    });

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    window.currentAudioBlob = undefined;
    audioButton.onclick = async function () {
        if (window.currentAudioBlob) {
            const audioUrl = URL.createObjectURL(window.currentAudioBlob);
            const audio = new Audio(audioUrl);
            await audio.play();
        }
    }

    window.addEventListener('DOMContentLoaded', function () {
        window.translate = function(text) {
            container.style.display = 'none';
            loader.start();
            loader.show();
            modal.style.display = 'flex';
            window.currentAudioBlob = undefined;
            getTranslation(text, language).then(translated_text => {
                original.innerText = text;
                translation.innerText = translated_text;
                getSpeechFromText(text, language).then(audioBlob => {
                    window.currentAudioBlob = audioBlob;
                    loader.stop();
                    loader.hide();
                    container.style.display = 'block';
                });
            });
        }
    });

</script>"#;

fn add_language_to_script(script: &str, language: &str) -> String {
    let mut result = String::new();
    let mut lines = script.lines();
    
    while let Some(line) = lines.next() {
        result.push_str(line);
        result.push('\n');
        
        if line.trim() == "<script type=\"text/javascript\">" {
            result.push_str(format!("    const language = \"{}\";", language).as_str());
            result.push('\n');
        }
    }
    
    result
}

pub fn wrap_words_in_paragraphs(html: &str, language: &str) -> String {
    let mut html_string = String::from(html);
    let script_with_language = add_language_to_script(SCRIPT, language);
    
    if let Some(body_index) = html_string.rfind("</body>") {
        html_string.insert_str(body_index, &script_with_language);
    } else {
        // If there's no closing body tag, we could just append it at the end
        html_string.push_str(&script_with_language);
    }

    let mut current_index = 0;
    
    while let Some(index) = find_substring_from_index(&html_string, "<p", current_index) {
        if current_index > html_string.len() {
            panic!("Current index beyond bounds of html string.");
        }
        if let Some(closing_p_index) = find_substring_from_index(&html_string, "</p>", index) {
            let opening_tag_end = html_string[index..].find('>').map(|i| i + index + 1)
                .unwrap_or_else(|| panic!("Malformed html. Could not find closing '>' for opening p tag."));
            let paragraph_text = &html_string[opening_tag_end..closing_p_index];
            let mut modified_p_text = String::new();
            let mut inside_word = false;
            let mut inside_span = false;
            let mut inside_tag = false;
            let mut current_span = String::new();
            let mut span_buffer = String::new();
            let mut tag_buffer = String::new();
            
            let mut chars = paragraph_text.chars().peekable();
            while let Some(c) = chars.next() {
                if inside_span {
                    current_span.push(c);
                    if current_span.ends_with("</span>") {
                        // Wrap the existing span content
                        span_buffer.push_str(&format!("<span onclick=\"window.translate(this)\">{}</span>", current_span));
                        modified_p_text.push_str(&span_buffer);
                        span_buffer.clear();
                        inside_span = false;
                        current_span.clear();
                    }
                } else if inside_tag {
                    tag_buffer.push(c);
                    if c == '>' {
                        inside_tag = false;
                        if inside_word {
                            modified_p_text.push_str("</span>");
                            inside_word = false;
                        }
                        modified_p_text.push_str(&tag_buffer);
                        tag_buffer.clear();
                    }
                } else if c == '<' {
                    if chars.peek() == Some(&'s') {
                        // Start of a <span> tag
                        current_span.push(c);
                        inside_span = true;
                    } else {
                        // Start of another tag
                        inside_tag = true;
                        tag_buffer.push(c);
                    }
                } else if c.is_whitespace() {
                    if inside_word {
                        modified_p_text.push_str("</span>");
                        inside_word = false;
                    }
                    modified_p_text.push(c);
                } else {
                    if !inside_word {
                        modified_p_text.push_str("<span onclick=\"window.translate(this.innerText)\">");
                        inside_word = true;
                    }
                    modified_p_text.push(c);
                }
            }
            if inside_word {
                modified_p_text.push_str("</span>");
            }

            let opening_tag = &html_string[index..opening_tag_end];
            let new_content = format!("{}{}</p>", opening_tag, modified_p_text);
            
            html_string.replace_range(index..closing_p_index + 4, &new_content);
            current_index = index + new_content.len();
        } else {
            panic!("Malformed html. Could not find closing p tag.");
        }
    }
    
    html_string
}

fn find_substring_from_index(string: &str, substring: &str, start_index: usize) -> Option<usize> {
    string[start_index..].find(substring).map(|index| index + start_index)
}
