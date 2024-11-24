import { useEffect, useRef, useState } from "react";
import "./App.css";
import { readDir, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { deleteSegment, getSpeechFromText, getTranslation, removePunc } from "./utils";
import { TranslateClient } from "@aws-sdk/client-translate";
import { PollyClient } from "@aws-sdk/client-polly";
import Spinner from "./Spinner";
import { invoke } from '@tauri-apps/api/core';

interface SegmentJson {
  text: string;
  media_path: string;
  language: string;
}

interface Word {
  translation: string;
  text: string;
  audioBlob: Blob | undefined;
}

const credentials = {
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
};

const translateClient = new TranslateClient({
  region: "us-east-1",
  credentials: credentials,
});

const pollyClient = new PollyClient({
  region: 'us-east-1',
  credentials: credentials,
});

const SEGMENTS_DIR = '/home/anon/.flashcard/segments';

function App() {
  const [subtitle, setSubtitle] = useState<string>('');
  const [segments, setSegments] = useState<string[]>([]); // List of file names in SEGMENTS_DIR
  const [index, setIndex] = useState<number>(0);
  const [translation, setTranslation] = useState<string>('');
  const [word, setWord] = useState<Word | null>();
  const [language, setLanguage] = useState<string>('');
  const [playbackRate, setPlaybackRate] = useState<string>("Normal");
  const [wordLoading, setWordLoading] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const keyPress = async (event: any) => {
    if (event.key === 'n' || event.key === 'N') {
        await handleNext(event);
    }
  }

  useEffect(() => {
    document.addEventListener('keydown', keyPress);
    return () => document.removeEventListener("keydown", keyPress);
  });

  const getSelectedText = () => {
    if (typeof window.getSelection != "undefined") {
      if (window.getSelection()) {
        return window.getSelection()?.toString();
      }
    } 
    return null;
  }

  function doSomethingWithSelectedText() {
    var selectedText = getSelectedText();
    if (selectedText) {
      handleTranslation(selectedText);
    }
  }

  document.onmouseup = doSomethingWithSelectedText;

  const loadVideo = async (path: string) => {
    try {
      const jsonFile = await readTextFile(path);
      const parsedJson: SegmentJson = JSON.parse(jsonFile);

      // TODO get type from extension
      const videoFile = await readFile(parsedJson.media_path);
      const blob = new Blob([videoFile], { type: 'video/mp4' });
      if (videoRef && videoRef.current) {
        videoRef!.current!.src = URL.createObjectURL(blob);
      }

      setSubtitle(parsedJson.text);
      setLanguage(parsedJson.language);
      const result = await getTranslation(
        translateClient,
        parsedJson.text, 
        parsedJson.language,
        'en',
      );
      setTranslation(result!);

    } catch (error) {
      console.error('Failed to load video:', error);
    }
  }

  const handleTranslation = async (word: string) => {
    setWordLoading(true);
    const translation = await getTranslation(
      translateClient,
      removePunc(word),
      language,
      'en',
    );
 
    const speech = await getSpeechFromText(
      pollyClient,
      word,
      language,
    );

    setWord({
      text: word,
      translation: translation ? translation : 'Word could not be translated.',
      audioBlob: speech,
    });
    setWordLoading(false);
  }

  useEffect(() => {
    readDir(SEGMENTS_DIR)
      .then(entries => {
        const shuffledEntries = entries.sort(() => Math.random() - 0.5);
        setSegments(shuffledEntries.map(entry => entry.name));
        loadVideo(`${SEGMENTS_DIR}/${shuffledEntries[0].name}`);
      });
  }, []);

  const handleNext = async (e: any) => {
    e.preventDefault();
    await loadVideo(`${SEGMENTS_DIR}/${segments[index + 1]}`);
    setIndex(prevIndex => prevIndex+1);
  }

  const handleDelete = async (event: any) => {
    const currentSegment = segments[index];
    await deleteSegment(`${SEGMENTS_DIR}/${currentSegment}`);
    await handleNext(event);
  }

  const handlePlayback = (_event: any) => {
    const video = document.getElementById('player') as HTMLVideoElement;
    if (video!.playbackRate === 1.0) {
      video!.playbackRate = 0.5;
      setPlaybackRate("Slow");
    } else {
      video!.playbackRate = 1.0;
      setPlaybackRate("Normal");
    }
  }

  const handleSpeechPlay = async (_event: any) => {
    try {
      if (word && word.audioBlob) {
        const arrayBuffer = await word.audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const audioData = Array.from(uint8Array);
        await invoke('play_audio', { audioData });
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  }

  return (
    <div className="h-screen w-screen p-6 flex gap-3 text-2xl box-border">
      <div className="flex flex-col gap-2 items-center justify-center w-1/2">
        <video ref={videoRef} width="100%" id="player" controls preload="auto" />
        <div className="flex gap-3">
          <button type="button" onClick={handlePlayback} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800">{playbackRate}</button>
          <button type="button" onClick={handleNext} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800">Next</button>
          <button type="button" onClick={handleDelete} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800">Remove</button>
        </div>
      </div>
      <div className="flex flex-col gap-2 w-1/2 h-full">
        <div className="h-1/2">
          <div>{language}</div>
          <div className="flex flex-wrap gap-2 items-center text-4xl">
            {subtitle.split(' ').map((word, index) => {
              return <div key={index} onClick={() => handleTranslation(word)} className="cursor-pointer">{word}</div>
            })}
          </div>
          <div>{translation}</div>
        </div>
        { wordLoading ? <Spinner /> : word && 
          <div className="h-1/2">
            <div className="flex gap-3">
              <div>{word.text}</div>
              <div><button onClick={handleSpeechPlay}>Play</button></div>
            </div>
            <div>{word.translation}</div>
          </div>
        }
      </div>
    </div> 
  );

}

export default App;
