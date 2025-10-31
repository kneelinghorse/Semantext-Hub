#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('release-canary', 'Planned replacement: `sch context sync --mode canary` (see docs/operations/cli-backlog.md).');
