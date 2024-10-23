import { useState, useEffect } from 'react'
import './output.css'
import ePub from 'epubjs'

function App() {
  const [rendition, setRendition] = useState(null)
  const [bookLoaded, setBookLoaded] = useState(false)

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const book = ePub(e.target.result)
        const newRendition = book.renderTo('viewer', {
          width: '100%',
          height: '100%'
        })
        setRendition(newRendition)
        newRendition.display()
        setBookLoaded(true)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const handlePrevPage = () => {
    if (rendition) {
      rendition.prev()
    }
  }

  const handleNextPage = () => {
    if (rendition) {
      rendition.next()
    }
  }

  const handleCloseBook = () => {
    if (rendition) {
      rendition.destroy()
    }
    setRendition(null)
    setBookLoaded(false)
  }

  useEffect(() => {
    return () => {
      if (rendition) {
        rendition.destroy()
      }
    }
  }, [rendition])

  return (
    <>
      {!bookLoaded ? (
        <input type="file" onChange={handleFileChange} accept=".epub" />
      ) : (
        <div className="relative w-screen h-screen">
          <div id="viewer" className="w-full h-full"></div>
          <button 
            onClick={handlePrevPage} 
            className="absolute left-0 top-1/2 -translate-y-1/2 p-2 bg-gray-200 rounded-r"
          >
            &#8592;
          </button>
          <button 
            onClick={handleNextPage} 
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-gray-200 rounded-l"
          >
            &#8594;
          </button>
          <button 
            onClick={handleCloseBook} 
            className="absolute top-0 right-0 m-2 p-2 bg-red-500 text-white rounded"
          >
            Close Book
          </button>
        </div>
      )}
    </>
  )
}

export default App
