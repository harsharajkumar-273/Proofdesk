// Monaco Editor Theme Configuration
// Light academic palette to match the professor-facing dashboard

import type * as Monaco from 'monaco-editor';

export const HandshakeTheme: Monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '3F7A57', fontStyle: 'italic' },
    { token: 'comment.line', foreground: '3F7A57', fontStyle: 'italic' },
    { token: 'comment.block', foreground: '3F7A57', fontStyle: 'italic' },
    { token: 'string', foreground: 'B45309' },
    { token: 'string.escape', foreground: 'D97706' },
    { token: 'string.regex', foreground: 'B45309' },
    { token: 'keyword', foreground: '1D4ED8' },
    { token: 'keyword.control', foreground: '1D4ED8' },
    { token: 'keyword.operator', foreground: '2563EB' },
    { token: 'storage', foreground: '1D4ED8' },
    { token: 'storage.type', foreground: '1D4ED8' },
    { token: 'entity.name.function', foreground: '0F766E' },
    { token: 'support.function', foreground: '0F766E' },
    { token: 'function', foreground: '0F766E' },
    { token: 'variable', foreground: '0F172A' },
    { token: 'variable.parameter', foreground: '0F172A' },
    { token: 'variable.other', foreground: '0F172A' },
    { token: 'constant', foreground: '0369A1' },
    { token: 'constant.numeric', foreground: '0369A1' },
    { token: 'constant.language', foreground: '0369A1' },
    { token: 'number', foreground: '0369A1' },
    { token: 'entity.name.type', foreground: '7C3AED' },
    { token: 'entity.name.class', foreground: '7C3AED' },
    { token: 'support.type', foreground: '7C3AED' },
    { token: 'support.class', foreground: '7C3AED' },
    { token: 'variable.object.property', foreground: '1E40AF' },
    { token: 'meta.object-literal.key', foreground: '1E40AF' },
    { token: 'entity.other.attribute-name', foreground: '1E40AF' },
    { token: 'punctuation', foreground: '64748B' },
    { token: 'punctuation.definition', foreground: '64748B' },
    { token: 'delimiter', foreground: '64748B' },
    { token: 'tag', foreground: '2563EB' },
    { token: 'meta.tag', foreground: '2563EB' },
    { token: 'string.key.json', foreground: '1D4ED8' },
    { token: 'keyword.json', foreground: '1D4ED8' },
    { token: 'entity.name.tag.yaml', foreground: '2563EB' },
    { token: 'markup.heading', foreground: '1D4ED8', fontStyle: 'bold' },
    { token: 'markup.bold', fontStyle: 'bold' },
    { token: 'markup.italic', fontStyle: 'italic' },
    { token: 'markup.quote', foreground: '3F7A57', fontStyle: 'italic' },
    { token: 'markup.raw', foreground: 'B45309' },
    { token: 'markup.list', foreground: '2563EB' },
  ],
  colors: {
    'editor.background': '#F8FBFF',
    'editor.foreground': '#0F172A',
    'editorLineNumber.foreground': '#94A3B8',
    'editorLineNumber.activeForeground': '#1D4ED8',
    'editorCursor.foreground': '#1D4ED8',
    'editor.selectionBackground': '#DBEAFE',
    'editor.inactiveSelectionBackground': '#DBEAFE80',
    'editor.selectionHighlightBackground': '#BFDBFE80',
    'editor.wordHighlightBackground': '#DBEAFE80',
    'editor.wordHighlightStrongBackground': '#BFDBFEAA',
    'editor.findMatchBackground': '#FDE68A99',
    'editor.findMatchHighlightBackground': '#FDE68A55',
    'editor.lineHighlightBackground': '#EFF6FF',
    'editor.lineHighlightBorder': '#DBEAFE',
    'editorIndentGuide.background': '#E2E8F0',
    'editorIndentGuide.activeBackground': '#93C5FD',
    'editorRuler.foreground': '#CBD5E1',
    'editorGutter.background': '#F8FBFF',
    'editorGutter.modifiedBackground': '#F59E0B',
    'editorGutter.addedBackground': '#22C55E',
    'editorGutter.deletedBackground': '#EF4444',
    'editorBracketMatch.background': '#DBEAFE',
    'editorBracketMatch.border': '#60A5FA',
    'scrollbar.shadow': '#E2E8F0',
    'scrollbarSlider.background': '#BFDBFEAA',
    'scrollbarSlider.hoverBackground': '#93C5FD',
    'scrollbarSlider.activeBackground': '#60A5FA',
    'activityBar.background': '#EFF6FF',
    'activityBar.foreground': '#1E3A8A',
    'activityBar.inactiveForeground': '#64748B',
    'activityBarBadge.background': '#2563EB',
    'activityBarBadge.foreground': '#FFFFFF',
    'sideBar.background': '#F8FAFC',
    'sideBar.foreground': '#1E3A8A',
    'sideBarTitle.foreground': '#1E3A8A',
    'sideBarSectionHeader.background': '#EFF6FF',
    'sideBarSectionHeader.foreground': '#1E3A8A',
    'list.activeSelectionBackground': '#DBEAFE',
    'list.activeSelectionForeground': '#0F172A',
    'list.inactiveSelectionBackground': '#EFF6FF',
    'list.hoverBackground': '#EFF6FF',
    'input.background': '#FFFFFF',
    'input.border': '#BFDBFE',
    'input.foreground': '#0F172A',
    'input.placeholderForeground': '#94A3B8',
    'inputOption.activeBorder': '#2563EB',
    'button.background': '#2563EB',
    'button.foreground': '#FFFFFF',
    'button.hoverBackground': '#1D4ED8',
    'statusBar.background': '#EFF6FF',
    'statusBar.foreground': '#334155',
    'statusBar.border': '#BFDBFE',
    'terminal.background': '#F8FBFF',
    'terminal.foreground': '#0F172A',
    'terminal.ansiBlack': '#64748B',
    'terminal.ansiRed': '#DC2626',
    'terminal.ansiGreen': '#15803D',
    'terminal.ansiYellow': '#B45309',
    'terminal.ansiBlue': '#2563EB',
    'terminal.ansiMagenta': '#7C3AED',
    'terminal.ansiCyan': '#0F766E',
    'terminal.ansiWhite': '#0F172A',
    'terminal.ansiBrightBlack': '#94A3B8',
    'terminal.ansiBrightRed': '#EF4444',
    'terminal.ansiBrightGreen': '#22C55E',
    'terminal.ansiBrightYellow': '#D97706',
    'terminal.ansiBrightBlue': '#3B82F6',
    'terminal.ansiBrightMagenta': '#8B5CF6',
    'terminal.ansiBrightCyan': '#14B8A6',
    'terminal.ansiBrightWhite': '#020617',
    'tab.activeBackground': '#FFFFFF',
    'tab.activeForeground': '#0F172A',
    'tab.activeBorderTop': '#2563EB',
    'tab.inactiveBackground': '#EFF6FF',
    'tab.inactiveForeground': '#64748B',
    'tab.border': '#BFDBFE',
    'panel.background': '#F8FAFC',
    'panel.border': '#BFDBFE',
    'panelTitle.activeBorder': '#2563EB',
    'panelTitle.activeForeground': '#1E3A8A',
    'panelTitle.inactiveForeground': '#64748B',
    'peekView.border': '#2563EB',
    'peekViewEditor.background': '#F8FBFF',
    'peekViewEditor.matchHighlightBackground': '#FDE68A99',
    'peekViewResult.background': '#F8FAFC',
    'peekViewResult.fileForeground': '#0F172A',
    'peekViewResult.lineForeground': '#334155',
    'peekViewResult.matchHighlightBackground': '#FDE68A99',
    'peekViewResult.selectionBackground': '#DBEAFE',
    'peekViewResult.selectionForeground': '#0F172A',
    'peekViewTitle.background': '#EFF6FF',
    'peekViewTitleDescription.foreground': '#64748B',
    'peekViewTitleLabel.foreground': '#1E3A8A',
  }
};

// Function to apply the theme to Monaco Editor
export function applyHandshakeTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme('handshake-light', HandshakeTheme);
  monaco.editor.setTheme('handshake-light');
}

// CSS styles for the rest of the UI to match Handshake
export const handshakeStyles = `
  /* Background colors */
  .bg-editor { background-color: #0D1117; }
  .bg-sidebar { background-color: #010409; }
  .bg-header { background-color: #161B22; }
  .bg-hover { background-color: #161B22; }
  .bg-selected { background-color: #1F6FEB; }
  .bg-terminal { background-color: #0D1117; }
  
  /* Text colors */
  .text-primary { color: #C9D1D9; }
  .text-secondary { color: #8B949E; }
  .text-muted { color: #484F58; }
  .text-green { color: #7EE787; }
  .text-blue { color: #79C0FF; }
  .text-purple { color: #D2A8FF; }
  .text-yellow { color: #FFD700; }
  .text-orange { color: #FFA657; }
  .text-red { color: #FF7B72; }
  .text-pink { color: #F97583; }
  .text-cyan { color: #79E7FF; }
  
  /* Border colors */
  .border-primary { border-color: #30363D; }
  .border-hover { border-color: #484F58; }
  .border-selected { border-color: #1F6FEB; }
  
  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  ::-webkit-scrollbar-track {
    background: #010409;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #484F58;
    border-radius: 5px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #6E7681;
  }
  
  /* Selection colors */
  ::selection {
    background-color: #264F78;
    color: #C9D1D9;
  }
  
  /* Input styling */
  input, textarea {
    background-color: #0D1117;
    border-color: #30363D;
    color: #C9D1D9;
  }
  
  input:focus, textarea:focus {
    border-color: #1F6FEB;
    outline: none;
    box-shadow: 0 0 0 2px rgba(31, 111, 235, 0.3);
  }
  
  /* Button styling */
  .btn-primary {
    background-color: #238636;
    color: #FFFFFF;
  }
  
  .btn-primary:hover {
    background-color: #2EA043;
  }
  
  .btn-secondary {
    background-color: #21262D;
    color: #C9D1D9;
    border: 1px solid #30363D;
  }
  
  .btn-secondary:hover {
    background-color: #30363D;
    border-color: #484F58;
  }
  
  /* Code highlighting classes */
  .syntax-comment { color: #7EE787; font-style: italic; }
  .syntax-string { color: #FFA657; }
  .syntax-keyword { color: #F97583; }
  .syntax-function { color: #79C0FF; }
  .syntax-variable { color: #E1E4E8; }
  .syntax-number { color: #79E7FF; }
  .syntax-type { color: #FFD700; }
  .syntax-property { color: #D2A8FF; }
  .syntax-operator { color: #FF7B72; }
  .syntax-punctuation { color: #8B949E; }
`;

export default HandshakeTheme;
