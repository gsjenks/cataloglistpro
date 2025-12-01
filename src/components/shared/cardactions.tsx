import { useState, type FC, type MouseEvent, type ReactNode } from 'react';
import { Edit, Trash2, Eye, Download, MoreVertical } from 'lucide-react';

/**
 * CardActions Component
 * 
 * Provides consistent action buttons for all cards in CatalogPro
 * Buttons appear on hover in the top-right corner of cards
 * 
 * Usage:
 * <Card>
 *   <CardActions onEdit={handleEdit} onDelete={handleDelete} />
 *   <h3>Card Content</h3>
 * </Card>
 */

interface CardActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onView?: () => void;
  onDownload?: () => void;
  customActions?: Array<{
    icon: ReactNode;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
  }>;
  showEditLabel?: boolean;
  showDeleteLabel?: boolean;
}

export const CardActions: FC<CardActionsProps> = ({ 
  onEdit,
  onDelete,
  onView,
  onDownload,
  customActions,
  showEditLabel = false,
  showDeleteLabel = false
}) => {
  const handleAction = (e: MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      {/* View Button */}
      {onView && (
        <button
          onClick={(e) => handleAction(e, onView)}
          className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
          aria-label="View"
          title="View"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}

      {/* Download Button */}
      {onDownload && (
        <button
          onClick={(e) => handleAction(e, onDownload)}
          className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-all shadow-sm"
          aria-label="Download"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      )}

      {/* Edit Button */}
      {onEdit && (
        <button
          onClick={(e) => handleAction(e, onEdit)}
          className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm"
          aria-label="Edit"
          title="Edit"
        >
          <Edit className="w-4 h-4" />
          {showEditLabel && <span className="ml-1 text-xs">Edit</span>}
        </button>
      )}

      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={(e) => handleAction(e, onDelete)}
          className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all shadow-sm"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
          {showDeleteLabel && <span className="ml-1 text-xs">Delete</span>}
        </button>
      )}

      {/* Custom Actions */}
      {customActions && customActions.map((action, index) => (
        <button
          key={index}
          onClick={(e) => handleAction(e, action.onClick)}
          className={`
            p-1.5 rounded-full bg-white hover:bg-gray-100 transition-all shadow-sm
            ${action.variant === 'danger' 
              ? 'text-gray-400 hover:text-red-600' 
              : 'text-gray-400 hover:text-gray-600'
            }
          `}
          aria-label={action.label}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
};

/**
 * CardActionsDropdown Component
 * 
 * Alternative to CardActions that uses a dropdown menu instead of inline buttons
 * Better for mobile or when there are many actions
 * 
 * Usage:
 * <Card>
 *   <CardActionsDropdown
 *     actions={[
 *       { label: 'Edit', onClick: handleEdit, icon: <Edit /> },
 *       { label: 'Delete', onClick: handleDelete, icon: <Trash2 />, variant: 'danger' }
 *     ]}
 *   />
 *   <h3>Card Content</h3>
 * </Card>
 */

interface CardActionsDropdownProps {
  actions: Array<{
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    variant?: 'default' | 'danger';
  }>;
}

export const CardActionsDropdown: FC<CardActionsDropdownProps> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (e: MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setIsOpen(false);
  };

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      <button
        onClick={handleToggle}
        className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm opacity-0 group-hover:opacity-100"
        aria-label="More actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={(e) => handleAction(e, action.onClick)}
                className={`
                  w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2
                  ${action.variant === 'danger'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * CardActionButton Component
 * 
 * Standalone action button for use within card content
 * For actions that should be visible without hover
 * 
 * Usage:
 * <Card>
 *   <h3>Card Title</h3>
 *   <p>Content...</p>
 *   <div className="flex gap-2 mt-4">
 *     <CardActionButton onClick={handleView}>View</CardActionButton>
 *     <CardActionButton onClick={handleDownload} variant="secondary">
 *       Download
 *     </CardActionButton>
 *   </div>
 * </Card>
 */

interface CardActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: ReactNode;
  className?: string;
}

export const CardActionButton: FC<CardActionButtonProps> = ({ 
  children, 
  onClick,
  variant = 'primary',
  icon,
  className = ''
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-indigo-600 text-white hover:bg-indigo-700';
      case 'secondary':
        return 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50';
      case 'danger':
        return 'bg-red-600 text-white hover:bg-red-700';
      default:
        return 'bg-indigo-600 text-white hover:bg-indigo-700';
    }
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 
        px-3 py-1.5 
        text-sm font-medium 
        rounded-md 
        transition-colors
        ${getVariantStyles()}
        ${className}
      `}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export default CardActions;

/*
 * USAGE EXAMPLES:
 * 
 * 1. Standard Actions (Edit + Delete)
 * ------------------------------------
 * <Card onClick={() => navigate('/detail')}>
 *   <CardActions 
 *     onEdit={() => setEditModal(true)} 
 *     onDelete={() => handleDelete(item)} 
 *   />
 *   <h3>Card Content</h3>
 * </Card>
 * 
 * 
 * 2. Document Actions (View + Download + Edit + Delete)
 * ------------------------------------------------------
 * <Card onClick={() => openViewer(doc)}>
 *   <CardActions 
 *     onView={() => openViewer(doc)}
 *     onDownload={() => download(doc)}
 *     onEdit={() => setEditModal(true)} 
 *     onDelete={() => handleDelete(doc)} 
 *   />
 *   <h3>Document Name</h3>
 * </Card>
 * 
 * 
 * 3. Custom Actions
 * ------------------
 * <Card>
 *   <CardActions 
 *     customActions={[
 *       { 
 *         icon: <Star className="w-4 h-4" />, 
 *         label: 'Feature', 
 *         onClick: () => toggleFeature(item) 
 *       },
 *       { 
 *         icon: <Copy className="w-4 h-4" />, 
 *         label: 'Duplicate', 
 *         onClick: () => duplicate(item) 
 *       }
 *     ]}
 *   />
 *   <h3>Card Content</h3>
 * </Card>
 * 
 * 
 * 4. Dropdown Menu (for many actions or mobile)
 * ----------------------------------------------
 * <Card>
 *   <CardActionsDropdown
 *     actions={[
 *       { label: 'View', onClick: handleView, icon: <Eye /> },
 *       { label: 'Edit', onClick: handleEdit, icon: <Edit /> },
 *       { label: 'Download', onClick: handleDownload, icon: <Download /> },
 *       { label: 'Delete', onClick: handleDelete, icon: <Trash2 />, variant: 'danger' }
 *     ]}
 *   />
 *   <h3>Card Content</h3>
 * </Card>
 * 
 * 
 * 5. Inline Action Buttons (visible without hover)
 * -------------------------------------------------
 * <Card>
 *   <h3>Document Name</h3>
 *   <p>Description...</p>
 *   <div className="flex gap-2 mt-4">
 *     <CardActionButton 
 *       onClick={handleView}
 *       icon={<Eye className="w-4 h-4" />}
 *     >
 *       View
 *     </CardActionButton>
 *     <CardActionButton 
 *       onClick={handleDownload}
 *       variant="secondary"
 *       icon={<Download className="w-4 h-4" />}
 *     >
 *       Download
 *     </CardActionButton>
 *   </div>
 * </Card>
 * 
 * 
 * BEST PRACTICES:
 * ---------------
 * 1. Always use e.stopPropagation() to prevent card click when clicking actions
 * 2. Provide meaningful aria-labels for accessibility
 * 3. Use consistent action order: View, Download, Edit, Delete
 * 4. Delete actions should have hover:text-red-600 for visual warning
 * 5. For 3+ actions, consider using CardActionsDropdown
 * 6. For mobile-first design, prefer CardActionsDropdown or inline buttons
 */