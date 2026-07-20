import React, { useState, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathEditorProps {
  content: string;
  onChange: (content: string) => void;
  isInline?: boolean;
}

const MathEditor: React.FC<MathEditorProps> = ({ 
  content, 
  onChange, 
  isInline = false 
}) => {
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    try {
      const html = katex.renderToString(content, {
        throwOnError: false,
        displayMode: !isInline,
        errorColor: '#ff0000'
      });
      setPreview(html);
      setError('');
    } catch (err) {
      setError((err as Error).message);
      setPreview('');
    }
  }, [content, isInline]);

  return (
    <div className="math-editor">
      <div className="latex-input">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-32 p-2 bg-[#0a0e27] text-white font-mono"
          placeholder="Enter LaTeX math..."
        />
      </div>
      
      <div className="math-preview mt-4 p-4 bg-white rounded">
        {error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: preview }} />
        )}
      </div>
    </div>
  );
};

export default MathEditor;