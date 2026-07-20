import axios from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger.js';

interface MathPixPdfResponse {
  pdf_id: string;
  status?: string;
  error?: string;
}

interface MathPixStatusResponse {
  status: string;
  percent_done?: number;
  error?: string;
}

/**
 * Checks if MathPix credentials are set in the environment
 */
export const isMathPixConfigured = (): boolean => {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  return typeof appId === 'string' && appId.trim().length > 0 &&
         typeof appKey === 'string' && appKey.trim().length > 0;
};

/**
 * Replace LaTeX math delimiters with PreTeXt equivalents:
 * - \[ equation \] -> <me>equation</me>
 * - $$ equation $$ -> <me>equation</me>
 * - \( equation \) -> <m>equation</m>
 * - $ equation $ -> <m>equation</m>
 */
export const replaceMathDelimiters = (text: string): string => {
  let result = text;
  
  // 1. Display equations \[ ... \]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => {
    return `<me>${eq.trim()}</me>`;
  });

  // 2. Display equations $$ ... $$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => {
    return `<me>${eq.trim()}</me>`;
  });

  // 3. Inline equations \( ... \)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => {
    return `<m>${eq.trim()}</m>`;
  });

  // 4. Inline equations $ ... $ (avoiding $$)
  result = result.replace(/(?<!\$)\$([^$]+)\$(?!\$)/g, (_, eq) => {
    return `<m>${eq.trim()}</m>`;
  });

  return result;
};

/**
 * Simple stack-based parser to translate Markdown (with math) to nested PreTeXt tags
 */
export const parseMarkdownToPretext = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  const tagStack: string[] = [];
  
  let inParagraph = false;
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const closeParagraph = () => {
    if (inParagraph) {
      output.push('</p>');
      inParagraph = false;
    }
  };

  const closeList = () => {
    if (inList) {
      closeParagraph();
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const closeHeaderTags = (targetLevel: number) => {
    // Header level 1 (h1) -> level 1 index in stack, etc.
    // Close any tags in stack that are deeper or equal to targetLevel
    while (tagStack.length > 0 && tagStack.length >= targetLevel) {
      closeParagraph();
      closeList();
      const tag = tagStack.pop();
      output.push(`</${tag}>`);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // 1. Code block handling
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        output.push('<program><input>');
        output.push(codeBlockLines.join('\n'));
        output.push('</input></program>');
        codeBlockLines = [];
      } else {
        // Start of code block
        closeParagraph();
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // 2. Empty line handling
    if (line === '') {
      closeParagraph();
      // Keep lists open, but close item paragraphs
      continue;
    }

    // 3. Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();

      const level = headingMatch[1].length;
      const titleText = replaceMathDelimiters(headingMatch[2]);
      
      let tagName = 'section';
      if (level === 1) tagName = 'chapter';
      else if (level === 2) tagName = 'section';
      else tagName = 'subsection';

      closeHeaderTags(level);
      
      output.push(`<${tagName} xml:id="imported-${tagName}-${Math.random().toString(36).slice(2, 7)}">`);
      output.push(`  <title>${titleText}</title>`);
      tagStack.push(tagName);
      continue;
    }

    // 4. List items
    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    
    if (unorderedMatch || orderedMatch) {
      closeParagraph();
      const itemText = replaceMathDelimiters(unorderedMatch ? unorderedMatch[1] : orderedMatch![1]);
      const expectedListType = unorderedMatch ? 'ul' : 'ol';

      if (!inList || listType !== expectedListType) {
        closeList();
        inList = true;
        listType = expectedListType;
        output.push(`<${listType}>`);
      }

      output.push(`  <item><p>${itemText}</p></item>`);
      continue;
    }

    // 5. Standard paragraph / Text block
    if (inList) {
      // If we are in a list but the line doesn't start with a bullet, it might be a nested paragraph
      // We'll close the list for simplicity and start a regular paragraph
      closeList();
    }

    if (!inParagraph) {
      inParagraph = true;
      output.push('<p>');
    } else {
      // Add a line break for multi-line paragraphs in the output
      output.push(' ');
    }

    output.push(replaceMathDelimiters(line));
  }

  // Close any outstanding elements
  closeParagraph();
  closeList();
  closeHeaderTags(1); // Close all nested sections/chapters

  return output.join('\n');
};

/**
 * Returns mock converted output for testing when MathPix keys are missing
 */
export const getMockPretextContent = (fileName: string): string => {
  return `<!-- MOCK IMPORT RESULTS FOR ${fileName.toUpperCase()} -->
<chapter xml:id="imported-chapter-eigenvalues">
  <title>Eigenvalues and Eigenvectors</title>
  
  <p>
    Let <m>A</m> be an <m>n \\times n</m> matrix. A scalar <m>\\lambda</m> is called an <term>eigenvalue</term> of <m>A</m> if there is a non-zero vector <m>x</m> such that:
  </p>
  
  <me>Ax = \\lambda x</me>
  
  <p>
    The vector <m>x</m> is called an <term>eigenvector</term> corresponding to the eigenvalue <m>\\lambda</m>. Note that eigenvectors must be non-zero by definition, whereas eigenvalues can be zero.
  </p>
  
  <section xml:id="imported-section-characteristic-eq">
    <title>The Characteristic Equation</title>
    
    <p>
      To find eigenvalues of a matrix, we solve the characteristic equation. We can rewrite the eigenvalue equation as:
    </p>
    
    <me>(A - \\lambda I)x = 0</me>
    
    <p>
      Since <m>x \\neq 0</m>, the matrix <m>A - \\lambda I</m> must be non-invertible, which means its determinant must be zero. This gives us the characteristic equation:
    </p>
    
    <me>\\det(A - \\lambda I) = 0</me>
    
    <p>
      Let's look at the eigenvalues of this 2x2 matrix:
    </p>
    
    <program><input>
A = [[4, 2],
     [1, 3]]
    </input></program>
    
    <p>
      Here are the steps to find eigenvalues and eigenvectors:
    </p>
    
    <ul>
      <item><p>Subtract <m>\\lambda</m> from diagonal elements: <m>A - \\lambda I</m></p></item>
      <item><p>Compute the determinant: det<m>(A - \\lambda I)</m></p></item>
      <item><p>Solve the quadratic polynomial for <m>\\lambda</m></p></item>
      <item><p>Find eigenvectors by computing the nullspace of <m>A - \\lambda I</m></p></item>
    </ul>
  </section>
</chapter>`;
};

/**
 * Poll MathPix API until the PDF conversion task is finished
 */
const pollMathPixStatus = async (pdfId: string, appId: string, appKey: string): Promise<void> => {
  const maxAttempts = 60; // 2 minutes max polling
  const delayMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    logger.info(`Polling MathPix conversion status for PDF: ${pdfId} (attempt ${i + 1})`);
    
    const response = await axios.get<MathPixStatusResponse>(
      `https://api.mathpix.com/v3/pdf/${pdfId}`,
      {
        headers: {
          app_id: appId,
          app_key: appKey,
        },
      }
    );

    if (response.data.status === 'completed') {
      logger.info(`MathPix PDF conversion completed for ID: ${pdfId}`);
      return;
    }

    if (response.data.status === 'fail' || response.data.error) {
      throw new Error(`MathPix conversion failed: ${response.data.error || 'unknown error'}`);
    }
  }

  throw new Error('MathPix PDF conversion timed out after 2 minutes.');
};

/**
 * Main Service API for PDF Import
 */
export const importPdf = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
  if (!isMathPixConfigured()) {
    logger.warn('MathPix credentials not configured. Returning mock PreTeXt XML.');
    // Simulate a tiny delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    return getMockPretextContent(fileName);
  }

  const appId = process.env.MATHPIX_APP_ID!;
  const appKey = process.env.MATHPIX_APP_KEY!;

  logger.info(`Uploading PDF file: ${fileName} to MathPix API`);
  
  const form = new FormData();
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: 'application/pdf',
  });
  form.append('options_json', JSON.stringify({
    conversion_formats: ['md'],
  }));

  try {
    const response = await axios.post<MathPixPdfResponse>(
      'https://api.mathpix.com/v3/pdf',
      form,
      {
        headers: {
          ...form.getHeaders(),
          app_id: appId,
          app_key: appKey,
        },
      }
    );

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    const pdfId = response.data.pdf_id;
    logger.info(`MathPix PDF uploaded successfully. Task ID: ${pdfId}`);

    // Wait for the MathPix conversion to complete
    await pollMathPixStatus(pdfId, appId, appKey);

    // Fetch the translated markdown
    logger.info(`Fetching markdown results for PDF ID: ${pdfId}`);
    const markdownResponse = await axios.get<string>(
      `https://api.mathpix.com/v3/pdf/${pdfId}.md`,
      {
        headers: {
          app_id: appId,
          app_key: appKey,
        },
      }
    );

    const markdown = markdownResponse.data;
    logger.info(`Converting MathPix markdown to PreTeXt XML`);
    return parseMarkdownToPretext(markdown);

  } catch (error: any) {
    logger.error('MathPix API conversion failed:', error.message);
    throw new Error(`MathPix OCR failed: ${error.response?.data?.error || error.message}`);
  }
};

/**
 * Main Service API for Raw Markdown/LaTeX Input Conversion
 */
export const importText = (content: string): string => {
  return parseMarkdownToPretext(content);
};
