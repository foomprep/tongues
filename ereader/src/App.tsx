import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import './output.css'
import './App.css'

interface Chapter {
  title: string;
  content: string;
  index: number;
}

interface Book {
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

function App() {
  const [book, setBook] = useState<Book | null>()
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [modalText, setModalText] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [translation, setTranslation] = useState<string>('');
  const [audioBlob, setAudioBlob] = useState<Blob>(new Blob([]));
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [languageSelectOpen, setLanguageSelectOpen] = useState<boolean>(false);

  const playAudio = async () => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const result = await invoke('play_mp3', {
        mp3Data: Array.from(bytes)
      })
    } catch (err: any) {
      console.error("Could not play audio", err);
    }
  }

  const handleLanguageSelect = async (e: any) => {
    await setBook({
      ...book,
      language: selectedLanguage
    });
    window.translate = async (text: string) => {
      console.log('window translate');
      const translation = await invoke<Translation>('get_translation', {
        text,
        sourceLanguage: selectedLanguage,
        targetLanguage: "English",
      });
      const audio = await invoke<Audio>('synthesize_speech', {
        text,
        language: selectedLanguage,
      });

      const blob = new Blob([new Uint8Array(audio.data)], { 
        type: audio.mimeType 
      });
      setAudioBlob(blob);
      setTranslation(translation.text);
      setModalText(text);
      setIsModalOpen(true);
    } 
    setLanguageSelectOpen(false);
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
        const modifiedBook = await invoke<Book>('read_epub', { 
          path: selected as string 
        });
        setBook(modifiedBook);

        if (modifiedBook.language !== "unknown") {
          window.translate = async (text: string) => {
            const translation = await invoke<Translation>('get_translation', {
              text,
              sourceLanguage: modifiedBook.language,
              targetLanguage: "English",
            });
            const audio = await invoke<Audio>('synthesize_speech', {
              text,
              language: modifiedBook.language,
            });
      
            const blob = new Blob([new Uint8Array(audio.data)], { 
              type: audio.mimeType 
            });
            setAudioBlob(blob);
            setTranslation(translation.text);
            setModalText(text);
            setIsModalOpen(true);
          }
        } else {
          setLanguageSelectOpen(true);
        }

        setCurrentChapter(0);
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">EPUB Reader</h1>
        <div className="flex gap-4">
          <button
            onClick={handleFileOpen} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Open EPUB
          </button>
        </div>
      </header>

      { book &&
        <div>
          <div className="flex gap-6">
            <button
              onClick={() => setCurrentChapter(Math.max(0, currentChapter - 1))}
              disabled={currentChapter === 0}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            
            <button
              onClick={() => setCurrentChapter(Math.min(book.chapters.length - 1, currentChapter + 1))}
              disabled={currentChapter === book.chapters.length - 1}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Next
            </button>

            <aside className="w-64 shrink-0">
              <h2 className="text-xl font-bold mb-4">Chapters</h2>
              <nav className="space-y-2">
                {book.chapters.map((chapter, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentChapter(index)}
                    className={`w-full text-left p-2 rounded transition-colors ${
                      currentChapter === index 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {chapter.title}
                  </button>
                ))}
              </nav>
            </aside>

            <main className="flex-1">
              {book.chapters.length > 0 ? (
                <div className="prose max-w-none">
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: book.chapters[currentChapter].content 
                    }} 
                  />
                </div>
              ) : (
                <div className="text-center text-gray-500 mt-10">
                  Open an EPUB file to start reading
                </div>
              )}
            </main>
          </div>

           {isModalOpen && (
            <div
              className="fixed inset-0 bg-white bg-opacity-50 flex items-center justify-center"
              onClick={() => setIsModalOpen(false)}
            >
              <div
                className="bg-white p-6 rounded-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-bold mb-4">Translation</h2>
                <p>{modalText}</p>
                <p>{translation}</p>
                <button
                  onClick={playAudio}
                  className="mt-4 mr-2 px-4 py-2 bg-green-500 rounded hover:bg-green-600"
                >
                  Play
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="mt-4 px-4 py-2 bg-blue-500 rounded hover:bg-blue-600"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          {languageSelectOpen && ( 
            <div
              className="fixed inset-0 bg-white bg-opacity-50 flex items-center justify-center"
            >
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Select Language</h2>
                <select
                  className="w-full p-2 mb-4 border rounded"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  <option value="">Choose a language</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
                <button onClick={handleLanguageSelect} className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
                  Start Reading
                </button>
              </div>
            </div>
          )}

       </div>
      }
    </div>
  );
}

export default App;
