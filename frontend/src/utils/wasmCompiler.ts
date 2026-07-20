import { loadPyodideRuntime } from './pyodideLoader';

// Python parser script to compile PreTeXt XML structures to HTML
const pythonCompilerScript = `
import xml.etree.ElementTree as ET
import re

def pretext_to_html(xml_content):
    # Strip xmlns prefix declaration to simplify standard parsing
    xml_content = re.sub(r'\\s+xmlns="[^"]+"', '', xml_content, count=1)
    
    # Raises ParseError if XML is invalid
    root = ET.fromstring(xml_content)

    def clean_text(text):
        return text if text else ""

    def render_node(node, parent_tag=None):
        tag = node.tag
        
        # Render math equations
        if tag == 'm':
            content = clean_text(node.text)
            tail = clean_text(node.tail)
            return f"\\\\({content}\\\\)" + tail
        elif tag == 'me':
            content = clean_text(node.text)
            tail = clean_text(node.tail)
            return f"\\\\[{content}\\\\]" + tail
        elif tag in ('md', 'mdn'):
            rows = []
            for child in node:
                if child.tag == 'mrow':
                    mrow_content = ""
                    if child.text:
                        mrow_content += child.text
                    for subchild in child:
                        mrow_content += render_node(subchild, parent_tag='mrow')
                    mrow_content = mrow_content.replace('\\\\amp', '&').replace('\\amp', '&').replace('&amp;', '&')
                    rows.append(mrow_content)
            content = " \\\\\\\\ \\n".join(rows)
            tail = clean_text(node.tail)
            return f"\\\\[\\\\begin{{aligned}}{content}\\\\end{{aligned}}\\\\]" + tail

        inner_html = ""
        if node.text:
            inner_html += node.text

        for child in node:
            inner_html += render_node(child, parent_tag=tag)

        tail_html = clean_text(node.tail)

        # Map PreTeXt tags to responsive classes
        if tag in ('pretext', 'article', 'book'):
            return f"<article class='pretext-content p-6 max-w-4xl mx-auto bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 font-sans leading-relaxed'>{inner_html}</article>{tail_html}"
        elif tag == 'introduction':
            return f"<div class='introduction border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-6 italic text-zinc-550 dark:text-zinc-400'>{inner_html}</div>{tail_html}"
        elif tag == 'section':
            return f"<section class='section my-8'>{inner_html}</section>{tail_html}"
        elif tag == 'subsection':
            return f"<div class='subsection my-6'>{inner_html}</div>{tail_html}"
        elif tag == 'title':
            if parent_tag in ('pretext', 'article', 'book'):
                return f"<h1 class='text-2xl font-extrabold text-zinc-900 dark:text-white mt-2 mb-4 tracking-tight'>{inner_html}</h1>{tail_html}"
            elif parent_tag == 'section':
                return f"<h2 class='text-xl font-bold text-indigo-650 dark:text-indigo-400 mt-6 mb-3 border-b border-zinc-150 dark:border-zinc-800 pb-2'>{inner_html}</h2>{tail_html}"
            elif parent_tag == 'subsection':
                return f"<h3 class='text-md font-bold text-zinc-855 dark:text-zinc-200 mt-4 mb-2'>{inner_html}</h3>{tail_html}"
            else:
                return f"<h4 class='text-sm font-bold text-zinc-800 dark:text-zinc-350 mt-2 mb-1'>{inner_html}</h4>{tail_html}"
        elif tag == 'p':
            return f"<p class='my-3 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed'>{inner_html}</p>{tail_html}"
        elif tag == 'theorem':
            name_attr = node.get('name', '')
            name_span = f" <span class='italic text-zinc-500'>({name_attr})</span>" if name_attr else ""
            return f"<div class='theorem-box bg-indigo-50/40 dark:bg-indigo-950/10 border-l-4 border-indigo-500 p-4 my-4 rounded-r-xl'><h3 class='text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5'>Theorem{name_span}</h3>{inner_html}</div>{tail_html}"
        elif tag == 'proof':
            return f"<details class='proof-details border border-zinc-200 dark:border-zinc-800 rounded-xl my-4 bg-zinc-50/20 dark:bg-zinc-900/10'><summary class='font-bold text-xs text-indigo-650 dark:text-indigo-400 cursor-pointer p-3 select-none hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 rounded-t-xl'>Proof (click to expand)</summary><div class='p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 rounded-b-xl text-sm'>{inner_html}</div></details>{tail_html}"
        elif tag == 'ol':
            return f"<ol class='list-decimal list-inside pl-4 my-3 flex flex-col gap-1.5 text-sm'>{inner_html}</ol>{tail_html}"
        elif tag == 'ul':
            return f"<ul class='list-disc list-inside pl-4 my-3 flex flex-col gap-1.5 text-sm'>{inner_html}</ul>{tail_html}"
        elif tag == 'item':
            return f"<li class='text-zinc-650 dark:text-zinc-300'>{inner_html}</li>{tail_html}"
        elif tag == 'url':
            href = node.get('href', '')
            text = inner_html if inner_html else href
            return f"<a href='{href}' target='_blank' class='text-indigo-650 hover:underline dark:text-indigo-400 font-semibold'>{text}</a>{tail_html}"
        elif tag == 'xref':
            ref = node.get('ref', '')
            text = inner_html if inner_html else f"[{ref}]"
            return f"<a href='#{ref}' class='text-indigo-650 hover:underline dark:text-indigo-400 font-semibold'>{text}</a>{tail_html}"
        elif tag == 'image':
            source = node.get('source', '')
            return f"<img src='{source}' class='mx-auto my-4 max-w-full rounded-lg shadow-sm border border-zinc-150 dark:border-zinc-800' />{tail_html}"
        elif tag == 'figure':
            return f"<figure class='my-6 p-4 border border-zinc-150 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/5'>{inner_html}</figure>{tail_html}"
        elif tag == 'caption':
            return f"<figcaption class='text-xs text-center text-zinc-500 mt-2 font-medium'>{inner_html}</figcaption>{tail_html}"
        elif tag == 'c':
            return f"<code class='bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono text-pink-650 dark:text-pink-400'>{inner_html}</code>{tail_html}"
        elif tag in ('program', 'console'):
            return f"<pre class='bg-zinc-900 text-zinc-100 p-4 rounded-xl font-mono text-xs overflow-x-auto my-4 border border-zinc-800'>{inner_html}</pre>{tail_html}"
        elif tag == 'sidebyside':
            return f"<div class='flex flex-col md:flex-row gap-4 my-6'>{inner_html}</div>{tail_html}"
        elif tag in ('note', 'aside', 'warning'):
            border_color = 'border-amber-500' if tag == 'warning' else 'border-zinc-400'
            bg_color = 'bg-amber-50/40 dark:bg-amber-950/10' if tag == 'warning' else 'bg-zinc-50/40 dark:bg-zinc-800/10'
            title = tag.capitalize()
            return f"<div class='{bg_color} border-l-4 {border_color} p-4 my-4 rounded-r-xl'><h4 class='text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-350 mb-1'>{title}</h4>{inner_html}</div>{tail_html}"
        else:
            return f"{inner_html}{tail_html}"

    return render_node(root)
`;

/**
 * Compiles a PreTeXt XML string into modern interactive HTML layout client-side.
 * Runs inside browser Pyodide runtime.
 */
export const compilePretextXmlWasm = async (xmlContent: string): Promise<string> => {
  const pyodide = await loadPyodideRuntime();

  // Load parser helper function inside pyodide environment
  pyodide.runPython(pythonCompilerScript);

  // Safely pass content via globals
  pyodide.globals.set('xml_to_compile', xmlContent);
  
  let compiledBody = '';
  try {
    compiledBody = pyodide.runPython('pretext_to_html(xml_to_compile)');
  } catch (pyodideErr) {
    const rawMessage = pyodideErr instanceof Error ? pyodideErr.message : String(pyodideErr);
    let cleanMessage = rawMessage;
    const match = rawMessage.match(/(?:ParseError|Exception|ValueError):\s*(.+)/i);
    if (match && match[1]) {
      cleanMessage = match[1].trim();
    } else {
      const lines = rawMessage.trim().split('\n');
      if (lines.length > 0) {
        cleanMessage = lines[lines.length - 1];
      }
    }
    throw new Error(`XML Parse Error: ${cleanMessage}`);
  }

  // Wrap compiled body with Tailwind styles, KaTeX script tags, and dark-mode integration
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '\\\\[', right: '\\\\]', display: true}, {left: '\\\\(', right: '\\\\)', display: false}, {left: '$', right: '$', display: false}], ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'], ignoredClasses: ['no-math'] });"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
    }
    // Match dark mode class from parent window
    const checkTheme = () => {
      if (document.documentElement) {
        if (window.parent.document.documentElement.classList.contains('dark')) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    setInterval(checkTheme, 500);
    window.onload = checkTheme;
  </script>
  <style>
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
  </style>
</head>
<body class="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 transition-colors duration-200">
  ${compiledBody}
</body>
</html>`;
};
