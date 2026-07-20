export class EditorApiError extends Error {
  status: number;
  code?: string;
  advice?: string;
  details?: string;

  constructor(message: string, options: { status?: number; code?: string; advice?: string; details?: string } = {}) {
    super(message);
    this.name = 'EditorApiError';
    this.status = options.status ?? 500;
    this.code = options.code;
    this.advice = options.advice;
    this.details = options.details;
  }
}

const readJsonSafely = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const generateRandomHex = (length: number): string => {
  let result = '';
  const characters = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const generateTraceParent = (): string => {
  const traceId = generateRandomHex(32);
  const spanId = generateRandomHex(16);
  return `00-${traceId}-${spanId}-01`;
};

const MOCK_FILES_KEY = 'proofdesk_demo_files_v1';

const DEFAULT_MOCK_FILES: Record<string, string> = {
  'course.xml': `<course title="Interactive Linear Algebra Sandbox" subtitle="WebAssembly Compile Demo">
  <introduction>
    <p>Welcome to Proofdesk! This workspace runs entirely client-side in your browser using Pyodide (Python compiled to WebAssembly).</p>
  </introduction>

  <section title="Vectors &amp; Dot Products">
    <title>Vectors &amp; Dot Products</title>
    <p>
      In linear algebra, a vector is represented as a column matrix. For example, a 3D vector <m>v</m> is:
    </p>
    <me>v = \\begin{bmatrix} x \\\\ y \\\\ z \\end{bmatrix}</me>
    <p>
      We can compute the dot product of two vectors <m>u</m> and <m>v</m> in <m>\\mathbb{R}^3</m> by multiplying corresponding components:
    </p>
    <me>u \\cdot v = u_1 v_1 + u_2 v_2 + u_3 v_3</me>
  </section>

  <section title="Orthogonality">
    <title>Orthogonality</title>
    <theorem name="Orthogonality Theorem">
      <statement>
        <p>Two non-zero vectors <m>u</m> and <m>v</m> are orthogonal if and only if their dot product is zero:</p>
        <me>u \\cdot v = 0</me>
      </statement>
    </theorem>
    <proof>
      <p>The cosine of the angle <m>\\theta</m> between vectors <m>u</m> and <m>v</m> is given by:</p>
      <me>\\cos(\\theta) = \\frac{u \\cdot v}{\\|u\\| \\|v\\|}</me>
      <p>If the vectors are orthogonal, then <m>\\theta = 90^\\circ</m>, meaning <m>\\cos(\\theta) = 0</m>. This implies <m>u \\cdot v = 0</m>.</p>
    </proof>
  </section>
</course>`,
  'styles.css': `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2937;
}`,
  'interactive.js': `console.log("Proofdesk WebAssembly workspace is interactive!");`,
  'README.md': `# 📐 Proofdesk WebAssembly Playground

This is the **Standalone Offline Demo Mode** of Proofdesk. 
The workspace is running entirely inside your web browser. 

### ⚡ Key Capabilities in this Demo:
1. **Client-Side Monaco Editor**: Full syntax validation and editing.
2. **WebAssembly Compilation**: Proofdesk compiles PreTeXt XML structures to interactive HTML using **Pyodide** directly in your browser tab (no backend servers required).
3. **Live Math Previews**: Real-time rendering of mathematical formulas, equations, theorems, and expandible proofs via KaTeX.

### 📝 Try it now:
1. Click on \`course.xml\` in the explorer sidebar.
2. Edit some mathematical equations (e.g., change the vectors or write some text).
3. Watch the preview reload dynamically using WebAssembly!

*Note: Server-dependent features like Git Push and collaborative team session sharing are disabled in the standalone client demo.*`
};

const getDemoFiles = (): Record<string, string> => {
  try {
    const stored = localStorage.getItem(MOCK_FILES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return DEFAULT_MOCK_FILES;
};

const saveDemoFiles = (files: Record<string, string>) => {
  try {
    localStorage.setItem(MOCK_FILES_KEY, JSON.stringify(files));
  } catch {
    /* ignore */
  }
};

const MOCK_TREE = [
  { name: 'course.xml', path: 'course.xml', type: 'file' as const, size: 1200 },
  { name: 'styles.css', path: 'styles.css', type: 'file' as const, size: 100 },
  { name: 'interactive.js', path: 'interactive.js', type: 'file' as const, size: 100 },
  { name: 'README.md', path: 'README.md', type: 'file' as const, size: 800 }
];

export const requestJson = async <T>(input: RequestInfo | URL, init: RequestInit = {}, fallbackMessage = 'Request failed') => {
  const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url || String(input));
  
  if (sessionStorage.getItem('standaloneDemo') === 'true') {
    let pathname = urlString;
    try {
      if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
        pathname = new URL(urlString).pathname;
      } else if (urlString.startsWith('/')) {
        pathname = urlString.split('?')[0];
      }
    } catch {
      /* ignore */
    }
    
    // Simulate short network delay for realism (100ms)
    await new Promise(resolve => setTimeout(resolve, 100));

    if (pathname.endsWith('/auth/session')) {
      return { ok: true } as unknown as T;
    }
    if (pathname.endsWith('/user')) {
      return {
        login: 'demo-user',
        name: 'Playground Guest',
        avatar_url: 'https://avatars.githubusercontent.com/u/10137?v=4'
      } as unknown as T;
    }
    if (pathname.endsWith('/repos')) {
      return [] as unknown as T;
    }
    if (pathname.endsWith('/workspace/init')) {
      return {
        sessionId: 'demo-session-id',
        tree: MOCK_TREE,
        repoFullName: 'demo/pretext-sandbox',
        fromCache: true
      } as unknown as T;
    }
    if (pathname.includes('/tree')) {
      return MOCK_TREE as unknown as T;
    }
    if (pathname.includes('/contents/')) {
      const parts = pathname.split('/contents/');
      const filePath = decodeURIComponent(parts[parts.length - 1]);
      const files = getDemoFiles();
      return {
        decoded_content: files[filePath] || '',
        sha: 'demo-sha-' + filePath
      } as unknown as T;
    }
    if (pathname.endsWith('/build/update')) {
      let body: { filePath?: string; content?: string } = {};
      try {
        if (typeof init.body === 'string') {
          body = JSON.parse(init.body);
        }
      } catch {
        /* ignore */
      }
      if (body.filePath && body.content !== undefined) {
        const files = getDemoFiles();
        files[body.filePath] = body.content;
        saveDemoFiles(files);
      }
      return {
        success: true,
        sessionId: 'demo-session-id'
      } as unknown as T;
    }
    if (pathname.endsWith('/build/init')) {
      return {
        success: true,
        sessionId: 'demo-session-id'
      } as unknown as T;
    }
    if (pathname.includes('/build/pdf/')) {
      return {
        success: true,
        sessionId: 'demo-session-id'
      } as unknown as T;
    }
    if (pathname.includes('/build/pdf-status/')) {
      return {
        status: 'completed'
      } as unknown as T;
    }
    if (pathname.includes('/git/status')) {
      return {
        currentBranch: 'main',
        branches: ['main'],
        files: []
      } as unknown as T;
    }
    if (pathname.includes('/git/diff')) {
      return {
        filePath: 'course.xml',
        staged: '',
        unstaged: ''
      } as unknown as T;
    }
    if (pathname.includes('/review-markers')) {
      return {} as unknown as T;
    }
    if (pathname.includes('/build/preview-history/')) {
      return { snapshots: [] } as unknown as T;
    }
    if (pathname.endsWith('/import/config')) {
      return {} as unknown as T;
    }
    if (pathname.endsWith('/auth/logout')) {
      sessionStorage.removeItem('standaloneDemo');
      return {} as unknown as T;
    }
  }

  const headersInit = init.headers || {};
  let traceparentExists = false;

  if (headersInit instanceof Headers) {
    traceparentExists = headersInit.has('traceparent');
  } else if (Array.isArray(headersInit)) {
    traceparentExists = headersInit.some(([k]) => k.toLowerCase() === 'traceparent');
  } else {
    traceparentExists = Object.keys(headersInit).some(k => k.toLowerCase() === 'traceparent');
  }

  let finalHeaders: HeadersInit = headersInit;
  if (!traceparentExists) {
    const traceparent = generateTraceParent();
    if (headersInit instanceof Headers) {
      finalHeaders = new Headers(headersInit);
      (finalHeaders as Headers).set('traceparent', traceparent);
    } else if (Array.isArray(headersInit)) {
      finalHeaders = [...headersInit, ['traceparent', traceparent]];
    } else {
      finalHeaders = {
        ...headersInit,
        'traceparent': traceparent,
      };
    }
  }

  const response = await fetch(input, {
    ...init,
    headers: finalHeaders,
  });
  const data = await readJsonSafely(response);

  if (!response.ok) {
    const message = data?.error || data?.message || fallbackMessage;
    throw new EditorApiError(message, {
      status: response.status,
      code: data?.code,
      advice: data?.advice,
      details: data?.details,
    });
  }

  return (data ?? {}) as T;
};

export const isAuthExpiredError = (error: unknown) =>
  error instanceof EditorApiError && error.status === 401;

export const formatEditorError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof EditorApiError) {
    return {
      title: error.message || fallbackMessage,
      advice: error.advice || '',
      details: error.details || '',
    };
  }

  if (error instanceof Error) {
    return {
      title: error.message || fallbackMessage,
      advice: '',
      details: '',
    };
  }

  return {
    title: fallbackMessage,
    advice: '',
    details: '',
  };
};
