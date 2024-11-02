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

let book: Book | null;
let currentChapter: number = 0;
let audio: Audio | null = null;

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

  const createTranslateFunction = (language: string) => async (text: string) => {
    const translation = await invoke<Translation>('get_translation', {
      text,
      sourceLanguage: language,
      targetLanguage: "English",
    });
    const audio = await invoke<Audio>('synthesize_speech', {
      text,
      language: language,
    });
    const translationModal: HTMLDivElement | null = document.querySelector("#translation-modal");
    translationModal!.style.display = "flex";
    const originalText: HTMLDivElement | null = document.querySelector("#original-text");
    const translationText: HTMLDivElement | null = document.querySelector("#translation-text");
    originalText!.innerText = text;
    translationText!.innerText = translation.text;
   
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
        book = modifiedBook;
        const contentContainer = document.querySelector("#content-container");
        contentContainer!.innerHTML = book.chapters[0].content;

        if (modifiedBook.language !== "unknown") {
          window.translate = createTranslateFunction(modifiedBook.language);
        } else {
          const languageSelectContainer: HTMLDivElement | null = document.querySelector("#language-select");
          languageSelectContainer!.style.display = "flex";
        }
        currentChapter = 0;
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
    if (audio) {
      await playAudio(audio);
    }
  });
});

