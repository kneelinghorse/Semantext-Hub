#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('security-verify', 'Use `sch protocol validate` for interim checks; dedicated security tooling will return post Sprint 02.');
