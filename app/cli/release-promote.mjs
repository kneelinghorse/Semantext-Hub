#!/usr/bin/env node

import { printLegacyCliWarning } from './_legacy-warning.mjs';

printLegacyCliWarning('release-promote', 'Release workflows will migrate to `sch context sync --mode promote` during Sprint 02.');
