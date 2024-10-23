import { useState, useEffect } from 'react'
import './App.css'
import ePub from 'epubjs'

function App() {
  const [rendition, setRendition] = useState(null)

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

  useEffect(() => {
    return () => {
      if (rendition) {
        rendition.destroy()
      }
    }
  }, [rendition])

  return (
    <>
      <input type="file" onChange={handleFileChange} accept=".epub" />
      <div style={{ position: 'relative', width: '100%', height: '80vh' }}>
        <div id="viewer" style={{ width: '100%', height: '100%' }}></div>
        <button 
          onClick={handlePrevPage} 
          style={{ position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)', height: '100%', padding: '0 10px' }}
        >
          &#8592;
        </button>
        <button 
          onClick={handleNextPage} 
          style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', height: '100%', padding: '0 10px' }}
        >
          &#8594;
        </button>
      </div>
    </>
  )
}

export default App
