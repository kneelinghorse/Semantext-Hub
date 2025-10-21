const $ = (sel) => document.querySelector(sel);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const next = (localStorage.getItem('theme') || 'light') === 'light' ? 'dark' : 'light';
  setTheme(next);
}

$('#theme-toggle').addEventListener('click', toggleTheme);
setTheme(localStorage.getItem('theme') || 'light');

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

$('#validate').addEventListener('click', async () => {
  try {
    const manifest = JSON.parse($('#manifest').value || '{}');
    const schema = JSON.parse($('#schema').value || '{}');
    const baseDir = $('#baseDir').value || undefined;
    const result = await postJson('/api/validate', { manifest, schema, baseDir });
    $('#validate-result').textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    $('#validate-result').textContent = `Error: ${err.message}`;
  }
});

$('#preview-graph').addEventListener('click', async () => {
  try {
    const manifest = JSON.parse($('#manifest').value || '{}');
    const result = await postJson('/api/graph', { manifest });
    $('#preview-result').textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    $('#preview-result').textContent = `Error: ${err.message}`;
  }
});

$('#preview-docs').addEventListener('click', async () => {
  try {
    const manifest = JSON.parse($('#manifest').value || '{}');
    const result = await postJson('/api/docs', { manifest });
    $('#preview-result').textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    $('#preview-result').textContent = `Error: ${err.message}`;
  }
});

