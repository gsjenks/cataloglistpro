import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceInputProps {
  value: string | number | undefined;
  onChange: (value: string) => void;
  numeric?: boolean;
  className?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  step?: string;
  name?: string;
  maxLength?: number;
  rows?: number;
}

// Words to numbers conversion for speech input
const wordsToNumbers: Record<string, string> = {
  'zero': '0', 'oh': '0',
  'one': '1', 'won': '1',
  'two': '2', 'to': '2', 'too': '2',
  'three': '3',
  'four': '4', 'for': '4',
  'five': '5',
  'six': '6',
  'seven': '7',
  'eight': '8', 'ate': '8',
  'nine': '9',
  'ten': '10',
  'eleven': '11',
  'twelve': '12',
  'thirteen': '13',
  'fourteen': '14',
  'fifteen': '15',
  'sixteen': '16',
  'seventeen': '17',
  'eighteen': '18',
  'nineteen': '19',
  'twenty': '20',
  'thirty': '30',
  'forty': '40',
  'fifty': '50',
  'sixty': '60',
  'seventy': '70',
  'eighty': '80',
  'ninety': '90',
  'hundred': '00',
  'thousand': '000',
  'point': '.',
  'dot': '.',
  'decimal': '.'
};

// Convert spoken words to numeric string
const convertSpokenToNumeric = (text: string): string => {
  let result = text.toLowerCase().trim();
  
  // Replace word numbers with digits
  Object.entries(wordsToNumbers).forEach(([word, digit]) => {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit);
  });
  
  // Remove non-numeric characters except digits, dots, and hyphens
  result = result.replace(/[^\d.-]/g, '');
  
  // Handle multiple decimals - keep only first
  const parts = result.split('.');
  if (parts.length > 2) {
    result = parts[0] + '.' + parts.slice(1).join('');
  }
  
  return result;
};

export default function VoiceInput({
  value,
  onChange,
  numeric = false,
  className = '',
  placeholder = '',
  type = 'text',
  required = false,
  step,
  name,
  maxLength,
  rows
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isTextarea = rows !== undefined;

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        
        if (numeric) {
          const numericValue = convertSpokenToNumeric(transcript);
          onChange(numericValue);
        } else {
          // For text fields, capitalize first letter
          const formattedText = transcript.charAt(0).toUpperCase() + transcript.slice(1);
          onChange(formattedText);
        }
        
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [numeric, onChange]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const displayValue = value === undefined ? '' : String(value);

  const baseInputClass = `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600 ${className}`;

  return (
    <div className="relative">
      {isTextarea ? (
        <textarea
          name={name}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          rows={rows}
          className={baseInputClass}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          step={step}
          maxLength={maxLength}
          className={baseInputClass}
        />
      )}
      
      {isSupported && (
        <button
          type="button"
          onClick={toggleListening}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
            isListening 
              ? 'bg-red-500 text-white animate-pulse' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          aria-label={isListening ? 'Stop recording' : 'Start voice input'}
          title={isListening ? 'Stop recording' : 'Tap to speak'}
        >
          {isListening ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}