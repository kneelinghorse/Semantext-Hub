export function printLegacyCliWarning(commandName, recommendation = '') {
  const label = commandName ? `"${commandName}"` : 'This command';
  console.warn(`[deprecated] ${label} has been replaced by the unified SCH CLI.`);
  if (recommendation) {
    console.warn(`Next steps: ${recommendation}`);
  } else {
    console.warn('Refer to docs/operations/cli.md for current command mappings.');
  }
  console.warn('This legacy entry point will be removed after Sprint 02.');
  process.exitCode = 1;
}
