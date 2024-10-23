import { useState } from 'react'
import './App.css'
import ePub from 'epubjs'

function App() {
  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const book = ePub(e.target.result)
        console.log('New book created:', book)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  return (
    <>
      <input type="file" onChange={handleFileChange} accept=".epub" />
    </>
  )
}

export default App
