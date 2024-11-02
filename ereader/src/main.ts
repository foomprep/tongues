import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface Chapter {
  title: string;
  content: string;
}

interface Book {
  title: string;
  chapters: Chapter[];
  language: string;
}

interface Translation {
  text: string;
}

interface Audio {
  data: Uint8Array;
  mimeType: string;
}

let BOOK: Book | null;
let CURRENT_CHAPTER: number = 0;
let AUDIO: Audio | null = null;

window.addEventListener("DOMContentLoaded", () => {
  const playAudio = async (audio: Audio) => {
    try {
      invoke('play_mp3', {
        mp3Data: Array.from(audio.data)
      })
    } catch (err: any) {
      console.error("Could not play audio", err);
    }
  }

  const createTranslateFunction = (language: string) => (text: string) => {
    const translationModal: HTMLDivElement | null = document.querySelector("#translation-modal");
    const modalContent: HTMLDivElement | null = document.querySelector("#modal-content");
    const spinner: HTMLDivElement | null = document.querySelector("#spinner"); 
    translationModal!.style.display = "flex";
    modalContent!.style.display = "none";
    spinner!.style.display = "block";

    invoke<Translation>('get_translation', {
      text,
      sourceLanguage: language,
      targetLanguage: "English",
    }).then(translation => {
      invoke<Audio>('synthesize_speech', {
        text,
        language: language,
      }).then(audio => {
        AUDIO = audio;
        const originalText: HTMLParagraphElement | null = document.querySelector("#original-text");
        const translationText: HTMLParagraphElement | null = document.querySelector("#translation-text");
        originalText!.innerText = text;
        translationText!.innerText = translation.text;

        modalContent!.style.display = "block";
        spinner!.style.display = "none";
      });
    });
  };

  const handleLanguageSelect = async (e: any) => {
  }

  const handleFileOpen = async () => {
    try {
      const selected = await open({
        filters: [{
          name: 'EPUB',
          extensions: ['epub']
        }],
        multiple: false
      });

      if (selected) {
        const modifiedBook = await invoke<Book>('parse_epub', { 
          epubPath: selected as string
        });
        BOOK = modifiedBook;
        const contentContainer = document.querySelector("#content-container");
        contentContainer!.innerHTML = BOOK.chapters[0].content;

        if (modifiedBook.language !== "unknown") {
          window.translate = createTranslateFunction(modifiedBook.language);
        } else {
          const languageSelectContainer: HTMLDivElement | null = document.querySelector("#language-select");
          languageSelectContainer!.style.display = "flex";
        }
        CURRENT_CHAPTER = 0;
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  let openButton = document.querySelector("#open-button");
  openButton?.addEventListener("click", function(_e: any) {
    handleFileOpen();
  });

  const translationModal: HTMLDivElement | null = document.querySelector("#translation-modal");
  translationModal?.addEventListener("click", (_e: any) => {
    translationModal!.style.display = "none";
  });

  const playButton = document.querySelector("#play-button");
  playButton?.addEventListener("click", async (_e: any) => {
    if (AUDIO) {
      await playAudio(AUDIO);
    }
  });
});

