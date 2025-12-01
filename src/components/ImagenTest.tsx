// Test Google Imagen connection
import { useState } from 'react';

const PROJECT_ID = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = import.meta.env.VITE_GOOGLE_CLOUD_LOCATION;
const API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;

export default function ImagenTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const testConnection = async () => {
    setTesting(true);
    setResult('');
    setError('');

    if (!PROJECT_ID || !LOCATION || !API_KEY) {
      setError('Missing credentials. Check .env file.');
      setTesting(false);
      return;
    }

    try {
      const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;

      console.log('Testing endpoint:', endpoint);

      const testRequest = {
        instances: [
          {
            prompt: "A simple white circle on a transparent background"
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1"
        }
      };

      const response = await fetch(`${endpoint}?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testRequest)
      });

      const responseText = await response.text();
      console.log('Response status:', response.status);
      console.log('Response:', responseText);

      if (!response.ok) {
        setError(`API Error ${response.status}: ${responseText}`);
      } else {
        setResult('✅ Connection successful! Imagen API is working.');
      }
    } catch (err) {
      console.error('Test error:', err);
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Google Imagen Connection Test</h2>

      {/* Config Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded space-y-2">
        <div className="text-sm">
          <strong>Project ID:</strong> 
          <span className="ml-2 font-mono">{PROJECT_ID || '❌ NOT SET'}</span>
        </div>
        <div className="text-sm">
          <strong>Location:</strong> 
          <span className="ml-2 font-mono">{LOCATION || '❌ NOT SET'}</span>
        </div>
        <div className="text-sm">
          <strong>API Key:</strong> 
          <span className="ml-2 font-mono">
            {API_KEY ? `${API_KEY.substring(0, 20)}...` : '❌ NOT SET'}
          </span>
        </div>
      </div>

      <button
        onClick={testConnection}
        disabled={testing}
        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {/* Results */}
      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800">{result}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800 text-sm font-medium mb-2">Error:</p>
          <pre className="text-xs text-red-700 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-semibold mb-2">Setup Instructions:</h3>
        <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
          <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600">Google Cloud Console</a></li>
          <li>Enable "Vertex AI API" for your project</li>
          <li>Create or use existing API key</li>
          <li>Ensure billing is enabled</li>
          <li>Your .env should have:
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded">
{`VITE_GOOGLE_CLOUD_PROJECT_ID=cataloglistpro
VITE_GOOGLE_CLOUD_LOCATION=us-central1
VITE_GOOGLE_CLOUD_API_KEY=your_api_key`}
            </pre>
          </li>
        </ol>
      </div>
    </div>
  );
}