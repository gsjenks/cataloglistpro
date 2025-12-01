// components/Contextfooter.tsx
// Footer with dynamic action buttons only (wifi/sync moved to header StatusBar)

import { useFooter } from '../context/FooterContext';

export default function ContextFooter() {
  const { actions } = useFooter();

  const getButtonClasses = (variant?: string) => {
    const base = 'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed';
    
    switch (variant) {
      case 'primary':
        return `${base} bg-indigo-600 text-white hover:bg-indigo-700`;
      case 'secondary':
        return `${base} bg-gray-100 text-gray-700 hover:bg-gray-200`;
      case 'ai':
        return `${base} bg-indigo-100 text-indigo-700 hover:bg-indigo-200`;
      case 'danger':
        return `${base} bg-red-600 text-white hover:bg-red-700`;
      default:
        return `${base} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50`;
    }
  };

  // Don't render footer if no actions
  if (actions.length === 0) return null;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 pb-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end h-16">
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
                className={getButtonClasses(action.variant)}
              >
                {action.loading ? (
                  <div className="animate-spin">{action.icon}</div>
                ) : (
                  action.icon
                )}
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}