import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

// Type definitions
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'loading' | 'info';
  duration?: number;
  onClose: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'loading' | 'info';
  duration?: number;
}

function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBgColor = (): string => {
    switch (type) {
      case 'success':
        return 'bg-green-900/90';
      case 'error':
        return 'bg-red-900/90';
      default:
        return 'bg-gray-800/90';
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 flex items-center space-x-3 ${getBgColor()} 
        text-white px-4 py-3 rounded-lg shadow-lg backdrop-blur transition-all z-50
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {getIcon()}
      <span className="text-sm">{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 text-gray-400 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'loading' | 'info' = 'info', duration: number = 3000): void => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id: number): void => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const ToastContainer: React.FC = () => (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{ bottom: `${(index + 1) * 60 + 16}px` }}
          className="fixed right-4 z-50"
        >
          <Toast
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </>
  );

  return { showToast, ToastContainer };
}

export default Toast;
