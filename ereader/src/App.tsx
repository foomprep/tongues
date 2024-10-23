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
      <div id="viewer" style={{ width: '100%', height: '80vh' }}></div>
    </>
  )
}

export default App
