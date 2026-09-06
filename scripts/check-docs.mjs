import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOCS = path.join(ROOT, 'docs');
const CATEGORIES = ['ADR', 'architecture', 'conventions', 'dependencies', 'investigations', 'proposals', 'test-reports'];
const LIFECYCLE_CATEGORIES = ['dependencies', 'investigations', 'proposals', 'test-reports'];

export function listMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(file);
    return entry.name.endsWith('.md') && !entry.name.endsWith('.local.md') ? [file] : [];
  });
}

// Ignore fenced examples: their sample URLs and front matter are not live references.
export function markdownLinks(source) {
  const links = [];
  let fence = null;
  let offset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    const boundary = line.match(/^\s*(`{3,}|~{3,})/);
    if (boundary) {
      if (fence === null) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length) fence = null;
    } else if (fence === null) {
      const pattern = /\[([^\]\n]*)\]\((<[^>\n]+>|[^\s)\n]+)(?:\s+["'][^\n]*?["'])?\)/g;
      for (const match of line.matchAll(pattern)) {
        links.push({ start: offset + match.index, end: offset + match.index + match[0].length, label: match[1], href: match[2].replace(/^<|>$/g, ''), text: match[0] });
      }
    }
    offset += line.length;
  }
  return links;
}

export function localTarget(file, href) {
  if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href)) return null;
  const location = decodeURIComponent(href.split(/[?#]/, 1)[0]);
  if (!location) return null;
  return location.startsWith('/') ? path.join(ROOT, location) : path.resolve(path.dirname(file), location);
}

// Document metadata intentionally uses flat keys, JSON-compatible values or quoted YAML scalars.
function readMetadata(source) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const pair = line.match(/^([a-z][a-z-]*):\s*(.+?)\s*$/);
    if (!pair || Object.hasOwn(fields, pair[1])) throw new Error('Invalid or duplicate flat metadata: ' + line);
    const value = pair[2];
    fields[pair[1]] = value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1).replaceAll("''", "'") : JSON.parse(value);
  }
  return fields;
}

export function checkDocs() {
  const errors = [];
  const files = listMarkdownFiles(DOCS);
  let linkCount = 0;
  let metadataCount = 0;
  for (const category of CATEGORIES) if (!existsSync(path.join(DOCS, category))) errors.push('Missing category: ' + category);
  for (const category of LIFECYCLE_CATEGORIES) {
    for (const state of ['active', 'completed']) {
      if (!existsSync(path.join(DOCS, category, state))) errors.push('Missing lifecycle directory: ' + category + '/' + state);
    }
  }
  for (const entry of readdirSync(DOCS, { withFileTypes: true })) {
    if (entry.isDirectory() && !CATEGORIES.includes(entry.name)) errors.push('Unexpected category: ' + entry.name);
  }
  for (const file of files) {
    const relative = path.relative(ROOT, file).replaceAll('\\', '/');
    const parts = relative.split('/');
    const source = readFileSync(file, 'utf8');
    const template = parts.at(-1) === 'template.md';
    if (template) continue;
    let metadata;
    try { metadata = readMetadata(source); } catch (error) { errors.push(relative + ': ' + error.message); continue; }
    if (LIFECYCLE_CATEGORIES.includes(parts[1]) && parts.at(-1) !== 'README.md') {
      metadataCount++;
      if (!metadata) { errors.push(relative + ': Missing lifecycle metadata'); continue; }
      const folder = parts[2];
      const expected = folder === 'active' ? (parts[1] === 'proposals' ? ['pending'] : ['active']) : ['completed', ...(parts[1] === 'proposals' ? ['closed'] : [])];
      if (!['active', 'completed'].includes(folder) || !expected.includes(metadata.status)) errors.push(relative + ': Status/location mismatch');
      if (folder === 'completed') {
        if (metadata.stage !== undefined && metadata.stage !== null) errors.push(relative + ': Completed document has an active stage');
        const date = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
        const completedAt = metadata.status === 'closed' ? metadata['closed-at'] : metadata['completed-at'];
        if ((!date || date !== completedAt) && !(metadata['legacy-record'] === true && completedAt === null)) errors.push(relative + ': Completion date/name mismatch');
      }
      if (parts[1] === 'proposals') {
        if (folder === 'active' && !['draft', 'awaiting-approval', 'approved', 'blocked'].includes(metadata.stage)) errors.push(relative + ': Invalid proposal stage');
        if (!['small', 'standard'].includes(metadata['proposal-size'])) errors.push(relative + ': Invalid proposal size');
        if (metadata.stage === 'approved' && ['approved-by', 'approved-at', 'approval-scope'].some(key => !metadata[key])) errors.push(relative + ': Missing approval metadata');
      }
      if (parts[1] === 'test-reports') {
        if (folder === 'completed' && !['pass', 'fail', 'blocked'].includes(metadata.result)) errors.push(relative + ': Missing completed result');
        if (folder === 'active' && (metadata.result !== null || !['planned', 'running', 'blocked', 'awaiting-rerun'].includes(metadata.stage))) errors.push(relative + ': Invalid active test-report metadata');
        for (const key of ['report-kind', 'report-size', 'test-levels', 'test-tools', 'created-at', 'completed-at', 'last-executed-at', 'tested-revision', 'owners', 'related', 'primary-area', 'observed-environments', 'test-summary', 'follow-up']) {
          if (!Object.hasOwn(metadata, key)) errors.push(relative + ': Missing ' + key);
        }
        if (!['audit', 'acceptance', 'regression', 'smoke', 'exploratory'].includes(metadata['report-kind'])) errors.push(relative + ': Invalid report kind');
        if (!['compact', 'standard'].includes(metadata['report-size'])) errors.push(relative + ': Invalid report size');
        const levels = metadata['test-levels'];
        if (!Array.isArray(levels) || levels.length === 0 || levels.some(level => !['static', 'component', 'integration', 'contract', 'end-to-end', 'manual'].includes(level))) errors.push(relative + ': Invalid test levels');
      }
    }
    for (const key of ['related', 'follow-up']) {
      if (metadata?.[key] !== undefined && (!Array.isArray(metadata[key]) || metadata[key].some(value => typeof value !== 'string'))) errors.push(relative + ': ' + key + ' must be a string array');
      for (const target of Array.isArray(metadata?.[key]) ? metadata[key] : []) {
        if (!/^https:\/\//.test(target) && (!target.startsWith('docs/') || !existsSync(path.join(ROOT, target)))) errors.push(relative + ': Missing metadata target: ' + target);
      }
    }
    for (const link of markdownLinks(source)) {
      let target;
      try { target = localTarget(file, link.href); } catch { errors.push(relative + ': Invalid URL encoding: ' + link.href); continue; }
      if (target !== null) {
        linkCount++;
        if (!existsSync(target)) errors.push(relative + ': Missing link: ' + link.href);
      }
    }
  }
  return { files: files.length, lifecycleDocuments: metadataCount, localLinks: linkCount, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDocs();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
