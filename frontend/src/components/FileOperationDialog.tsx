import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface FileOperationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  title: string;
  placeholder: string;
  defaultValue?: string;
  validator?: (value: string) => string | null;
}

const FileOperationDialog: React.FC<FileOperationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  placeholder,
  defaultValue = '',
  validator
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    setValue(defaultValue);
    setError(null);
  }, [defaultValue, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!value.trim()) {
      setError('Name cannot be empty');
      return;
    }

    if (validator) {
      const validationError = validator(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(value.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1e2139] border border-[#2a3f5f] rounded-lg p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-[#0a0e27] text-white border border-[#2a3f5f] rounded focus:border-blue-500 focus:outline-none"
          />
          
          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
          
          <div className="flex justify-end space-x-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FileOperationDialog;