import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight, Edit3, Eye } from 'lucide-react';

// Type definitions
interface BidirectionalEditorProps {
  sourceCode: string;
  onSourceChange: (newContent: string) => void;
  fileType: string;
}

interface JsonEditorProps {
  json: string;
  onChange: (newJson: string) => void;
}

type PreviewMode = 'preview' | 'edit';
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function BidirectionalEditor({ 
  sourceCode, 
  onSourceChange, 
  fileType
}: BidirectionalEditorProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Enable content editing in iframe
  const enableIframeEditing = (): void => {
    if (iframeRef.current) {
      const iframeDoc = iframeRef.current.contentDocument;
      if (iframeDoc) {
        iframeDoc.designMode = previewMode === 'edit' ? 'on' : 'off';
        
        if (previewMode === 'edit') {
          // Add editing styles
          const style = iframeDoc.createElement('style');
          style.textContent = `
            *:hover {
              outline: 1px dashed #3b82f6 !important;
              cursor: text !important;
            }
            *:focus {
              outline: 2px solid #3b82f6 !important;
            }
          `;
          style.id = 'edit-mode-styles';
          iframeDoc.head.appendChild(style);

          // Listen for changes
          iframeDoc.addEventListener('input', () => {
            const bodyContent = iframeDoc.body.innerHTML;
            const fullHTML = `<!DOCTYPE html>
<html>
<head>${iframeDoc.head.innerHTML}</head>
<body>${bodyContent}</body>
</html>`;
            onSourceChange(fullHTML);
          });
        } else {
          // Remove editing styles
          const editStyles = iframeDoc.getElementById('edit-mode-styles');
          if (editStyles) editStyles.remove();
        }
      }
    }
  };

  // Special handling for different file types
  const renderPreview = (): React.ReactElement => {
    switch (fileType) {
      case 'html':
        return (
          <div className="relative h-full">
            {previewMode === 'edit' && (
              <div className="absolute top-2 left-2 right-2 bg-blue-500 text-white px-3 py-1 rounded text-sm z-10">
                ✏️ Edit Mode: Click any element to modify it
              </div>
            )}
            <iframe
              ref={iframeRef}
              srcDoc={sourceCode}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              onLoad={enableIframeEditing}
            />
          </div>
        );

      case 'markdown':
        // For markdown, we need a markdown editor
        return (
          <div className="h-full p-4 overflow-auto">
            {previewMode === 'edit' ? (
              <div>
                <div className="mb-2 text-sm text-gray-500">
                  📝 Edit the rendered markdown below:
                </div>
                <div
                  contentEditable
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: convertMarkdownToHTML(sourceCode) }}
                  onInput={(e: React.FormEvent<HTMLDivElement>) => {
                    // Convert back to markdown (simplified)
                    const html = e.currentTarget.innerHTML;
                    const markdown = convertHTMLToMarkdown(html);
                    onSourceChange(markdown);
                  }}
                />
              </div>
            ) : (
              <div 
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: convertMarkdownToHTML(sourceCode) }}
              />
            )}
          </div>
        );

      case 'json':
        // For JSON, provide a form-based editor
        return (
          <div className="h-full p-4 overflow-auto">
            {previewMode === 'edit' ? (
              <JsonEditor json={sourceCode} onChange={onSourceChange} />
            ) : (
              <pre className="text-sm">{formatJsonForDisplay(sourceCode)}</pre>
            )}
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p>Bidirectional editing not available for {fileType} files</p>
              <p className="text-sm mt-2">Supported: HTML, Markdown, JSON</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-300">Preview</span>
          {(fileType === 'html' || fileType === 'markdown' || fileType === 'json') && (
            <div className="flex items-center bg-gray-700 rounded">
              <button
                onClick={() => setPreviewMode('preview')}
                className={`px-3 py-1 text-sm flex items-center space-x-1 ${
                  previewMode === 'preview' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:text-white'
                } rounded-l transition-colors`}
              >
                <Eye className="w-3 h-3" />
                <span>View</span>
              </button>
              <button
                onClick={() => setPreviewMode('edit')}
                className={`px-3 py-1 text-sm flex items-center space-x-1 ${
                  previewMode === 'edit' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:text-white'
                } rounded-r transition-colors`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}
        </div>
        
        {previewMode === 'edit' && (
          <div className="flex items-center text-yellow-400 text-sm">
            <ArrowLeftRight className="w-4 h-4 mr-1" />
            <span>Changes sync to code</span>
          </div>
        )}
      </div>

      {/* Preview/Edit Area */}
      <div className="flex-1 bg-white overflow-auto">
        {renderPreview()}
      </div>
    </div>
  );
}

// Helper component for JSON editing
function JsonEditor({ json, onChange }: JsonEditorProps) {
  const [jsonObj, setJsonObj] = useState<JsonObject>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(json) as JsonValue;
      setJsonObj(isJsonObject(parsed) ? parsed : {});
      setError(null);
    } catch {
      setError('Invalid JSON');
    }
  }, [json]);

  const updateValue = (path: string, value: string | number): void => {
    const newObj = { ...jsonObj };
    const keys = path.split('.');
    let current: JsonObject = newObj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const next = current[keys[i]];
      if (!isJsonObject(next)) return;
      current = next;
    }
    
    current[keys[keys.length - 1]] = value;
    setJsonObj(newObj);
    onChange(JSON.stringify(newObj, null, 2));
  };

  const renderJsonForm = (obj: JsonObject, path: string = ''): React.ReactElement[] => {
    return Object.entries(obj).map(([key, value]) => {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (isJsonObject(value)) {
        return (
          <div key={currentPath} className="ml-4 border-l-2 border-gray-200 pl-4 my-2">
            <div className="font-semibold text-gray-700">{key}:</div>
            {renderJsonForm(value, currentPath)}
          </div>
        );
      }
      
      return (
        <div key={currentPath} className="flex items-center space-x-2 my-2">
          <label className="text-sm text-gray-600 w-32">{key}:</label>
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={typeof value === 'string' || typeof value === 'number' ? value : String(value)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const newValue = typeof value === 'number' 
                ? parseFloat(e.target.value) || 0 
                : e.target.value;
              updateValue(currentPath, newValue);
            }}
            className="flex-1 px-2 py-1 border border-gray-300 rounded"
          />
        </div>
      );
    });
  };

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="p-4">
      <div className="text-sm text-gray-500 mb-4">
        Edit JSON values below:
      </div>
      {renderJsonForm(jsonObj)}
    </div>
  );
}

// Helper function to safely format JSON for display
function formatJsonForDisplay(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonString;
  }
}

// Simple markdown converters (you should use a library like markdown-it)
function convertMarkdownToHTML(markdown: string): string {
  // Very basic conversion - in production use markdown-it
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function convertHTMLToMarkdown(html: string): string {
  // Very basic conversion - in production use a proper library
  return html
    .replace(/<h1>(.*?)<\/h1>/g, '# $1\n')
    .replace(/<h2>(.*?)<\/h2>/g, '## $1\n')
    .replace(/<h3>(.*?)<\/h3>/g, '### $1\n')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '') // Remove any other HTML tags
    .trim();
}

export default BidirectionalEditor;
