import { useState } from 'react';
import { Download, Upload, ChevronRight, X, FileSpreadsheet, Archive, AlertCircle, FileText } from 'lucide-react';
import LiveAuctioneersUpload from './LiveAuctioneersUpload';
import EOAProcessing from './EOAProcessing';

type ToolView = 'menu' | 'la-import' | 'la-export' | 'invoice-import';

interface SaleReportsToolsProps {
  saleId: string;
  saleName: string;
  exporting: boolean;
  exportMessage: { type: 'success' | 'error' | 'info'; text: string } | null;
  exportStats: {
    totalLots: number;
    lotsWithPhotos: number;
    totalPhotos: number;
    missingData: string[];
  } | null;
  onExportCSV: (includePhotos: boolean) => void;
}

export default function SaleReportsTools({
  saleId: _saleId,
  saleName,
  exporting,
  exportMessage,
  exportStats,
  onExportCSV
}: SaleReportsToolsProps) {
  const [activeView, setActiveView] = useState<ToolView>('menu');

  // Tool menu items
  const tools = [
    {
      id: 'la-export',
      title: 'LiveAuctioneers Export',
      description: 'Export this sale\'s catalog to LiveAuctioneers CSV format with photos',
      icon: <Download className="w-6 h-6 text-indigo-600" />,
      view: 'la-export' as ToolView,
    },
    {
      id: 'la-import',
      title: 'LiveAuctioneers Import',
      description: 'Upload and validate CSV catalog and images for LiveAuctioneers',
      icon: <Upload className="w-6 h-6 text-indigo-600" />,
      view: 'la-import' as ToolView,
    },
    {
      id: 'invoice-import',
      title: 'EOA Processing',
      description: 'Import EOA report, update prices, and generate shipping documents',
      icon: <FileText className="w-6 h-6 text-indigo-600" />,
      view: 'invoice-import' as ToolView,
    },
  ];

  // Render Export View
  if (activeView === 'la-export') {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => setActiveView('menu')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <X className="w-4 h-4" />
          Back to Tools
        </button>

        {/* Export Message */}
        {exportMessage && (
          <div
            className={`p-4 rounded-lg border ${
              exportMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : exportMessage.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <p className="text-sm font-medium">{exportMessage.text}</p>
          </div>
        )}

        {/* Export Overview */}
        {exportStats && (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Overview</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-indigo-600">{exportStats.totalLots}</p>
                <p className="text-sm text-gray-600 mt-1">Total Lots</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-indigo-600">{exportStats.lotsWithPhotos}</p>
                <p className="text-sm text-gray-600 mt-1">With Photos</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-indigo-600">{exportStats.totalPhotos}</p>
                <p className="text-sm text-gray-600 mt-1">Total Photos</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className={`text-3xl font-bold ${exportStats.missingData.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {exportStats.missingData.length}
                </p>
                <p className="text-sm text-gray-600 mt-1">Issues Found</p>
              </div>
            </div>

            {/* Issues Warning */}
            {exportStats.missingData.length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900 mb-2">
                      Some lots are missing required data:
                    </p>
                    <ul className="text-xs text-yellow-800 space-y-1">
                      {exportStats.missingData.slice(0, 5).map((issue, idx) => (
                        <li key={idx}>• {issue}</li>
                      ))}
                      {exportStats.missingData.length > 5 && (
                        <li>• ... and {exportStats.missingData.length - 5} more</li>
                      )}
                    </ul>
                    <p className="text-xs text-yellow-800 mt-2">
                      Fix these before exporting.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LiveAuctioneers Export Card */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">LiveAuctioneers Export</h3>
              <p className="text-sm text-gray-600">Export catalog in LiveAuctioneers CSV format</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Export CSV Only */}
            <button
              onClick={() => onExportCSV(false)}
              disabled={exporting || !exportStats || exportStats.totalLots === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export CSV Only</span>
                </>
              )}
            </button>

            {/* Export CSV + Photos */}
            <button
              onClick={() => onExportCSV(true)}
              disabled={exporting || !exportStats || exportStats.totalLots === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-700 border-t-transparent"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" />
                  <span>Export CSV + Photos (ZIP)</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>CSV Only:</strong> Downloads a LiveAuctioneers-formatted CSV file with lot data.<br/>
              <strong>CSV + Photos:</strong> Downloads a ZIP file containing the CSV and all photos renamed to LiveAuctioneers format (lotNumber_sequence.jpg).
            </p>
          </div>

          {/* Works Offline Badge */}
          {!navigator.onLine && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Working offline - Using locally stored data</span>
              </p>
            </div>
          )}
        </div>

        {/* More Reports Coming Soon */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Additional Reports</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>• Shipping Labels with QR Codes (Coming Soon)</p>
            <p>• Unsold Items Report (Coming Soon)</p>
            <p>• Sales Analytics Dashboard (Coming Soon)</p>
          </div>
        </div>
      </div>
    );
  }

  // Render Import View
  if (activeView === 'la-import') {
    return (
      <div>
        {/* Back button */}
        <button
          onClick={() => setActiveView('menu')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <X className="w-4 h-4" />
          Back to Tools
        </button>
        <LiveAuctioneersUpload saleId={_saleId} saleName={saleName} />
      </div>
    );
  }

  // Render Invoice Import View
  if (activeView === 'invoice-import') {
    return (
      <div>
        {/* Back button */}
        <button
          onClick={() => setActiveView('menu')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <X className="w-4 h-4" />
          Back to Tools
        </button>
        <EOAProcessing saleId={_saleId} saleName={saleName} />
      </div>
    );
  }

  // Default menu view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports & Tools</h2>
        <p className="text-sm text-gray-600 mt-1">
          Export catalogs, import data, and manage {saleName}
        </p>
      </div>

      {/* Tools Grid */}
      <div className="grid gap-4">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveView(tool.view)}
            className="flex items-center gap-4 p-6 bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all text-left"
          >
            {/* Icon */}
            <div className="flex-shrink-0 p-3 bg-indigo-50 rounded-lg">
              {tool.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {tool.title}
              </h3>
              <p className="text-sm text-gray-600">{tool.description}</p>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Quick Stats */}
      {exportStats && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">
            Current Sale Stats
          </h4>
          <div className="grid grid-cols-3 gap-3 text-xs text-blue-800">
            <div>
              <p className="font-medium">{exportStats.totalLots}</p>
              <p className="text-blue-600">Total Lots</p>
            </div>
            <div>
              <p className="font-medium">{exportStats.lotsWithPhotos}</p>
              <p className="text-blue-600">With Photos</p>
            </div>
            <div>
              <p className="font-medium">{exportStats.totalPhotos}</p>
              <p className="text-blue-600">Total Photos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}