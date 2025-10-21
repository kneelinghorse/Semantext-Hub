import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import chalk from 'chalk';

export async function uiCommand(options = {}) {
  const port = Number(options.port || 3030);
  const baseDir = options.baseDir ? path.resolve(options.baseDir) : process.cwd();

  if (!fs.existsSync(baseDir)) {
    throw Object.assign(new Error(`Base directory does not exist: ${baseDir}`), { code: 'ENOENT' });
  }

  const serverPath = path.resolve(process.cwd(), 'app/ui/authoring/server.mjs');
  const exists = fs.existsSync(serverPath);
  if (!exists) {
    throw Object.assign(new Error(`Authoring UI server not found at ${serverPath}`), { code: 'ENOENT' });
  }

  const { startAuthoringServer } = await import(pathToFileURL(serverPath).href);

  const { server, app } = await startAuthoringServer({ port, baseDir });

  console.log(chalk.green(`\n✅ Authoring UI running at http://localhost:${port}`));
  console.log(chalk.gray(`   Base dir for $ref resolution: ${baseDir}`));

  // Keep process alive until SIGINT/SIGTERM
  const shutdown = () => {
    console.log(chalk.gray('\nShutting down Authoring UI...'));
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, server };
}

export default uiCommand;

