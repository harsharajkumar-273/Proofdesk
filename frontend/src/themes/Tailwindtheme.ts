// Tailwind CSS classes for Handshake-like theme with proper contrast

export const themeClasses = {
  // Main containers
  mainContainer: "h-screen flex flex-col bg-[#0a0e27]", // Darker blue-black background
  
  // Header
  header: "bg-[#151932] border-b border-[#2a3f5f] px-3 py-2", // Slightly lighter header
  headerButton: "px-3 py-1.5 text-gray-300 hover:text-white hover:bg-[#1e2139] rounded transition-colors",
  
  // Activity Bar (left icons)
  activityBar: "w-12 bg-[#0a0e27] border-r border-[#2a3f5f] flex flex-col",
  activityButton: "p-3 text-gray-500 hover:text-gray-200 hover:bg-[#151932] relative",
  activityButtonActive: "p-3 text-white bg-[#151932] border-l-2 border-blue-500",
  
  // Sidebar
  sidebar: "w-64 bg-[#151932] border-r border-[#2a3f5f] flex flex-col",
  sidebarHeader: "p-3 bg-[#1e2139] border-b border-[#2a3f5f] flex items-center justify-between",
  sidebarTitle: "text-xs font-semibold text-gray-400 uppercase tracking-wider",
  
  // File Explorer
  fileTree: "flex-1 overflow-y-auto bg-[#151932]",
  fileItem: "flex items-center py-1.5 px-3 text-gray-300 hover:bg-[#1e2139] cursor-pointer text-sm",
  fileItemActive: "flex items-center py-1.5 px-3 bg-[#2a3f5f] text-white cursor-pointer text-sm",
  folderIcon: "w-4 h-4 mr-2 text-yellow-600",
  fileIcon: "w-4 h-4 mr-2 text-blue-400",
  
  // Search box
  searchBox: "p-2 border-b border-[#2a3f5f]",
  searchInput: "w-full px-3 py-1.5 bg-[#0a0e27] text-gray-200 placeholder-gray-500 border border-[#2a3f5f] rounded text-sm focus:border-blue-500 focus:outline-none",
  
  // Tabs
  tabsContainer: "bg-[#1e2139] border-b border-[#2a3f5f] flex overflow-x-auto",
  tab: "px-4 py-2 text-gray-400 hover:text-gray-200 hover:bg-[#151932] cursor-pointer flex items-center space-x-2 border-r border-[#2a3f5f] text-sm",
  tabActive: "px-4 py-2 bg-[#0a0e27] text-white cursor-pointer flex items-center space-x-2 border-r border-[#2a3f5f] border-t-2 border-t-blue-500 text-sm",
  
  // Editor area
  editorContainer: "flex-1 flex bg-[#0a0e27]",
  editorPane: "flex-1 flex flex-col",
  editorHeader: "bg-[#151932] px-4 py-2 border-b border-[#2a3f5f] flex items-center justify-between",
  editorContent: "flex-1 bg-[#0a0e27]",
  
  // Preview panel
  previewPane: "flex-1 flex flex-col border-l border-[#2a3f5f]",
  previewHeader: "bg-[#151932] px-4 py-2 border-b border-[#2a3f5f] flex items-center justify-between",
  previewContent: "flex-1 bg-white",
  
  // Terminal
  terminalContainer: "h-80 bg-[#0a0e27] border-t border-[#2a3f5f]",
  terminalHeader: "bg-[#151932] px-4 py-2 border-b border-[#2a3f5f] flex items-center justify-between",
  terminalContent: "p-4 font-mono text-sm text-gray-200",
  
  // Buttons
  buttonPrimary: "px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors",
  buttonSuccess: "px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors",
  buttonGhost: "px-3 py-1.5 text-gray-300 hover:text-white hover:bg-[#1e2139] rounded text-sm transition-colors",
  buttonDanger: "px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors",
  
  // Git panel
  gitModified: "text-yellow-500",
  gitAdded: "text-green-500",
  gitDeleted: "text-red-500",
  gitUntracked: "text-gray-500",
  
  // Status messages
  statusText: "text-gray-400 text-sm",
  statusTextBright: "text-gray-200 text-sm",
  
  // Dropdown
  dropdown: "absolute top-full mt-2 bg-[#1e2139] border border-[#2a3f5f] rounded-lg shadow-xl",
  dropdownItem: "px-4 py-2 text-gray-300 hover:text-white hover:bg-[#2a3f5f] cursor-pointer text-sm",
  
  // Profile
  profileButton: "flex items-center space-x-2 p-1.5 text-gray-300 hover:text-white hover:bg-[#1e2139] rounded",
  avatar: "w-6 h-6 rounded-full border border-[#2a3f5f]",
};

// Color constants for JavaScript usage
export const colors = {
  // Backgrounds
  bgPrimary: "#0a0e27",      // Main dark background
  bgSecondary: "#151932",     // Slightly lighter for panels
  bgTertiary: "#1e2139",      // Hover states
  bgActive: "#2a3f5f",        // Selected items
  
  // Text
  textPrimary: "#ffffff",     // White for important text
  textSecondary: "#e2e8f0",   // Light gray for regular text
  textMuted: "#94a3b8",       // Muted gray
  textDim: "#64748b",         // Even more muted
  
  // Borders
  borderPrimary: "#2a3f5f",   // Main border color
  borderSecondary: "#1e2139", // Subtle borders
  
  // Accents
  accentBlue: "#3b82f6",      // Primary actions
  accentGreen: "#10b981",     // Success
  accentYellow: "#f59e0b",    // Warnings/Modified
  accentRed: "#ef4444",       // Errors/Deleted
  accentPurple: "#a78bfa",    // Special
  
  // Syntax highlighting
  syntaxComment: "#10b981",   // Green comments
  syntaxString: "#f97316",    // Orange strings  
  syntaxKeyword: "#ec4899",   // Pink keywords
  syntaxFunction: "#3b82f6",  // Blue functions
  syntaxVariable: "#e2e8f0",  // Light variables
  syntaxNumber: "#06b6d4",    // Cyan numbers
  syntaxType: "#fbbf24",      // Yellow types
};