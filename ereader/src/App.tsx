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

function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [language, setLanguage] = useState<string>('');
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [modalText, setModalText] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [translation, setTranslation] = useState<string>('');

  window.translate = async (text: string) => {
    const translation = await invoke<Translation>('get_translation', {
      text,
      sourceLanguage: "French",
      targetLanguage: "English",
    });
    setTranslation(translation.text);
    setModalText(text);
    setIsModalOpen(true);
  }

  const handleFileOpen = async () => {
    console.log('handleFileOpen');
    try {
      const selected = await open({
        filters: [{
          name: 'EPUB',
          extensions: ['epub']
        }],
        multiple: false
      });

      if (selected) {
        const book = await invoke<Book>('read_epub', { 
          path: selected as string 
        });
        // TODO only use setBook
        setChapters(book.chapters);
        setLanguage(book.language);
        console.log(book);
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
          
          <button
            onClick={() => setCurrentChapter(Math.max(0, currentChapter - 1))}
            disabled={currentChapter === 0}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
          >
            Previous
          </button>
          
          <button
            onClick={() => setCurrentChapter(Math.min(chapters.length - 1, currentChapter + 1))}
            disabled={currentChapter === chapters.length - 1}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </header>

      <div className="flex gap-6">
        <aside className="w-64 shrink-0">
          <h2 className="text-xl font-bold mb-4">Chapters</h2>
          <nav className="space-y-2">
            {chapters.map((chapter, index) => (
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
          {chapters.length > 0 ? (
            <div className="prose max-w-none">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: chapters[currentChapter].content 
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
              onClick={() => setIsModalOpen(false)}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
