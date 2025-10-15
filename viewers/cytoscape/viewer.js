const cytoscapeLib = window.cytoscape;
const cola = window.cola;
if (typeof cytoscapeLib === 'function' && cola) {
  cytoscapeLib.use(cola);
}

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const chooseFileButton = document.getElementById('choose-file');
const searchInput = document.getElementById('search-input');
const messageLog = document.getElementById('message-log');
const statsNodes = document.getElementById('stat-nodes');
const statsEdges = document.getElementById('stat-edges');
const statsFocus = document.getElementById('stat-focus');
const statsVersion = document.getElementById('stat-version');
const viewport = document.getElementById('cy');

const MAX_MESSAGES = 8;
let cy = null;

function logMessage(level, text) {
  if (!messageLog) return;
  const entry = document.createElement('div');
  entry.classList.add('message', `message--${level}`);
  entry.textContent = text;
  messageLog.prepend(entry);
  while (messageLog.children.length > MAX_MESSAGES) {
    messageLog.removeChild(messageLog.lastChild);
  }
}

function resetMessages() {
  if (messageLog) {
    messageLog.textContent = '';
  }
}

function resetStats() {
  statsNodes.textContent = '0';
  statsEdges.textContent = '0';
  statsFocus.textContent = '—';
  statsVersion.textContent = '—';
}

function updateStats(payload) {
  statsNodes.textContent = payload?.stats?.nodes ?? payload?.elements?.nodes?.length ?? 0;
  statsEdges.textContent = payload?.stats?.edges ?? payload?.elements?.edges?.length ?? 0;

  const focus = payload?.metadata?.focus?.label ?? payload?.graph?.name ?? 'Catalog';
  const version = payload?.graph?.version ?? '—';
  statsFocus.textContent = focus;
  statsVersion.textContent = version;
}

function normaliseStyle(style = []) {
  if (!Array.isArray(style)) {
    return [];
  }
  return style.map((entry) => ({
    selector: entry.selector,
    style: { ...(entry.style || {}) }
  }));
}

function decorateStyle(style) {
  return [
    ...style,
    {
      selector: '.highlighted',
      style: {
        'border-color': '#38bdf8',
        'border-width': 4,
        'background-color': '#bae6fd',
        'shadow-blur': 18,
        'shadow-color': '#38bdf8',
        'shadow-opacity': 0.6,
        'shadow-offset-x': 0,
        'shadow-offset-y': 0
      }
    },
    {
      selector: '.dimmed',
      style: {
        'opacity': 0.25
      }
    }
  ];
}

function destroyCy() {
  if (cy) {
    cy.destroy();
    cy = null;
  }
}

function initialiseCy(payload) {
  if (!cytoscapeLib) {
    logMessage('error', 'Cytoscape.js failed to load. Check network connectivity.');
    return;
  }

  destroyCy();

  const style = decorateStyle(normaliseStyle(payload.style));
  cy = cytoscapeLib({
    container: viewport,
    elements: payload.elements,
    style,
    layout: payload.layout,
    textureOnViewport: true,
    pixelRatio: 'auto',
    wheelSensitivity: 0.15,
    selectionType: 'additive'
  });

  const layout = cy.layout(payload.layout ?? { name: 'cola' });
  layout.run();

  cy.on('tap', 'node', (event) => {
    const data = event.target.data();
    if (!data) {
      return;
    }
    const info = [
      data.label,
      data.type ? `type: ${data.type}` : null,
      data.domain ? `domain: ${data.domain}` : null,
      data.urn ? `urn: ${data.urn}` : null
    ]
      .filter(Boolean)
      .join(' · ');
    if (info) {
      logMessage('info', info);
    }
  });
}

function highlightNodes(query) {
  if (!cy) return;
  const trimmed = query.trim().toLowerCase();
  cy.nodes().removeClass('highlighted');
  cy.nodes().removeClass('dimmed');

  if (!trimmed) {
    return;
  }

  const matches = cy.nodes().filter((node) => {
    const label = (node.data('label') || '').toLowerCase();
    const type = (node.data('type') || '').toLowerCase();
    const domain = (node.data('domain') || '').toLowerCase();
    const urn = (node.data('urn') || '').toLowerCase();
    return [label, type, domain, urn].some((value) => value.includes(trimmed));
  });

  if (matches.length === 0) {
    logMessage('warn', `No nodes matched "${query}".`);
    return;
  }

  const nonMatches = cy.nodes().difference(matches);
  nonMatches.addClass('dimmed');
  matches.addClass('highlighted');

  cy.animate(
    {
      fit: {
        eles: matches,
        padding: 120
      }
    },
    {
      duration: 400
    }
  );
}

async function parsePayload(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.format !== 'cytoscape-v1') {
      throw new Error('Unsupported payload. Expected format "cytoscape-v1".');
    }
    if (!parsed.elements || !Array.isArray(parsed.elements.nodes) || !Array.isArray(parsed.elements.edges)) {
      throw new Error('Payload missing required elements.nodes / elements.edges arrays.');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse Cytoscape export: ${error.message ?? error}`);
  }
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  return parsePayload(text);
}

async function handlePayload(payload) {
  resetMessages();
  initialiseCy(payload);
  updateStats(payload);

  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    payload.warnings.forEach((warning) => logMessage('warn', warning));
  } else {
    logMessage('info', 'Cytoscape export loaded successfully.');
  }
}

function setupDragAndDrop() {
  if (!dropZone) return;
  dropZone.addEventListener(
    'dragover',
    (event) => {
      event.preventDefault();
      dropZone.classList.add('drag-over');
    },
    false
  );

  dropZone.addEventListener(
    'dragleave',
    (event) => {
      event.preventDefault();
      dropZone.classList.remove('drag-over');
    },
    false
  );

  dropZone.addEventListener(
    'drop',
    async (event) => {
      event.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        return;
      }
      try {
        const payload = await loadFile(file);
        await handlePayload(payload);
      } catch (error) {
        logMessage('error', error.message ?? String(error));
      }
    },
    false
  );
}

function setupFileInput() {
  if (!fileInput) return;
  fileInput.addEventListener('change', async (event) => {
    const target = event.target;
    const file = target?.files?.[0];
    if (!file) return;
    try {
      const payload = await loadFile(file);
      await handlePayload(payload);
    } catch (error) {
      logMessage('error', error.message ?? String(error));
    } finally {
      fileInput.value = '';
    }
  });

  if (chooseFileButton) {
    chooseFileButton.addEventListener('click', () => {
      fileInput.click();
    });
  }
}

function setupSearch() {
  if (!searchInput) return;
  let debounceHandle = null;
  searchInput.addEventListener('input', (event) => {
    const value = event.target.value ?? '';
    if (debounceHandle) {
      window.clearTimeout(debounceHandle);
    }
    debounceHandle = window.setTimeout(() => {
      highlightNodes(value);
    }, 180);
  });
}

async function loadEmbeddedPayload() {
  const params = new URLSearchParams(window.location.search);
  const hint = params.get('hint');
  if (hint) {
    logMessage('info', `Drag & drop export from: ${decodeURIComponent(hint)}`);
  }
  const embedded = params.get('payload');
  if (!embedded) return;
  try {
    const text = atob(embedded);
    const payload = await parsePayload(text);
    await handlePayload(payload);
    logMessage('info', 'Loaded embedded payload from URL.');
  } catch (error) {
    logMessage('warn', `Unable to load embedded payload: ${error.message ?? error}`);
  }
  if (hint) {
    logMessage('info', `Drag & drop export from: ${decodeURIComponent(hint)}`);
  }
}

function initialise() {
  resetStats();
  setupDragAndDrop();
  setupFileInput();
  setupSearch();
  loadEmbeddedPayload();
  logMessage('info', 'Awaiting Cytoscape export. Drag & drop a JSON file to begin.');
}

initialise();
