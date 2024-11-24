import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { documentDir} from "@tauri-apps/api/path";
import './styles/fonts.css';

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

interface PaginatorOptions {
  containerSelector: string;
  contentSelector: string;
  htmlContent: string;
  onPageChange?: (currentPage: number, totalPages: number) => void;
}

class HTMLPaginator {
  private container: HTMLElement;
  private content: HTMLElement;
  private pages: string[] = [];
  private currentPage: number = 0;
  private htmlContent: string;
  private onPageChange?: (currentPage: number, totalPages: number) => void;

  constructor(options: PaginatorOptions) {
    const container = document.querySelector<HTMLElement>(options.containerSelector);
    const content = document.querySelector<HTMLElement>(options.contentSelector);

    if (!container || !content) {
      throw new Error('Container or content element not found');
    }

    this.container = container;
    this.content = content;
    this.htmlContent = options.htmlContent;
    this.onPageChange = options.onPageChange;

    this.init();
  }

  private init(): void {
    this.paginateContent();
    window.addEventListener('resize', () => this.paginateContent());
    this.displayCurrentPage();
  }

  private paginateContent(): void {
    // Reset content for measurement
    this.content.style.height = 'auto';
    this.content.innerHTML = this.htmlContent;
    
    const containerHeight = this.container.clientHeight;
    const newPages: string[] = [];
    let currentContent = '';
    let currentHeight = 0;
    
    // Clone nodes and measure their height
    Array.from(this.content.childNodes).forEach(node => {
      if (node instanceof HTMLImageElement) {
        console.log(window.innerHeight);
        node.style.height = (window.innerHeight * 0.8) + 'px';
      }
      const clone = node.cloneNode(true);
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(clone);
      this.content.appendChild(tempDiv);
      
      const nodeHeight = tempDiv.offsetHeight;
      
      if (currentHeight + nodeHeight > containerHeight) {
        newPages.push(currentContent);
        currentContent = tempDiv.innerHTML;
        currentHeight = nodeHeight;
      } else {
        currentContent += tempDiv.innerHTML;
        currentHeight += nodeHeight;
      }
      
      this.content.removeChild(tempDiv);
    });
    
    if (currentContent) {
      newPages.push(currentContent);
    }
    
    this.pages = newPages;
    this.currentPage = Math.min(this.currentPage, this.pages.length - 1);
    this.displayCurrentPage();
  }

  private displayCurrentPage(): void {
    if (!this.pages.length) return;
    this.content.innerHTML = this.pages[this.currentPage];
    this.onPageChange?.(this.currentPage + 1, this.pages.length);
  }

  public nextPage(): void {
    this.currentPage++;
    this.displayCurrentPage();
  }

  public previousPage(): void {
    this.currentPage--;
    this.displayCurrentPage();
  }

  public goToPage(pageNumber: number): void {
    const page = pageNumber - 1;
    if (page >= 0 && page < this.pages.length) {
      this.currentPage = page;
      this.displayCurrentPage();
    }
  }

  public getCurrentPage(): number {
    return this.currentPage + 1;
  }

  public getTotalPages(): number {
    return this.pages.length;
  }

  public destroy(): void {
    window.removeEventListener('resize', () => this.paginateContent());
  }
}

let BOOK: Book | null = null;
let SPINE_INDEX: number = 0;
let CURRENT_PAGINATOR: HTMLPaginator | null;
let AUDIO: Audio | null = null;

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
        const words = text.split(' ');
        originalText!.innerHTML = words.map(word => `<div onclick="window.translate('${word}')">${word}</div>`).join(' ');
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

              SPINE_INDEX = 0;
              CURRENT_PAGINATOR = new HTMLPaginator({
                containerSelector: "#content-container",
                contentSelector: "#content",
                htmlContent: BOOK.spine[SPINE_INDEX].contents,
                onPageChange: (currentPage, totalPages) => {
                  console.log(`Page ${currentPage} of ${totalPages}`);
                }
              });
              openSpinner!.style.display = "none";
              bookContainer!.style.display = "flex";

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
    if (CURRENT_PAGINATOR?.getCurrentPage() === 1) {
      // beginning of spine item
      // TODO this does not navigate back to cover
      if (SPINE_INDEX > 0) {
        SPINE_INDEX -= 1;
        CURRENT_PAGINATOR = new HTMLPaginator({
          containerSelector: "#content-container",
          contentSelector: "#content",
          htmlContent: BOOK!.spine[SPINE_INDEX].contents,
        });
      }
    } else {
      CURRENT_PAGINATOR!.previousPage();
    }
  });
  nextButton!.addEventListener("click", (_e: any) => {
    // TODO disable button until callback completes
    if (CURRENT_PAGINATOR?.getCurrentPage() === CURRENT_PAGINATOR?.getTotalPages()) {
      // end of spine item
      if (SPINE_INDEX < BOOK!.spine.length - 1) {
        SPINE_INDEX += 1;
        CURRENT_PAGINATOR = new HTMLPaginator({
          containerSelector: "#content-container",
          contentSelector: "#content",
          htmlContent: BOOK!.spine[SPINE_INDEX].contents,
        });
      }
    } else {
      CURRENT_PAGINATOR!.nextPage();
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

  const moreButton: HTMLButtonElement | null = document.querySelector("#more-button");
  const moreButtonSpinner: HTMLButtonElement | null = document.querySelector("#more-button-spinner");
  const originalText: HTMLParagraphElement | null = document.querySelector("#original-text");
  moreButton?.addEventListener("click", async (_e: any) => {
    moreButton!.style.display = "none";
    moreButtonSpinner!.style.display = "block";
    const textInfo = await invoke<TextInfo>('get_more_info', {
      text: originalText!.innerText,
      language: BOOK!.language,
    });
    const infoParagraph : HTMLParagraphElement | null = document.querySelector("#text-info");
    infoParagraph!.innerText = sanitizeModelResponse(textInfo.info);
    moreButtonSpinner!.style.display = "none";
    moreButton!.style.display = "block";
  });
});

