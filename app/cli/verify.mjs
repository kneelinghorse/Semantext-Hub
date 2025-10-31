#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('verify', 'Use `sch protocol validate` until dedicated verification flows return (SCH-CLI-007).');
