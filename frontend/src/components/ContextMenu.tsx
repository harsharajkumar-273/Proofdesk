import React, { useEffect, useRef } from 'react';
import { 
  Edit2, 
  Trash2, 
  Download,
  FolderPlus,
  FilePlus
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  isFolder: boolean;
  path: string;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onDownload,
  isFolder
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-[#1e2139] border border-[#2a3f5f] rounded-lg shadow-2xl py-1 z-50 min-w-[180px]"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        maxHeight: '400px',
        overflow: 'auto'
      }}
    >
      {isFolder && (
        <>
          <button
            onClick={() => {
              onNewFile();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2a3f5f] hover:text-white flex items-center space-x-2"
          >
            <FilePlus className="w-4 h-4" />
            <span>New File</span>
          </button>
          
          <button
            onClick={() => {
              onNewFolder();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2a3f5f] hover:text-white flex items-center space-x-2"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Folder</span>
          </button>
          
          <div className="border-t border-[#2a3f5f] my-1"></div>
        </>
      )}
      
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2a3f5f] hover:text-white flex items-center space-x-2"
      >
        <Edit2 className="w-4 h-4" />
        <span>Rename</span>
      </button>
      
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[#2a3f5f] hover:text-red-300 flex items-center space-x-2"
      >
        <Trash2 className="w-4 h-4" />
        <span>Delete</span>
      </button>
      
      {!isFolder && onDownload && (
        <>
          <div className="border-t border-[#2a3f5f] my-1"></div>
          <button
            onClick={() => {
              onDownload();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2a3f5f] hover:text-white flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
