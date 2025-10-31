#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('release-preflight', 'Planned replacement: `sch retrieval qa --dataset preflight` (see docs/operations/cli-backlog.md).');
