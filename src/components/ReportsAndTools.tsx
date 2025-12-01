import { FileUp, ArrowRight } from 'lucide-react';

export default function ReportsAndTools() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports & Tools</h2>
        <p className="text-sm text-gray-600 mt-1">
          Export catalogs and manage your auction content
        </p>
      </div>

      {/* Placeholder Message */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-12">
        <div className="text-center max-w-md mx-auto">
          <FileUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Sale-Specific Tools
          </h3>
          <p className="text-gray-600 mb-4">
            Reports and tools are available for each individual sale. Navigate to a specific sale to access:
          </p>
          <div className="text-left bg-gray-50 rounded-lg p-4 mb-6">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                LiveAuctioneers Export (CSV & Images)
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                LiveAuctioneers Import (CSV & Images)
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                Sale-specific reports and analytics
              </li>
            </ul>
          </div>
          <p className="text-sm text-gray-500">
            Go to <strong>Sales</strong> tab and select a sale to get started
          </p>
        </div>
      </div>

      {/* More Tools Coming */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">
          Company-Wide Tools Coming Soon
        </h4>
        <div className="text-xs text-blue-800 space-y-1">
          <p>• Multi-Sale Analytics Dashboard</p>
          <p>• Company Performance Reports</p>
          <p>• Buyer Analytics Across Sales</p>
          <p>• Inventory Management</p>
        </div>
      </div>
    </div>
  );
}