import fs from 'fs';
import path from 'path';
import type { DocUpdate } from './impact';
import { changeContext } from './delivery';
import { generateDocumentation, improveDocumentation } from './llm';

export async function applyDocUpdate(repoPath: string, update: DocUpdate, context = changeContext(repoPath)): Promise<void> {
  const filePath = path.resolve(repoPath, update.file);
  const relative = path.relative(repoPath, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Documentation path escapes repository: ${update.file}`);
  let ancestor = path.dirname(filePath);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const ancestorRelative = path.relative(fs.realpathSync(repoPath), fs.realpathSync(ancestor));
  if (ancestorRelative.startsWith('..') || path.isAbsolute(ancestorRelative)) throw new Error('Documentation parent escapes repository through a symlink');
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) throw new Error(`Documentation target is a symlink: ${update.file}`);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const result = update.action === 'improve' && content.trim()
    ? await improveDocumentation(content, update.file, context)
    : await generateDocumentation(context, update.file);
  if (!result?.trim()) throw new Error(`No documentation generated for ${update.file}; configure the LLM or update docs manually`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, result.trimEnd() + '\n');
}
