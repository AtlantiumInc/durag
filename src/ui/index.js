import { CSS } from './styles.js';
import { parseCSV, buildVectors, runUMAP, clusterize, analyze, CLUSTER_PALETTE } from '../engine/index.js';

export function mount(selector, csvData) {
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!container) throw new Error(`durag: container "${selector}" not found`);

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // State
  let state = { rows: null, headers: null, embedding: null, knnIndices: null, clusterLabels: null, clusterData: {}, numericCols: [], mrrCol: null, nameCol: null, k: 0, threeInited: false };
  let fieldPalettes = {};

  // Build DOM
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  const root = document.createElement('div');
  root.className = 'durag-root';
  root.style.width = '100%';
  root.style.height = '100%';
  root.style.overflow = 'auto';
  container.appendChild(root);

  root.innerHTML = `
    <div class="durag-upload">
      <div class="logo">durag.js</div>
      <div class="tagline">360&deg; data pattern recognition</div>
      <div class="durag-drop-zone">
        <div class="dz-icon">&#8593;</div>
        <div class="dz-text">drop your export here</div>
        <div class="dz-sub">CSV from Stripe, HubSpot, or any tabular data</div>
        <input type="file" accept=".csv,.tsv,.txt">
      </div>
    </div>
    <div class="durag-processing">
      <div class="logo">durag.js</div>
      <div class="tagline">360&deg; data pattern recognition</div>
      <div class="durag-file-info"></div>
      <div class="durag-progress-wrap"><div class="durag-progress-bar"></div></div>
      <div class="durag-progress-text">initializing...</div>
      <div class="durag-error"></div>
    </div>
    <div class="durag-dash">
      <div class="durag-topbar">
        <div style="display:flex;align-items:center;gap:16px;">
          <button class="durag-btn durag-btn-ghost durag-back-home">&#8592; New data</button>
          <div><div class="logo">durag.js</div><div class="tag">360&deg; pattern recognition</div></div>
        </div>
        <button class="durag-btn durag-open-3d">Explore in 3D &#8594;</button>
      </div>
      <div class="durag-content"></div>
    </div>
    <div class="durag-3d">
      <button class="durag-btn durag-btn-ghost back-btn durag-back-dash">&#8592; Dashboard</button>
      <div class="durag-3d-hud"><span class="label">color by</span></div>
      <div class="durag-3d-legend"></div>
      <div class="durag-3d-info"></div>
    </div>
    <div class="durag-inspector">
      <button class="close-btn">&times;</button>
      <div class="company-name"></div>
      <div class="cluster-badge"></div>
      <div class="divider"></div>
      <div class="fields"></div>
    </div>
  `;

  // Element refs
  const $ = s => root.querySelector(s);
  const $$ = s => root.querySelectorAll(s);
  const uploadEl = $('.durag-upload');
  const procEl = $('.durag-processing');
  const dashEl = $('.durag-dash');
  const contentEl = $('.durag-content');
  const threeEl = $('.durag-3d');
  const inspectorEl = $('.durag-inspector');
  const progressBar = $('.durag-progress-bar');
  const progressText = $('.durag-progress-text');
  const dropZone = $('.durag-drop-zone');
  const fileInput = $('input[type="file"]');

  // Upload handlers
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  function handleFile(file) {
    const r = new FileReader();
    r.onload = e => processCSV(e.target.result, file.name);
    r.readAsText(file);
  }

  // Navigation
  $('.durag-back-home').addEventListener('click', resetToUpload);
  $('.durag-open-3d').addEventListener('click', () => {
    dashEl.style.display = 'none';
    threeEl.style.display = 'block';
    root.style.overflow = 'hidden';
    if (!state.threeInited) { state.threeInited = true; init3D(); }
  });
  $('.durag-back-dash').addEventListener('click', () => {
    threeEl.style.display = 'none';
    dashEl.style.display = 'block';
    inspectorEl.classList.remove('open');
    root.style.overflow = 'auto';
  });
  $('.durag-inspector .close-btn').addEventListener('click', () => inspectorEl.classList.remove('open'));

  function resetToUpload() {
    dashEl.style.display = 'none';
    threeEl.style.display = 'none';
    contentEl.innerHTML = '';
    inspectorEl.classList.remove('open');
    const canvas = threeEl.querySelector('canvas');
    if (canvas) canvas.remove();
    state = { rows: null, headers: null, embedding: null, knnIndices: null, clusterLabels: null, clusterData: {}, numericCols: [], mrrCol: null, nameCol: null, k: 0, threeInited: false };
    fieldPalettes = {};
    $('.durag-3d-hud').innerHTML = '<span class="label">color by</span>';
    procEl.style.display = 'none';
    procEl.classList.remove('fade-out');
    progressBar.style.width = '0%';
    progressText.textContent = 'initializing...';
    $('.durag-error').style.display = 'none';
    uploadEl.style.display = 'flex';
    uploadEl.classList.remove('fade-out');
    root.style.overflow = 'auto';
  }

  // Pipeline
  async function processCSV(text, filename) {
    uploadEl.classList.add('fade-out');
    procEl.classList.remove('fade-out');
    procEl.style.display = 'flex';
    $('.durag-file-info').textContent = filename;
    const set = (pct, msg) => { progressBar.style.width = pct + '%'; progressText.textContent = msg; };

    try {
      set(5, 'parsing CSV...');
      await new Promise(r => setTimeout(r, 50));
      const parsed = parseCSV(text);
      state.rows = parsed.rows; state.headers = parsed.headers;

      set(10, `${state.rows.length} rows × ${state.headers.length} columns`);
      await new Promise(r => setTimeout(r, 300));

      set(15, 'profiling columns...');
      await new Promise(r => setTimeout(r, 50));
      const { vectors, columns } = buildVectors(state.rows, state.headers);

      set(20, `${columns.length} features found`);
      await new Promise(r => setTimeout(r, 300));

      const result = await runUMAP(vectors, {
        onProgress: pct => set(20 + Math.round(pct * 0.65), 'discovering patterns... ' + pct + '%')
      });
      state.embedding = result.embedding;
      state.knnIndices = result.knnIndices;

      set(88, 'identifying clusters...');
      await new Promise(r => setTimeout(r, 50));
      const { labels, k } = clusterize(state.embedding);
      state.clusterLabels = labels;
      state.k = k;

      const analysis = analyze(state.rows, state.headers, state.embedding, labels, k);
      Object.assign(state, analysis);

      set(95, 'building dashboard...');
      await new Promise(r => setTimeout(r, 100));
      buildDashboard();

      set(100, 'done');
      await new Promise(r => setTimeout(r, 200));
      procEl.classList.add('fade-out');
      setTimeout(() => { procEl.style.display = 'none'; }, 900);
      dashEl.style.display = 'block';
    } catch (err) {
      console.error('durag error:', err);
      $('.durag-error').textContent = 'error: ' + err.message;
      $('.durag-error').style.display = 'block';
    }
  }

  // Dashboard
  function buildDashboard() {
    const cd = state.clusters || state.clusterData;
    const mrrCol = state.mrrCol;
    const fmtMrr = v => '$' + Math.round(v).toLocaleString();
    const atRiskClusters = Object.values(cd).filter(c => c.atRisk);
    const atRiskCount = atRiskClusters.reduce((s, c) => s + c.count, 0);
    const atRiskMrr = atRiskClusters.reduce((s, c) => s + c.totalMrr, 0);
    const largest = Object.values(cd).sort((a, b) => b.count - a.count)[0];

    let html = `<div class="durag-hero">
      <div class="durag-stat"><div class="s-label">Segments discovered</div><div class="s-value">${state.k}</div><div class="s-sub">${state.rows.length} customers analyzed</div></div>
      <div class="durag-stat risk"><div class="s-label">At risk</div><div class="s-value">${atRiskCount} customers</div><div class="s-sub">${mrrCol ? fmtMrr(atRiskMrr) + ' MRR exposed' : 'flagged by behavior patterns'}</div></div>
      <div class="durag-stat"><div class="s-label">Largest segment</div><div class="s-value">${largest.label}</div><div class="s-sub">${largest.count} customers · ${largest.pct}%</div></div>
    </div><div class="durag-section">Segments</div><div class="durag-segments">`;

    const sorted = Object.entries(cd).sort((a, b) => { if (a[1].atRisk && !b[1].atRisk) return -1; if (!a[1].atRisk && b[1].atRisk) return 1; return b[1].count - a[1].count; });
    for (const [cIdx, c] of sorted) {
      const color = CLUSTER_PALETTE[cIdx % CLUSTER_PALETTE.length];
      const trait = c.bestCol ? c.bestCol.replace(/^metadata[_.]/, '').replace(/_/g, ' ') : '';
      html += `<div class="durag-seg${c.atRisk ? ' at-risk' : ''}" data-cluster="${cIdx}">
        <div class="seg-header"><span class="seg-dot" style="background:${color}"></span><span class="seg-name">${c.label}${c.atRisk ? ' ⚠' : ''}</span><span class="seg-count">${c.count} · ${c.pct}%</span></div>
        <div class="seg-stats">${mrrCol ? `<div class="seg-stat"><span class="ss-val">${fmtMrr(c.avgMrr)}</span><span class="ss-label">avg mrr</span></div>` : ''}<div class="seg-stat"><span class="ss-val">${c.count}</span><span class="ss-label">customers</span></div>${c.delinquentRate > 0 ? `<div class="seg-stat"><span class="ss-val">${Math.round(c.delinquentRate * 100)}%</span><span class="ss-label">delinquent</span></div>` : ''}</div>
        <div class="seg-bar"><div class="seg-bar-fill" style="width:${c.pct}%"></div></div>
        ${trait ? `<div class="seg-trait">defined by: ${c.bestDir} ${trait}</div>` : ''}
        ${c.insights && c.insights.length ? `<div class="seg-insights">${c.insights.map(t => `<div class="seg-insight">${t}</div>`).join('')}</div>` : ''}
      </div>`;
    }
    html += '</div>';

    // Table
    const tableCols = [state.nameCol, state.mrrCol, '_clusterName'].filter(Boolean);
    const extraCols = state.headers.filter(h => {
      const lc = h.toLowerCase();
      return !['id', 'email', 'created', 'currency', 'default_source', 'livemode', 'description'].some(s => lc.includes(s)) && !tableCols.includes(h);
    }).slice(0, 4);
    const allCols = [...tableCols, ...extraCols];

    html += `<div class="durag-section">Customers</div>
      <input type="text" class="durag-search" placeholder="Search customers...">
      <div class="durag-table-wrap"><table class="durag-table"><thead><tr>`;
    for (const col of allCols) {
      html += `<th data-col="${col}">${col === '_clusterName' ? 'segment' : col.replace(/^metadata[_.]/, '').replace(/_/g, ' ')}</th>`;
    }
    html += '</tr></thead><tbody class="durag-tbody">';
    html += renderRows(state.rows, allCols);
    html += '</tbody></table></div>';
    contentEl.innerHTML = html;

    // Segment card click
    contentEl.querySelectorAll('.durag-seg').forEach(card => {
      card.addEventListener('click', () => {
        const cIdx = parseInt(card.dataset.cluster);
        const filtered = state.rows.filter(r => r._cluster === cIdx);
        const tbody = contentEl.querySelector('.durag-tbody');
        if (tbody) tbody.innerHTML = renderRows(filtered, allCols);
        const search = contentEl.querySelector('.durag-search');
        if (search) search.value = '';
        contentEl.querySelectorAll('.durag-seg').forEach(c => c.style.outline = 'none');
        card.style.outline = '1px solid ' + CLUSTER_PALETTE[cIdx % CLUSTER_PALETTE.length];
        const section = contentEl.querySelectorAll('.durag-section');
        if (section.length > 1) section[1].scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Search
    const searchEl = contentEl.querySelector('.durag-search');
    if (searchEl) {
      searchEl.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        const filtered = q ? state.rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : state.rows;
        const tbody = contentEl.querySelector('.durag-tbody');
        if (tbody) tbody.innerHTML = renderRows(filtered, allCols);
        contentEl.querySelectorAll('.durag-seg').forEach(c => c.style.outline = 'none');
      });
    }

    // Sort
    let sortCol = null, sortDir = 1;
    contentEl.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
        const s = [...state.rows].sort((a, b) => {
          const va = a[col] || '', vb = b[col] || '';
          const na = parseFloat(va), nb = parseFloat(vb);
          if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortDir;
          return String(va).localeCompare(String(vb)) * sortDir;
        });
        const tbody = contentEl.querySelector('.durag-tbody');
        if (tbody) tbody.innerHTML = renderRows(s, allCols);
      });
    });

    // Row click
    contentEl.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-idx]');
      if (!tr) return;
      showInspector(state.rows[parseInt(tr.dataset.idx)]);
    });
  }

  function renderRows(list, cols) {
    let html = '';
    for (const row of list) {
      const idx = state.rows.indexOf(row);
      html += `<tr data-idx="${idx}">`;
      for (const col of cols) {
        let val = row[col] || '—';
        if (col === '_clusterName') {
          val = `<span class="durag-pill" style="background:${CLUSTER_PALETTE[row._cluster % CLUSTER_PALETTE.length]}">${val}</span>`;
        } else if (state.mrrCol && col === state.mrrCol) {
          const n = parseFloat(val); if (!isNaN(n)) val = '$' + Math.round(n).toLocaleString();
        }
        html += `<td>${val}</td>`;
      }
      html += '</tr>';
    }
    return html;
  }

  function showInspector(row) {
    inspectorEl.classList.add('open');
    inspectorEl.querySelector('.company-name').textContent = row[state.nameCol] || row[state.headers[0]];
    const badge = inspectorEl.querySelector('.cluster-badge');
    badge.textContent = row._clusterName;
    badge.style.background = CLUSTER_PALETTE[row._cluster % CLUSTER_PALETTE.length];
    badge.style.color = '#000';
    const skip = ['_cluster', '_clusterName'];
    const fields = state.headers.filter(h => !skip.includes(h)).map(h => {
      let val = row[h]; if (val === '' || val === undefined) val = '—';
      if (state.mrrCol && h === state.mrrCol) { const n = parseFloat(val); if (!isNaN(n)) val = '$' + Math.round(n).toLocaleString(); }
      return [h.replace(/^metadata[_.]/, '').replace(/_/g, ' '), val];
    });
    inspectorEl.querySelector('.fields').innerHTML = fields.map(([k, v]) => `<div class="field"><span class="key">${k}</span><span class="value">${v}</span></div>`).join('');
  }

  // 3D View
  function init3D() {
    let THREE;
    try { THREE = window.THREE || require('three'); } catch (e) {
      threeEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b7280;font-family:monospace;font-size:14px;">three.js not found. Install with: npm install three</div>';
      return;
    }

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x06060c);
    const camera = new THREE.PerspectiveCamera(60, threeEl.clientWidth / threeEl.clientHeight, 0.1, 200); camera.position.set(0, 0, 16);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(threeEl.clientWidth, threeEl.clientHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
    threeEl.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0x8888cc, 0.5));
    const kl = new THREE.PointLight(0xffffff, 1.2, 60); kl.position.set(8, 8, 8); scene.add(kl);
    const fl = new THREE.PointLight(0x7c3aed, 0.4, 50); fl.position.set(-6, -4, 6); scene.add(fl);

    const targetPos = state.embedding.map(e => new THREE.Vector3(e[0], e[1], e[2]));
    let sizeVals = null, sMin = 0, sMax = 1, sRange = 1;
    if (state.mrrCol) { sizeVals = state.rows.map(r => parseFloat(r[state.mrrCol]) || 0); sMin = Math.min(...sizeVals); sMax = Math.max(...sizeVals); sRange = sMax - sMin || 1; }
    const sphereSizes = state.rows.map((r, i) => { const t = sizeVals ? (sizeVals[i] - sMin) / sRange : 0.5; return 0.06 + t * 0.18; });

    const sGeo = new THREE.SphereBufferGeometry(1, 16, 12);
    const sMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.5, emissive: 0x111122, emissiveIntensity: 0.4 });
    const mesh = new THREE.InstancedMesh(sGeo, sMat, state.rows.length); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);

    const KE = 4, edgeSet = new Set(), edgePairs = [];
    for (let i = 0; i < state.rows.length; i++) { const nbrs = state.knnIndices[i].slice(0, KE); for (const j of nbrs) { const key = Math.min(i, j) + ',' + Math.max(i, j); if (!edgeSet.has(key)) { edgeSet.add(key); edgePairs.push([i, j]); } } }
    const lp = new Float32Array(edgePairs.length * 6), lc = new Float32Array(edgePairs.length * 6);
    const lGeo = new THREE.BufferGeometry(); lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const linesMesh = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.15, depthWrite: false })); scene.add(linesMesh);

    const dGeo = new THREE.BufferGeometry(), dPos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) { dPos[i * 3] = (Math.random() - 0.5) * 30; dPos[i * 3 + 1] = (Math.random() - 0.5) * 30; dPos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    scene.add(new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0x333355, size: 0.03, transparent: true, opacity: 0.4, depthWrite: false })));

    let currentColorBy = 'cluster', selectedIdx = -1;
    const cd = state.clusters || state.clusterData;

    function getColorHex(row, colorBy) {
      if (colorBy === 'cluster') return CLUSTER_PALETTE[row._cluster % CLUSTER_PALETTE.length];
      const val = row[colorBy]; if (!val && val !== 0) return '#3a3a4a';
      if (['true', 'false'].includes(String(val).toLowerCase())) return String(val).toLowerCase() === 'true' ? '#4ade80' : '#f87171';
      if (!fieldPalettes[colorBy]) { const u = [...new Set(state.rows.map(r => r[colorBy]))].sort(), p = {}; const colors = CLUSTER_PALETTE; u.forEach((v, i) => p[v] = colors[i % colors.length]); fieldPalettes[colorBy] = p; }
      return fieldPalettes[colorBy][val] || '#6b7280';
    }

    function updateColors() {
      const ca = new Float32Array(state.rows.length * 3);
      for (let i = 0; i < state.rows.length; i++) { const col = new THREE.Color(getColorHex(state.rows[i], currentColorBy)); if (i === selectedIdx) { col.r = Math.min(1, col.r * 1.4 + 0.3); col.g = Math.min(1, col.g * 1.4 + 0.3); col.b = Math.min(1, col.b * 1.4 + 0.3); } ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(ca, 3); mesh.instanceColor.needsUpdate = true;
      const la = lGeo.getAttribute('color').array;
      for (let e = 0; e < edgePairs.length; e++) { const [i, j] = edgePairs[e]; const ci = new THREE.Color(getColorHex(state.rows[i], currentColorBy)), cj = new THREE.Color(getColorHex(state.rows[j], currentColorBy)); la[e * 6] = ci.r; la[e * 6 + 1] = ci.g; la[e * 6 + 2] = ci.b; la[e * 6 + 3] = cj.r; la[e * 6 + 4] = cj.g; la[e * 6 + 5] = cj.b; }
      lGeo.getAttribute('color').needsUpdate = true;
    }

    function updateLegend() {
      const el = root.querySelector('.durag-3d-legend');
      if (currentColorBy === 'cluster') { el.innerHTML = Object.entries(cd).map(([k, v]) => `<div class="item"><span class="dot" style="background:${CLUSTER_PALETTE[k % CLUSTER_PALETTE.length]}"></span>${v.label}</div>`).join(''); }
      else { const pal = fieldPalettes[currentColorBy]; if (pal) el.innerHTML = Object.entries(pal).map(([k, v]) => `<div class="item"><span class="dot" style="background:${v}"></span>${k || '(empty)'}</div>`).join(''); else el.innerHTML = ''; }
    }

    // Color buttons
    const hud = root.querySelector('.durag-3d-hud');
    const addBtn = (label, value) => { const btn = document.createElement('button'); btn.textContent = label; btn.dataset.color = value; if (value === 'cluster') btn.classList.add('active'); btn.addEventListener('click', () => { hud.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentColorBy = value; updateColors(); updateLegend(); }); hud.appendChild(btn); };
    addBtn('cluster', 'cluster');
    const skip = ['id', 'email', 'name', 'description', 'default_source', 'created', 'livemode'];
    for (const h of state.headers) { const lc = h.toLowerCase(); if (skip.some(s => lc.includes(s))) continue; const u = [...new Set(state.rows.map(r => r[h]))]; if (u.length >= 2 && u.length <= 8) addBtn(h.replace(/^metadata[_.]/, '').replace(/_/g, ' '), h); }

    root.querySelector('.durag-3d-info').textContent = `${state.rows.length} records · ${state.k} clusters · durag.js`;
    updateColors(); updateLegend();

    // Controls
    const orbit = { phi: Math.PI / 2.2, theta: 0, radius: 16, target: new THREE.Vector3(), auto: true };
    let isDrag = false, isPan = false, prev = { x: 0, y: 0 }, mDown = { x: 0, y: 0 }, damp = { dP: 0, dT: 0 }, didDrag = false;
    renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) isDrag = true; if (e.button === 2) isPan = true; prev = { x: e.clientX, y: e.clientY }; mDown = { x: e.clientX, y: e.clientY }; didDrag = false; orbit.auto = false; });
    window.addEventListener('mouseup', () => { isDrag = false; isPan = false; });
    window.addEventListener('mousemove', e => { const dx = e.clientX - prev.x, dy = e.clientY - prev.y; if (Math.abs(e.clientX - mDown.x) + Math.abs(e.clientY - mDown.y) > 5) didDrag = true; prev = { x: e.clientX, y: e.clientY }; if (isDrag) { damp.dT = -dx * 0.005; damp.dP = -dy * 0.005; orbit.theta += damp.dT; orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi + damp.dP)); } if (isPan) { const ps = 0.01 * orbit.radius, right = new THREE.Vector3(), up = new THREE.Vector3(); right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1); orbit.target.addScaledVector(right, -dx * ps); orbit.target.addScaledVector(up, dy * ps); } });
    renderer.domElement.addEventListener('wheel', e => { orbit.radius *= 1 + e.deltaY * 0.001; orbit.radius = Math.max(4, Math.min(40, orbit.radius)); e.preventDefault(); }, { passive: false });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    const _v3 = new THREE.Vector3();
    renderer.domElement.addEventListener('click', e => {
      if (didDrag) return;
      let best = -1, bestD = Infinity;
      const rect = renderer.domElement.getBoundingClientRect();
      const hw = rect.width / 2, hh = rect.height / 2;
      for (let i = 0; i < state.rows.length; i++) { _v3.copy(targetPos[i]).project(camera); if (_v3.z < 0 || _v3.z > 1) continue; const sx = (_v3.x * hw) + hw + rect.left, sy = -(_v3.y * hh) + hh + rect.top, d = Math.hypot(sx - e.clientX, sy - e.clientY); if (d < bestD) { bestD = d; best = i; } }
      const idx = bestD < 25 ? best : -1;
      if (idx >= 0) { selectedIdx = idx; showInspector(state.rows[idx]); } else { selectedIdx = -1; inspectorEl.classList.remove('open'); }
      updateColors();
    });

    window.addEventListener('resize', () => { if (threeEl.style.display === 'none') return; camera.aspect = threeEl.clientWidth / threeEl.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(threeEl.clientWidth, threeEl.clientHeight); });

    const dummy = new THREE.Object3D();
    const introStart = performance.now();
    function animate() {
      requestAnimationFrame(animate);
      if (threeEl.style.display === 'none') return;
      damp.dT *= 0.92; damp.dP *= 0.92;
      if (orbit.auto) orbit.theta += 0.0012; else { orbit.theta += damp.dT * 0.3; orbit.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbit.phi + damp.dP * 0.3)); }
      camera.position.set(orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.target.y + orbit.radius * Math.cos(orbit.phi), orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)); camera.lookAt(orbit.target);
      const t = Math.min(1, (performance.now() - introStart) / 1200), scale = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < state.rows.length; i++) { const p = targetPos[i]; let sz = sphereSizes[i] * scale; if (i === selectedIdx) sz *= 1.5 * (1 + 0.12 * Math.sin(Date.now() * 0.004)); dummy.position.set(p.x * scale, p.y * scale, p.z * scale); dummy.scale.setScalar(sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); } mesh.instanceMatrix.needsUpdate = true;
      const la = lGeo.getAttribute('position').array; for (let e = 0; e < edgePairs.length; e++) { const [i, j] = edgePairs[e]; const pi = targetPos[i], pj = targetPos[j]; la[e * 6] = pi.x * scale; la[e * 6 + 1] = pi.y * scale; la[e * 6 + 2] = pi.z * scale; la[e * 6 + 3] = pj.x * scale; la[e * 6 + 4] = pj.y * scale; la[e * 6 + 5] = pj.z * scale; } lGeo.getAttribute('position').needsUpdate = true;
      const lt = Date.now() * 0.0003; fl.position.set(Math.sin(lt) * 8, Math.cos(lt * 0.7) * 4, Math.cos(lt) * 8);
      renderer.render(scene, camera);
    }
    animate();
  }

  // If csvData was provided, skip upload and process immediately
  if (csvData) {
    setTimeout(() => processCSV(csvData, 'data.csv'), 50);
  }

  return {
    destroy() {
      styleEl.remove();
      container.innerHTML = '';
    },
    getState() { return state; }
  };
}
