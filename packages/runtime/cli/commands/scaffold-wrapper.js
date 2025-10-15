/**
 * ESM wrapper delegating to scaffold.js
 */

export async function executeScaffoldCommand(args) {
  const { executeScaffoldCommand: esmExecute } = await import('./scaffold.js');
  return esmExecute(args);
}

export async function listScaffoldTypes() {
  const { listScaffoldTypes: esmList } = await import('./scaffold.js');
  return esmList();
}

export async function showScaffoldExamples() {
  const { showScaffoldExamples: esmShow } = await import('./scaffold.js');
  return esmShow();
}
