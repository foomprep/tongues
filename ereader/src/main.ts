import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface Book {
  spine: SpineItem[];
  language: string;
  css: string[]; 
}

interface SpineItem {
    id: string;
    href: string;
    media_type: string;
    contents: string;
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

  // TODO if user presses cancel gets stuck in spinner
  const handleFileOpen = () => {
    const openSpinner: HTMLDivElement | null = document.querySelector("#open-spinner");
    const openContainer: HTMLDivElement | null = document.querySelector("#open-container");
    const bookContainer: HTMLDivElement | null = document.querySelector("#book-container");
    const contentContainer: HTMLDivElement | null = document.querySelector("#content-container");

    try {
      openContainer!.style.display = "none";
      openSpinner!.style.display = "block";
      bookContainer!.style.display = "none";
      open({
        filters: [{
          name: 'EPUB',
          extensions: ['epub']
        }],
        multiple: false,
      }).then(selected => {

        openSpinner!.style.display = "block";
        if (selected) {
          invoke<Book>('parse_epub', {
            epubPath: selected as string
          }).then(modifiedBook => {
            console.log(modifiedBook.spine[0].contents);
            BOOK = modifiedBook;

            // TODO this is not removed when book i sclosed!
            modifiedBook.css.forEach(cssString => {
              const style = document.createElement('style');
              style.textContent = cssString;
              document.head.appendChild(style);
            });

            openSpinner!.style.display = "none";
            contentContainer!.innerHTML = BOOK.spine[0].contents;
            bookContainer!.style.display = "flex";

            //const sideBar: HTMLDivElement | null = document.querySelector("#sidebar");
            //modifiedBook.chapters.forEach((chapter, index) => {
            //  let link = document.createElement("a");
            //  link.textContent = chapter.title;
            //  link.className = "block py-2 px-8 text-2xl text-gray-400 hover:text-gray-800 transition-colors duration-300";
            //  link.addEventListener("click", (_e: any) => {
            //    const contentContainer = document.querySelector("#content-container");
            //    contentContainer!.innerHTML = chapter.content;
            //    CURRENT_CHAPTER = index;
            //  });
            //  sideBar!.append(link);
            //});

            if (modifiedBook.language !== "unknown") {
              window.translate = createTranslateFunction(modifiedBook.language);
            } else {
              const languageSelectContainer: HTMLDivElement | null = document.querySelector("#language-select");
              languageSelectContainer!.style.display = "flex";
            }
            CURRENT_CHAPTER = 0;
          });
        }
      });
    } catch (error) {
      openSpinner!.style.display = "none";
      bookContainer!.style.display = "none";
      openContainer!.style.display = "block";
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

  const openNav = () => {
    document.getElementById("sidebar")!.style.width = "250px";
    document.getElementById("main")!.style.marginLeft = "250px";
  }

  function closeNav() {
    document.getElementById("sidebar")!.style.width = "0";
    document.getElementById("main")!.style.marginLeft = "0";
  }
  const sidebarButton: HTMLButtonElement | null = document.querySelector("#sidebar-btn");
  const closeSidebarButton: HTMLButtonElement | null = document.querySelector("#close-sidebar-btn");
  sidebarButton!.addEventListener("click", (_e: any) => {
    sidebarButton!.style.display = "none";
    openNav();
  })
  // TODO sidebar button appears before animation completes
  closeSidebarButton?.addEventListener("click", (_e: any) => {
    closeNav();
    sidebarButton!.style.display = "block";
  })
});

