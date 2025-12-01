// src/utils/titleCase.ts

// Words that should remain lowercase in Title Case (unless first or last word)
const MINOR_WORDS = new Set([
  'a', 'an', 'the',           // articles
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',  // conjunctions
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'per', 'via'  // short prepositions
]);

/**
 * Converts a string to Title Case.
 * - First and last words are always capitalized
 * - Articles, conjunctions, and short prepositions are lowercase
 * - All other words are capitalized
 */
export function toTitleCase(str: string): string {
  if (!str) return str;
  
  const words = str.toLowerCase().split(/\s+/);
  
  return words.map((word, index) => {
    // Always capitalize first and last words
    if (index === 0 || index === words.length - 1) {
      return capitalize(word);
    }
    
    // Keep minor words lowercase
    if (MINOR_WORDS.has(word)) {
      return word;
    }
    
    return capitalize(word);
  }).join(' ');
}

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}