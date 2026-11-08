import { useEffect, useState } from 'react'
import { getIgnoredWords, onIgnoredWordsChanged } from '../../services/ignoredWords.js'

export const useIgnoredWords = () => {
  const [words, setWords] = useState([])

  useEffect(() => {
    let isCancelled = false

    getIgnoredWords()
      .then((storedWords) => {
        if (!isCancelled) setWords(storedWords)
      })
      .catch(() => {})
    const stopListening = onIgnoredWordsChanged(setWords)

    return () => {
      isCancelled = true
      stopListening()
    }
  }, [])

  return words
}
