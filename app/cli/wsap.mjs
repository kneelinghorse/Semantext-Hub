#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('wsap', 'Workspace agent preflight moves to `sch context sync --mode wsap` after backlog item SCH-CLI-008 completes.');
