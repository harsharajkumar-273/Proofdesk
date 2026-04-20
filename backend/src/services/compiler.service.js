import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export class CompilerService {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'mra-compiler');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async compileCode(filename, content, language) {
    const ext = path.extname(filename).toLowerCase();
    
    switch (language || ext) {
      case 'python':
      case '.py':
        return this.compilePython(filename, content);
      
      case 'javascript':
      case '.js':
        return this.compileJavaScript(filename, content);
      
      case 'java':
      case '.java':
        return this.compileJava(filename, content);
      
      case 'cpp':
      case '.cpp':
        return this.compileCpp(filename, content);
      
      case 'html':
      case '.html':
        return this.compileHtml(content);
      
      case 'css':
      case '.css':
        return this.compileCss(content);
      
      default:
        return {
          success: true,
          output: content,
          preview: `<pre>${this.escapeHtml(content)}</pre>`
        };
    }
  }

  async compilePython(filename, content) {
    try {
      const filePath = path.join(this.tempDir, filename);
      await fs.writeFile(filePath, content);
      
      const { stdout, stderr } = await execAsync(`python3 ${filePath}`, {
        timeout: 5000
      });
      
      await fs.unlink(filePath);
      
      return {
        success: !stderr,
        output: stdout || stderr,
        preview: `<pre>${this.escapeHtml(stdout || stderr)}</pre>`,
        language: 'python'
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        preview: `<pre class="error">${this.escapeHtml(error.message)}</pre>`
      };
    }
  }

  async compileJavaScript(filename, content) {
    try {
      // Create a safe execution environment
      const wrappedCode = `
        try {
          const console = {
            log: (...args) => process.stdout.write(args.join(' ') + '\\n'),
            error: (...args) => process.stderr.write(args.join(' ') + '\\n')
          };
          ${content}
        } catch (error) {
          process.stderr.write(error.toString());
        }
      `;
      
      const filePath = path.join(this.tempDir, filename);
      await fs.writeFile(filePath, wrappedCode);
      
      const { stdout, stderr } = await execAsync(`node ${filePath}`, {
        timeout: 5000
      });
      
      await fs.unlink(filePath);
      
      return {
        success: !stderr,
        output: stdout || stderr,
        preview: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>JavaScript Output</title>
            <style>
              body { font-family: monospace; padding: 20px; }
              .output { background: #f5f5f5; padding: 10px; border-radius: 5px; }
              .error { color: red; }
            </style>
          </head>
          <body>
            <div class="output ${stderr ? 'error' : ''}">
              <pre>${this.escapeHtml(stdout || stderr)}</pre>
            </div>
            <script>${content}</script>
          </body>
          </html>
        `,
        language: 'javascript'
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        preview: `<pre class="error">${this.escapeHtml(error.message)}</pre>`
      };
    }
  }

  async compileJava(filename, content) {
    try {
      const className = filename.replace('.java', '');
      const filePath = path.join(this.tempDir, filename);
      
      await fs.writeFile(filePath, content);
      
      // Compile
      const { stderr: compileError } = await execAsync(
        `javac ${filePath}`,
        { timeout: 10000 }
      );
      
      if (compileError) {
        return {
          success: false,
          output: compileError,
          preview: `<pre class="error">${this.escapeHtml(compileError)}</pre>`
        };
      }
      
      // Run
      const { stdout, stderr } = await execAsync(
        `java -cp ${this.tempDir} ${className}`,
        { timeout: 5000 }
      );
      
      // Cleanup
      await fs.unlink(filePath);
      await fs.unlink(path.join(this.tempDir, `${className}.class`));
      
      return {
        success: true,
        output: stdout,
        preview: `<pre>${this.escapeHtml(stdout)}</pre>`,
        language: 'java'
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        preview: `<pre class="error">${this.escapeHtml(error.message)}</pre>`
      };
    }
  }

  async compileCpp(filename, content) {
    try {
      const filePath = path.join(this.tempDir, filename);
      const outputPath = path.join(this.tempDir, 'a.out');
      
      await fs.writeFile(filePath, content);
      
      // Compile
      const { stderr: compileError } = await execAsync(
        `g++ ${filePath} -o ${outputPath}`,
        { timeout: 10000 }
      );
      
      if (compileError) {
        return {
          success: false,
          output: compileError,
          preview: `<pre class="error">${this.escapeHtml(compileError)}</pre>`
        };
      }
      
      // Run
      const { stdout, stderr } = await execAsync(outputPath, {
        timeout: 5000
      });
      
      // Cleanup
      await fs.unlink(filePath);
      await fs.unlink(outputPath);
      
      return {
        success: true,
        output: stdout,
        preview: `<pre>${this.escapeHtml(stdout)}</pre>`,
        language: 'cpp'
      };
    } catch (error) {
      return {
        success: false,
        output: error.message,
        preview: `<pre class="error">${this.escapeHtml(error.message)}</pre>`
      };
    }
  }

  compileHtml(content) {
    return {
      success: true,
      output: content,
      preview: content,
      language: 'html'
    };
  }

  compileCss(content) {
    return {
      success: true,
      output: content,
      preview: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CSS Preview</title>
          <style>${content}</style>
        </head>
        <body>
          <h1>CSS Preview</h1>
          <p>Your styles have been applied!</p>
          <div class="test">Test element with class="test"</div>
          <div id="demo">Test element with id="demo"</div>
          <button>Button</button>
          <input type="text" placeholder="Input field">
        </body>
        </html>
      `,
      language: 'css'
    };
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

export default new CompilerService();