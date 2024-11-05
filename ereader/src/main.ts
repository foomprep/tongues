import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { documentDir} from "@tauri-apps/api/path";

declare global {
  interface Window {
      translate: (text: string) => void;
  }
}

interface TextInfo {
  text: string,
  info: string,
}

interface Book {
  spine: SpineItem[];
  language: string;
  css: string[]; 
  cover_image: number[] | null;
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

interface Page {
  content: HTMLElement[];
}

let BOOK: Book | null = null;
let SPINE_INDEX: number = 0;
let CURRENT_PAGES: Page[] | null;
let CURRENT_PAGE_INDEX: number = 0;
let CURRENT_CHAPTER: number = 0;
let AUDIO: Audio | null = null;

function paginateContent(containerDiv: HTMLDivElement): Page[] {
  const availableHeight = window.innerHeight;
  const elements = Array.from(containerDiv.children) as HTMLElement[];
  const pages: Page[] = [];
  let currentPage: Page = { content: [] };
  let currentHeight = 0;

  for (const element of elements) {
    // Get computed styles without modifying the DOM
    const styles = window.getComputedStyle(element);
    const elementHeight = element.getBoundingClientRect().height;
    const elementMargin = parseFloat(styles.marginBottom) + parseFloat(styles.marginTop);
    const totalElementHeight = elementHeight + elementMargin;

    // If adding this element would exceed the page height, start a new page
    if (currentHeight + totalElementHeight > availableHeight && currentPage.content.length > 0) {
      pages.push(currentPage);
      currentPage = { content: [] };
      currentHeight = 0;
    }

    // Add element to current page
    currentPage.content.push(element);
    currentHeight += totalElementHeight;
  }

  // Add the last page if it has content
  if (currentPage.content.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}


function displayPage(containerDiv: HTMLDivElement, page: Page): void {
  // Clear current content
  containerDiv.innerHTML = '';
  
  // Add page content
  page.content.forEach(element => {
    containerDiv.appendChild(element.cloneNode(true));
  });
}

function sanitizeModelResponse(input: string): string {
    return input.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/^"|"$/g, '');
}

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
    const infoParagraph : HTMLParagraphElement | null = document.querySelector("#text-info");
    infoParagraph!.innerText = "";
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

  // TODO if user presses cancel gets stuck in spinner
  const handleFileOpen = () => {
    const openSpinner: HTMLDivElement | null = document.querySelector("#open-spinner");
    const openContainer: HTMLDivElement | null = document.querySelector("#open-container");
    const bookContainer: HTMLDivElement | null = document.querySelector("#book-container");

    try {
      openContainer!.style.display = "none";
      openSpinner!.style.display = "block";
      bookContainer!.style.display = "none";
      documentDir().then(defaultPath => {
        open({
          filters: [{
            name: 'EPUB',
            extensions: ['epub']
          }],
          multiple: false,
          directory: false,
          defaultPath,
        }).then(selected => {
          openSpinner!.style.display = "block";
          if (selected) {
            invoke<Book>('parse_epub', {
              epubPath: selected as string
            }).then(modifiedBook => {
              BOOK = modifiedBook;

              if (modifiedBook.cover_image) {
                const imageArray = new Uint8Array(modifiedBook.cover_image);
                const blob = new Blob([imageArray], { type: 'image/jpeg' });
                const imageUrl = URL.createObjectURL(blob);
                const imageElement = document.createElement("img");
                imageElement.src = imageUrl;
                const coverSpineItem = {
                  id: "coverImage",
                  href: "",
                  media_type: "application/xml",
                  contents: imageElement.outerHTML,
                };
                BOOK.spine.unshift(coverSpineItem);
              }

              // TODO this is not removed when book is closed!
              modifiedBook.css.forEach(cssString => {
                const style = document.createElement('style');
                style.textContent = cssString;
                document.head.appendChild(style);
              });

              const contentContainer: HTMLDivElement | null = document.querySelector("#content-container");
              openSpinner!.style.display = "none";
              contentContainer!.innerHTML = BOOK.spine[0].contents;
              CURRENT_PAGES = paginateContent(contentContainer!);
              CURRENT_PAGE_INDEX = 0;
              displayPage(contentContainer!, CURRENT_PAGES[CURRENT_PAGE_INDEX]);
              bookContainer!.style.display = "flex";
              CURRENT_CHAPTER = 0;

              if (modifiedBook.language !== "unknown") {
                window.translate = createTranslateFunction(modifiedBook.language);
              } else {
                const languageSelectContainer: HTMLDivElement | null = document.querySelector("#language-select");
                languageSelectContainer!.style.display = "flex";
              }
            })
            .catch(err => {
              console.log(err);
            });
          } else {
            openSpinner!.style.display = "none";
            openContainer!.style.display = "flex";
          }
        });
      })
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
    const infoParagraph: HTMLParagraphElement | null = document.querySelector("#text-info");
    infoParagraph!.innerText = "";
  });

  const playButton = document.querySelector("#play-button");
  playButton?.addEventListener("click", async (_e: any) => {
    if (AUDIO) {
      await playAudio(AUDIO);
    }
  });

  // Navigation
  const prevButton : HTMLButtonElement | null = document.querySelector("#prev-button");
  const nextButton: HTMLButtonElement | null = document.querySelector("#next-button");
  prevButton!.addEventListener("click", (_e: any) => {
    CURRENT_CHAPTER = (CURRENT_CHAPTER > 0) ? CURRENT_CHAPTER - 1 : 0;
    const contentContainer: HTMLDivElement | null = document.querySelector("#content-container");
    contentContainer!.innerHTML = BOOK!.spine[CURRENT_CHAPTER].contents;
  });
  nextButton!.addEventListener("click", (_e: any) => {
    const contentDiv: HTMLDivElement | null = document.querySelector("#content-container");
    if (CURRENT_PAGE_INDEX == CURRENT_PAGES!.length - 1) {
      // at end of current chapter
      SPINE_INDEX += 1;
      CURRENT_PAGE_INDEX = 0;
      contentDiv!.innerHTML = BOOK!.spine[SPINE_INDEX].contents;
      CURRENT_PAGES = paginateContent(contentDiv!);
      console.log(CURRENT_PAGES[0].content);
      CURRENT_PAGE_INDEX = 0;
      displayPage(contentDiv!, CURRENT_PAGES[CURRENT_PAGE_INDEX]);
    } else {
      CURRENT_PAGE_INDEX += 1;
      displayPage(contentDiv!, CURRENT_PAGES![CURRENT_PAGE_INDEX]);
    }
  });

  const closeButton: HTMLButtonElement | null = document.querySelector("#close-button");
  closeButton!.addEventListener("click", (_e: any) => {
    const openContainer: HTMLDivElement | null = document.querySelector("#open-container");
    const bookContainer: HTMLDivElement | null = document.querySelector("#book-container");
    bookContainer!.style.display = "none";
    openContainer!.style.display = "flex";
    BOOK = null;
  });

  const languageDropdownContainer: HTMLDivElement | null = document.querySelector("#language-select");
  const languageSelectButton: HTMLButtonElement | null = document.querySelector("#lang-select-btn");
  const languageDropdown: HTMLSelectElement | null = document.querySelector("#language-dropdown");
  languageSelectButton!.addEventListener("click", (_e: any) => {
    const language = languageDropdown?.value;
    console.log(language);
    if (language) {
      if (BOOK) {
        BOOK.language = language;
        languageDropdownContainer!.style.display = "none";
        window.translate = createTranslateFunction(language);
      }
    }
  });

  document.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      window.translate(selection.toString());
      selection.removeAllRanges();
    }
  });

  const moreButton = document.querySelector("#more-button");
  const originalText: HTMLParagraphElement | null = document.querySelector("#original-text");
  moreButton?.addEventListener("click", async (_e: any) => {
    const textInfo = await invoke<TextInfo>('get_more_info', {
      text: originalText!.innerText,
      language: BOOK!.language,
    });
    const infoParagraph : HTMLParagraphElement | null = document.querySelector("#text-info");
    infoParagraph!.innerText = sanitizeModelResponse(textInfo.info);
  });
});

