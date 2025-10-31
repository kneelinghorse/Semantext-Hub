#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('release-rollback', 'Rollback automation will surface under `sch context purge` once safeguards land.');
