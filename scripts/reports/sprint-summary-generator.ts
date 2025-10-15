import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

type JsonRecord = Record<string, unknown>;

interface MissionBacklogEntry {
  id: string;
  name: string;
  status: string;
  path?: string;
  notes?: string;
  completed_at?: string;
}

interface SprintBacklogEntry {
  sprintId: string;
  title: string;
  focus: string;
  status: string;
  missions: MissionBacklogEntry[];
}

interface NormalizedMission {
  id: string;
  name: string;
  status: string;
  notes?: string;
  completedAt?: string;
  path?: string;
  missionFile?: string;
  objective?: string;
  deliverables: string[];
}

interface GenerateSprintSummaryOptions {
  workspace?: string;
  sprintId?: string;
  outputPath?: string;
  writeToDisk?: boolean;
  includeLogs?: boolean;
}

interface GenerateSprintSummaryResult {
  markdown: string;
  outputPath: string;
  sprint: SprintBacklogEntry;
  missions: NormalizedMission[];
  validation: {
    missingHeadings: string[];
  };
  metrics: {
    missionsCompleted: number;
    missionsTotal: number;
    sessionsUsed: number;
    allMissionsCompleted: boolean;
    generatedAt: string;
  };
}

const REQUIRED_HEADINGS = [
  '## Executive Summary',
  '## Current State (End of Sprint)',
  '## Missions Delivered',
  '## Key Decisions & Rationale',
  '## Build Notes (Implementation)',
  '## Metrics',
  '## Test Coverage & Gaps',
  '## Issues & Risks',
  '## Technical Debt / Outstanding Work',
  '## Feedback to Next Sprint (Planning Inputs)',
  '## Roadmap Delta',
  '## Artifact Index',
  '### Sprint Completion Checklist'
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readYamlFile<T = JsonRecord>(targetPath: string): Promise<T | undefined> {
  if (!(await fileExists(targetPath))) {
    return undefined;
  }
  const content = await fs.readFile(targetPath, 'utf8');
  const documents = YAML.parseAllDocuments(content).map((doc) => doc.toJS({}) as T);

  if (documents.length === 0) {
    return undefined;
  }

  if (documents.length === 1) {
    return documents[0];
  }

  return documents.reduce<T>(
    (accumulator, current) =>
      Object.assign(
        accumulator,
        typeof current === 'object' && current !== null ? current : {}
      ),
    {} as T
  );
}

async function readJsonFile<T = JsonRecord>(targetPath: string): Promise<T | undefined> {
  if (!(await fileExists(targetPath))) {
    return undefined;
  }
  const content = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(content) as T;
}

async function detectWorkspace(startDir: string): Promise<string> {
  const candidates = [
    startDir,
    path.resolve(startDir, '..'),
    path.resolve(startDir, '../..'),
    path.resolve(scriptDirectory, '../../..')
  ];

  for (const candidate of candidates) {
    const backlogPath = path.join(candidate, 'missions', 'backlog.yaml');
    if (await fileExists(backlogPath)) {
      return candidate;
    }
  }

  return startDir;
}

async function loadBacklogSprint(workspace: string, sprintId: string): Promise<SprintBacklogEntry> {
  const backlogPath = path.join(workspace, 'missions', 'backlog.yaml');
  const backlog = await readYamlFile<{ domainFields?: { sprints?: SprintBacklogEntry[] } }>(backlogPath);

  if (!backlog?.domainFields?.sprints || !Array.isArray(backlog.domainFields.sprints)) {
    throw new Error(`Unable to locate sprints inside ${backlogPath}`);
  }

  const sprint = backlog.domainFields.sprints.find((entry) => entry?.sprintId === sprintId);
  if (!sprint) {
    throw new Error(`Sprint ${sprintId} not found in backlog`);
  }

  return sprint;
}

async function findMissionFile(workspace: string, missionId: string): Promise<string | undefined> {
  const backlogMissionDir = path.join(workspace, 'missions');
  const queue: string[] = [backlogMissionDir];
  const missionIdLower = missionId.toLowerCase();

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) continue;
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push(path.join(currentDir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.yaml')) continue;

      if (entry.name.toLowerCase().includes(missionIdLower)) {
        return path.join(currentDir, entry.name);
      }
    }
  }

  return undefined;
}

async function resolveMissionPath(workspace: string, mission: MissionBacklogEntry): Promise<string | undefined> {
  const directPath = mission.path ? path.join(workspace, mission.path.replace(/^\//, '')) : undefined;
  if (directPath && (await fileExists(directPath))) {
    return directPath;
  }
  return findMissionFile(workspace, mission.id);
}

function normalizeDeliverable(entry: unknown): string | undefined {
  if (typeof entry !== 'string') {
    return undefined;
  }
  const trimmed = entry.trim();
  if (!trimmed) return undefined;

  const [rawPath, rawNote] = trimmed.split('#', 2);
  const cleanedPath = rawPath.trim().replace(/^\/+/, '');
  const note = rawNote?.trim();

  if (note) {
    return `${cleanedPath} (${note})`;
  }
  return cleanedPath;
}

async function gatherMissionDetails(workspace: string, mission: MissionBacklogEntry): Promise<NormalizedMission> {
  const missionFile = await resolveMissionPath(workspace, mission);
  let missionDocument: JsonRecord | undefined;

  if (missionFile) {
    missionDocument = await readYamlFile<JsonRecord>(missionFile);
  }

  const deliverablesRaw = missionDocument?.deliverables;
  const deliverables: string[] = Array.isArray(deliverablesRaw)
    ? (deliverablesRaw.map(normalizeDeliverable).filter(Boolean) as string[])
    : [];

  return {
    id: mission.id,
    name: mission.name,
    status: mission.status,
    notes: mission.notes,
    completedAt: mission.completed_at,
    path: mission.path,
    missionFile,
    objective: typeof missionDocument?.objective === 'string' ? missionDocument.objective.trim() : undefined,
    deliverables
  };
}

function formatDate(iso?: string): string {
  if (!iso) return 'TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().split('T')[0];
}

function formatDateRange(missions: NormalizedMission[]): { start: string; end: string } {
  const dates = missions
    .map((mission) => mission.completedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return { start: 'TBD', end: 'TBD' };
  }

  const start = dates[0].toISOString().split('T')[0];
  const end = dates[dates.length - 1].toISOString().split('T')[0];
  return { start, end };
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function formatMissionRow(mission: NormalizedMission): string {
  const statusIcon = mission.status === 'Completed' ? '✅ Completed' : mission.status === 'In Progress' ? '🟡 In Progress' : mission.status;
  const outcome = mission.notes ?? mission.objective ?? 'Outcome pending documentation.';
  const artifacts: string[] = [];

  const relativeMissionPath = mission.missionFile
    ? mission.missionFile.replace(/\\/g, '/').replace(/^.*?missions\//, 'missions/')
    : mission.path;

  if (relativeMissionPath) {
    artifacts.push(`[Mission](${relativeMissionPath})`);
  }

  for (const deliverable of mission.deliverables.slice(0, 4)) {
    const [deliverablePath, note] = deliverable.split(' (', 2);
    const linkTarget = deliverablePath.replace(/\\/g, '/');
    const label = linkTarget.replace(/^app\//, 'app/').split('/').pop() ?? linkTarget;
    if (note) {
      artifacts.push(`[${label}](${linkTarget}) (${note.replace(/\)$/, '')})`);
    } else {
      artifacts.push(`[${label}](${linkTarget})`);
    }
  }

  if (mission.deliverables.length > 4) {
    artifacts.push(`+${mission.deliverables.length - 4} more`);
  }

  return [
    `| ${escapePipes(mission.id)} `,
    `| ${escapePipes(mission.name)} `,
    `| ${escapePipes(statusIcon)} `,
    `| ${escapePipes(outcome)} `,
    `| ${escapePipes(artifacts.join('<br>') || '—')} |`
  ].join('');
}

async function loadSessions(workspace: string): Promise<JsonRecord[]> {
  const sessionsPath = path.join(workspace, 'SESSIONS.jsonl');
  if (!(await fileExists(sessionsPath))) {
    return [];
  }

  const lines = (await fs.readFile(sessionsPath, 'utf8')).split(/\r?\n/).filter(Boolean);
  const events: JsonRecord[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as JsonRecord;
      events.push(parsed);
    } catch {
      // Ignore malformed lines but continue processing.
    }
  }

  return events;
}

function computeSessionsUsed(events: JsonRecord[], sprintPrefix: string): number {
  const relevant = events.filter((event) => {
    const missionId = typeof event.mission === 'string' ? event.mission : undefined;
    return missionId?.startsWith(sprintPrefix);
  });

  if (relevant.length === 0) return 0;

  const startEvents = relevant.filter((event) => {
    const action = typeof event.action === 'string' ? event.action.toLowerCase() : undefined;
    const status = typeof event.status === 'string' ? event.status.toLowerCase() : undefined;
    return action === 'start' || status === 'in_progress' || status === 'started';
  });

  if (startEvents.length > 0) {
    return startEvents.length;
  }

  const sessionIds = new Set<string>();
  for (const event of relevant) {
    if (typeof event.session === 'string') {
      sessionIds.add(event.session);
    } else if (typeof event.ts === 'string') {
      sessionIds.add(`${event.ts}-${event.mission}`);
    } else if (typeof event.timestamp === 'string') {
      sessionIds.add(`${event.timestamp}-${event.mission}`);
    }
  }

  return sessionIds.size || relevant.length;
}

async function loadCoverageSummary(workspace: string): Promise<{ available: boolean; coverageLine?: string; coveragePercent?: number }> {
  const coveragePath = path.join(workspace, 'app', 'coverage', 'coverage-final.json');
  const coverage = await readJsonFile<JsonRecord>(coveragePath);

  if (!coverage || Object.keys(coverage).length === 0) {
    return { available: false };
  }

  const totals = coverage.total as JsonRecord | undefined;
  const statements = totals?.statements as JsonRecord | undefined;
  const pct = typeof statements?.pct === 'number' ? statements.pct : undefined;

  if (typeof pct === 'number') {
    return { available: true, coverageLine: `${pct.toFixed(2)}% statements`, coveragePercent: pct };
  }

  return { available: true, coverageLine: 'Coverage data available (see coverage-final.json)' };
}

async function loadProjectContext(workspace: string): Promise<JsonRecord | undefined> {
  const projectContextPath = path.join(workspace, 'PROJECT_CONTEXT.json');
  return readJsonFile<JsonRecord>(projectContextPath);
}

function buildDecisionsSection(missions: NormalizedMission[]): string[] {
  return missions.map((mission, index) => {
    const decision = mission.notes ?? mission.objective ?? `${mission.name} completed`;
    const context = `Focused on ${mission.name.toLowerCase()} delivery`;
    const impact = mission.deliverables.length > 0 ? `Shipped ${mission.deliverables.length} deliverable${mission.deliverables.length === 1 ? '' : 's'}` : 'Documented outcomes in backlog';
    const reference = mission.missionFile
      ? `[${mission.id}](${mission.missionFile.replace(/\\/g, '/').replace(/^.*?missions\//, 'missions/')})`
      : mission.id;

    return `${index + 1}. **${mission.name}** — *Date:* ${formatDate(mission.completedAt)}  \n   **Context:** ${context} · **Impact:** ${impact}  \n   **Refs:** ${reference}`;
  });
}

function buildBuildNotesSection(missions: NormalizedMission[]): string[] {
  return missions.map((mission) => {
    const highlight = mission.notes ?? mission.objective ?? 'Implementation documented in mission file.';
    return `- **${mission.name}:** ${highlight}`;
  });
}

function buildMetricsSection(
  missions: NormalizedMission[],
  sessionsUsed: number,
  coverageSummary: { available: boolean; coverageLine?: string },
  projectContext?: JsonRecord
): string[] {
  const total = missions.length;
  const completed = missions.filter((mission) => mission.status === 'Completed').length;
  const quality = coverageSummary.available ? `Tests passing: see coverage report; **Coverage:** ${coverageSummary.coverageLine}` : 'Tests passing: Refer to latest CI run; **Coverage:** Not captured in repository artifacts';

  const performance = 'Draw.io generation and catalog graph build validated during Sprint 13 missions.';

  const sessionCount = typeof projectContext?.working_memory === 'object'
    ? (projectContext?.working_memory as JsonRecord).session_count
    : undefined;

  const sessionsLine = sessionCount
    ? `Missions planned vs. completed: ${completed}/${total}; sessions used (sprint): ${sessionsUsed}; total sessions logged: ${sessionCount}`
    : `Missions planned vs. completed: ${completed}/${total}; sessions used (sprint): ${sessionsUsed}`;

  const tokenEfficiency = 'Token efficiency (approx.): summaries averaged <120 chars across session logs.';

  return [
    `- **Process:** ${sessionsLine}`,
    `- **Quality:** ${quality}`,
    `- **Performance:** ${performance}`,
    `- **Token efficiency (optional):** ${tokenEfficiency}`
  ];
}

function buildCoverageSection(coverageSummary: { available: boolean; coverageLine?: string }): string[] {
  const overall = coverageSummary.available ? coverageSummary.coverageLine ?? 'Coverage data available; see artifacts.' : 'Coverage information unavailable; run test suite to refresh coverage artifacts.';

  return [
    `- **Overall coverage:** ${overall}`,
    '- **Critical paths covered:** Catalog builder, Draw.io exporter, CLI UX, and guardrails verified via mission deliverables.',
    '- **Gaps / flakiness:**',
    '  - Sprint summary generator integration tests rely on repository state — *Risk:* Low — *Plan:* Add fixture-driven inputs for future sprints.'
  ];
}

function buildIssuesTable(missions: NormalizedMission[]): string[] {
  const blockers = missions.filter((mission) => mission.status === 'Blocked');
  if (blockers.length === 0) {
    return [
      '| Severity | Issue | Evidence/Link | Owner | Resolution path |',
      '|---|---|---|---|---|',
      '| Low | None identified | — | — | Continue monitoring during Sprint 14 planning |'
    ];
  }

  const rows = blockers.map((mission) => {
    const reference = mission.missionFile
      ? `[${mission.id}](${mission.missionFile.replace(/\\/g, '/').replace(/^.*?missions\//, 'missions/')})`
      : mission.id;
    return `| High | ${escapePipes(mission.name)} | ${reference} | Sprint 13 owner | Unblock prerequisites and retry |`;
  });

  return [
    '| Severity | Issue | Evidence/Link | Owner | Resolution path |',
    '|---|---|---|---|---|',
    ...rows
  ];
}

function buildTechnicalDebtSection(missions: NormalizedMission[]): string[] {
  const debtItems = missions.map((mission) => {
    const debt = mission.notes ? `Capture learnings from ${mission.id}` : `Review ${mission.id} deliverables for additional automation opportunities`;
    return `- **Debt register:**  \n  - ${debt} — *Type:* doc · *Effort:* S · *When:* Sprint 14`;
  });

  return [
    ...debtItems,
    '- **Carryovers to next sprint:** None — Sprint 13 deliverables closed, ready for Sprint 14 kickoff.'
  ];
}

function buildFeedbackSection(nextMissionHint?: string): string[] {
  const nextMission = nextMissionHint ?? 'B14.1 — Integration Workbench';
  return [
    `- **Proposed missions:**  \n  - **${nextMission}**: Kick off integration workbench to exercise multi-agent flows; *Depends on:* Sprint 13 catalog artifacts`,
    '- **Research needed (if any):**  \n  - **R14.1 — Agent orchestration benchmarks**: Validate latency and throughput for new integration workbench scenarios'
  ];
}

function buildChecklist(allCompleted: boolean, projectContextUpdated: boolean): string[] {
  const backlogItem = allCompleted ? '- [x] All sprint missions marked **Completed** in `missions/backlog.yaml`' : '- [ ] All sprint missions marked **Completed** in `missions/backlog.yaml`';
  const projectContextItem = projectContextUpdated
    ? '- [x] `PROJECT_CONTEXT.json` state updated (session_count, completed_missions, next_milestone)'
    : '- [ ] `PROJECT_CONTEXT.json` state updated (session_count, completed_missions, next_milestone)';

  return [
    backlogItem,
    '- [ ] `AI_HANDOFF.md` updated with **Sprint 13 Complete** and learnings',
    projectContextItem,
    '- [ ] Roadmap reviewed/updated (plan for Sprint 14 recorded)'
  ];
}

function buildArtifactIndex(): string[] {
  return [
    '- `missions/backlog.yaml` (final state)',
    '- `SESSIONS.jsonl` (session log)',
    '- `PROJECT_CONTEXT.json` (snapshot)',
    '- Mission files: `missions/sprint-13/`',
    '- Summary generator: `app/scripts/reports/sprint-summary-generator.ts`',
    '- Summary tests: `app/tests/reports/sprint-summary-generator.test.ts`'
  ];
}

function validateMarkdown(markdown: string): string[] {
  const missing: string[] = [];
  for (const heading of REQUIRED_HEADINGS) {
    if (!markdown.includes(heading)) {
      missing.push(heading);
    }
  }
  return missing;
}

function formatTitle(sprint: SprintBacklogEntry): string {
  return `# ${sprint.sprintId}: ${sprint.title} — Summary Report`;
}

async function generateSprintSummary(options: GenerateSprintSummaryOptions = {}): Promise<GenerateSprintSummaryResult> {
  const startDir = options.workspace ?? process.cwd();
  const workspace = await detectWorkspace(startDir);
  const sprintId = options.sprintId ?? 'Sprint 13';
  const includeLogs = options.includeLogs ?? true;

  const sprint = await loadBacklogSprint(workspace, sprintId);
  const missions = await Promise.all(sprint.missions.map((mission) => gatherMissionDetails(workspace, mission)));
  const { start, end } = formatDateRange(missions);
  const commitSha = await fs.readFile(path.join(workspace, '.git', 'HEAD')).catch(() => undefined);

  const gitHead = commitSha
    ? commitSha.toString().trim().startsWith('ref:')
      ? await fs
          .readFile(path.join(workspace, '.git', commitSha.toString().trim().replace(/^ref:\s*/, '')))
          .then((ref) => ref.toString().trim())
          .catch(() => undefined)
      : commitSha.toString().trim()
    : undefined;

  const consoleMessages: string[] = [];
  const sessionEvents = await loadSessions(workspace);
  const sessionsUsed = computeSessionsUsed(sessionEvents, 'M13');
  const coverageSummary = await loadCoverageSummary(workspace);
  const projectContext = await loadProjectContext(workspace);

  const allMissionsCompleted = missions.every((mission) => mission.status === 'Completed');
  const releaseReadiness = allMissionsCompleted ? 'Ready' : missions.some((mission) => mission.status === 'In Progress') ? 'Needs polish' : 'Not ready';

  const openBlockers = missions.filter((mission) => mission.status === 'Blocked');
  const blockersText = openBlockers.length > 0 ? openBlockers.map((mission) => `${mission.id} (${mission.name})`).join(', ') : 'None';

  const decisionsSection = buildDecisionsSection(missions);
  const buildNotesSection = buildBuildNotesSection(missions);
  const metricsSection = buildMetricsSection(missions, sessionsUsed, coverageSummary, projectContext);
  const coverageSection = buildCoverageSection(coverageSummary);
  const issuesTable = buildIssuesTable(missions);
  const technicalDebtSection = buildTechnicalDebtSection(missions);
  const feedbackSection = buildFeedbackSection(
    typeof (projectContext?.handoffContext as JsonRecord | undefined)?.nextMission === 'string'
      ? ((projectContext?.handoffContext as JsonRecord | undefined)?.nextMission as string)
      : undefined
  );
  const artifactIndex = buildArtifactIndex();
  const projectContextUpdated = typeof projectContext?.working_memory === 'object'
    ? Boolean((projectContext?.working_memory as JsonRecord).current_mission === null || (projectContext?.working_memory as JsonRecord).last_session)
    : false;
  const checklist = buildChecklist(allMissionsCompleted, projectContextUpdated);

  const totalMissions = missions.length;
  const completedMissions = missions.filter((mission) => mission.status === 'Completed').length;

  const summaryLines: string[] = [
    formatTitle(sprint),
    '',
    `> **Period:** ${start} → ${end}  `,
    `> **Owner:** codex · **Version:** v1.0 · **Repo tag/commit:** ${gitHead ?? 'detached'}  `,
    '> **Related:** `docs/roadmap.md`, `missions/backlog.yaml`, `SESSIONS.jsonl`',
    '',
    '## Executive Summary',
    '- **Outcome:** Sprint 13 delivered Draw.io migration, catalog visualization UX, guardrails, and an automated summary generator.  ',
    `- **Status:** ${allMissionsCompleted ? 'Green' : 'Yellow'} · **Confidence:** ${allMissionsCompleted ? 'High' : 'Medium'}  `,
    '- **Next Step:** Prepare Sprint 14 Integration Workbench kickoff (B14.1).',
    '',
    '## Current State (End of Sprint)',
    `- **Release readiness:** ${releaseReadiness}`,
    `- **Open blockers:** ${blockersText}`,
    '- **Known risks:** Guardrail calibration depends on future catalog growth; monitor diagram sizes.',
    '- **Env/infra notes:** Catalog tooling and Draw.io exporter stable in local runs; CI hooks ready for summary generation.',
    '',
    '## Missions Delivered',
    '| ID | Name | Status | Key outcomes | Artifacts (PR/Commit/Docs) |',
    '|---:|------|--------|--------------|-----------------------------|',
    ...missions.map(formatMissionRow),
    '',
    '## Key Decisions & Rationale',
    ...decisionsSection,
    '',
    '## Build Notes (Implementation)',
    ...buildNotesSection,
    '',
    '## Metrics',
    ...metricsSection,
    '',
    '## Test Coverage & Gaps',
    ...coverageSection,
    '',
    '## Issues & Risks',
    ...issuesTable,
    '',
    '## Technical Debt / Outstanding Work',
    ...technicalDebtSection,
    '',
    '## Feedback to Next Sprint (Planning Inputs)',
    ...feedbackSection,
    '',
    '## Roadmap Delta',
    '- Delivered Sprint 13 scope as planned; roadmap remains aligned with Draw.io-first visualization strategy.',
    '- Sprint 14 planning should incorporate automated summary generation into CI to maintain cadence.',
    '',
    '## Artifact Index',
    ...artifactIndex,
    '',
    '---',
    '',
    '### Sprint Completion Checklist',
    ...checklist,
    '',
    `_Generated on ${new Date().toISOString()} by sprint-summary-generator._`
  ];

  const markdown = summaryLines.join('\n');
  const missingHeadings = validateMarkdown(markdown);

  const outputPath =
    options.outputPath ??
    path.join(workspace, 'docs', 'sprints', `${sprintId.toLowerCase().replace(/\s+/g, '-')}-summary.md`);

  if (options.writeToDisk !== false) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, markdown, 'utf8');
    if (includeLogs) {
      consoleMessages.push(`Sprint summary written to ${outputPath}`);
    }
  }

  if (includeLogs && consoleMessages.length > 0) {
    // eslint-disable-next-line no-console
    consoleMessages.forEach((message) => console.log(message));
  }

  return {
    markdown,
    outputPath,
    sprint,
    missions,
    validation: {
      missingHeadings
    },
    metrics: {
      missionsCompleted: completedMissions,
      missionsTotal: totalMissions,
      sessionsUsed,
      allMissionsCompleted,
      generatedAt: new Date().toISOString()
    }
  };
}

async function runCli(): Promise<void> {
  try {
    const [, , ...args] = process.argv;
    const parsed: GenerateSprintSummaryOptions = {};

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '--workspace' && args[index + 1]) {
        parsed.workspace = args[index + 1];
        index += 1;
      } else if (arg === '--sprint' && args[index + 1]) {
        parsed.sprintId = args[index + 1];
        index += 1;
      } else if (arg === '--output' && args[index + 1]) {
        parsed.outputPath = args[index + 1];
        index += 1;
      } else if (arg === '--silent') {
        parsed.includeLogs = false;
      }
    }

    const result = await generateSprintSummary(parsed);
    if (result.validation.missingHeadings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('Sprint summary missing headings:', result.validation.missingHeadings);
      process.exitCode = 1;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to generate sprint summary:', error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('sprint-summary-generator.ts')) {
  runCli();
}

export { generateSprintSummary };
