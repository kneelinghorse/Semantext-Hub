#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('a2a', 'Use `sch context status` and upcoming context sync utilities (see docs/operations/cli-backlog.md).');
