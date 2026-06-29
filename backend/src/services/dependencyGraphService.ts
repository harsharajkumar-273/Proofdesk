import fs from 'fs/promises';
import path from 'path';
import { getWorkspaceSession } from './workspaceService.js';
import logger from '../utils/logger.js';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  file: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Recursively find all XML/PTX files in a directory
 */
const walkXmlFiles = async (dir: string, results: string[] = []): Promise<string[]> => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    logger.warn(`Failed to read directory for graph walker: ${dir}`, err);
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden files/.git
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await walkXmlFiles(fullPath, results);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.xml' || ext === '.ptx') {
        results.push(fullPath);
      }
    }
  }

  return results;
};

/**
 * Builds a node-link dependency graph for a workspace session
 */
export const buildDependencyGraph = async (sessionId: string): Promise<GraphData> => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  
  logger.info(`Building dependency graph for session ${sessionId} in ${repoPath}`);

  const files = await walkXmlFiles(repoPath);
  
  const nodes: GraphNode[] = [];
  const rawLinks: GraphLink[] = [];
  
  // Maps all IDs to their parent section/chapter ID (childId -> parentStructuralId)
  const idToParentMap = new Map<string, string>();
  
  // Set of all structural node IDs (chapters/sections/subsections/appendices)
  const structuralNodeIds = new Set<string>();

  const STRUCTURAL_TAGS = ['chapter', 'section', 'subsection', 'exercises', 'appendix'];

  for (const file of files) {
    const relativePath = path.relative(repoPath, file);
    let content = '';
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    const containerStack: string[] = []; // Stack of open structural node IDs
    let lastActiveStructuralId: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 1. Check for element tag definitions containing xml:id or id
      const idMatch = line.match(/<([a-zA-Z0-9_-]+)[^>]*(?:xml:id|id)="([^"]+)"/);
      if (idMatch) {
        const tagName = idMatch[1].toLowerCase();
        const id = idMatch[2];

        const isStructural = STRUCTURAL_TAGS.includes(tagName);

        if (isStructural) {
          // Push to structural container stack
          containerStack.push(id);
          lastActiveStructuralId = id;
          structuralNodeIds.add(id);

          nodes.push({
            id,
            label: id, // fallback until we find <title>
            type: tagName,
            file: relativePath,
          });
        } else if (lastActiveStructuralId) {
          // Map sub-elements (like theorem, definition, equation) to their containing section/chapter
          idToParentMap.set(id, lastActiveStructuralId);
        }
      }

      // 2. Check for closing tags of structural elements to pop stack
      const closeMatch = line.match(/<\/([a-zA-Z0-9_-]+)>/);
      if (closeMatch) {
        const closedTag = closeMatch[1].toLowerCase();
        if (STRUCTURAL_TAGS.includes(closedTag)) {
          containerStack.pop();
          lastActiveStructuralId = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
        }
      }

      // 3. Match <title> to label the most active container
      const titleMatch = line.match(/<title>([^<]+)<\/title>/);
      if (titleMatch && lastActiveStructuralId) {
        const activeNode = nodes.find(n => n.id === lastActiveStructuralId);
        if (activeNode && activeNode.label === activeNode.id) {
          activeNode.label = titleMatch[1].trim();
        }
      }

      // 4. Match cross-references <xref ref="..."/>
      const xrefMatches = line.match(/<xref\s+[^>]*ref="([^"]+)"/g);
      if (xrefMatches && lastActiveStructuralId) {
        for (const xr of xrefMatches) {
          const refMatch = xr.match(/ref="([^"]+)"/);
          if (refMatch) {
            const targetRef = refMatch[1];
            rawLinks.push({
              source: lastActiveStructuralId,
              target: targetRef,
            });
          }
        }
      }
    }
  }

  // 5. Clean up and resolve links
  const links: GraphLink[] = [];
  const seenLinks = new Set<string>();

  for (const link of rawLinks) {
    let resolvedTarget = link.target;

    // If target is not direct structural node, resolve it to its parent section/chapter
    if (!structuralNodeIds.has(resolvedTarget)) {
      const parentId = idToParentMap.get(resolvedTarget);
      if (parentId) {
        resolvedTarget = parentId;
      } else {
        // Target is unresolved, skip it
        continue;
      }
    }

    // Avoid self-references and duplicates
    if (link.source === resolvedTarget) continue;

    const linkKey = `${link.source}->${resolvedTarget}`;
    if (!seenLinks.has(linkKey)) {
      seenLinks.add(linkKey);
      links.push({
        source: link.source,
        target: resolvedTarget,
      });
    }
  }

  logger.info(`Compiled dependency graph for session ${sessionId}: ${nodes.length} nodes, ${links.length} links`);

  return { nodes, links };
};
