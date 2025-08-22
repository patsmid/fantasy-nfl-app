// frontend/src/views/users/draft_pro.js
/*
  draft_pro.js — Tablero de Toma de Decisiones (BPA para humanos)
  -----------------------------------------------------------------
  ✅ MÓDULO CON export default — listo para usar con tu router.

  - Renderiza su propio HTML dentro de #content-container.
  - Incluye selector de LIGAS (con fallback a ligas manuales del usuario).
  - Mantiene filtros clave en localStorage.
  - Usa GET /draft/:league_id (ajusta DEFAULT_BASEURL si tu ruta es distinta).
*/

import { fetchManualLeaguesByUser } from '../../apiUsers.js';
import { showError as alertError } from '../../../components/alerts.js';
import { getAccessTokenFromClient, getUserIdFromClient } from '../../../components/authHelpers.js';

const DEFAULT_BASEURL = '/draft'; // ajusta si tu backend publica otra ruta
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';
const CONTAINER_ID = 'content-container';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const POS_COLORS = { QB: '#ffc107', RB: '#28a745', WR: '#0d6efd', TE: '#6f42c1', K: '#6c757d', DEF: '#6c757d' };

const DEFAULT_WEIGHTS = {
  safe:      { vor: 0.45, adp: 0.18, need: 0.18, scarcity: 0.09, risk: -0.10 },
  balanced:  { vor: 0.45, adp: 0.20, need: 0.15, scarcity: 0.10, risk: -0.10 },
  upside:    { vor: 0.50, adp: 0.23, need: 0.10, scarcity: 0.07, risk: -0.05 },
};

const html = String.raw;
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pct = (x) => `${Math.round(x * 100)}%`;

function el(tag, cls = '', inner = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (inner != null) e.innerHTML = inner;
  return e;
}

/* -------------------------
   Loading / errores (fallbacks)
   ------------------------- */
function showLoading(msg) {
  if (typeof window.showLoadingBar === 'function') return window.showLoadingBar(msg || 'Cargando…');
  const id = '__db_loading_overlay';
  let o = document.getElementById(id);
  const inner = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2000;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)"><div style="padding:16px 22px;border-radius:10px;background:#1e1e1e;border:1px solid #333;box-shadow:0 6px 24px rgba(0,0,0,.6);color:#fff">${msg || 'Cargando…'}</div></div>`;
  if (!o) { o = el('div', '', inner); o.id = id; document.body.appendChild(o); }
  else { o.style.display = 'block'; o.innerHTML = inner; }
}
function hideLoading() {
  if (typeof window.showLoadingBar === 'function') return window.showLoadingBar('');
  const o = document.getElementById('__db_loading_overlay'); if (o) o.style.display = 'none';
}
function showErrorMsg(msg) {
  if (typeof alertError === 'function') return alertError(msg);
  if (typeof window.showError === 'function') return window.showError(msg);
  alert(msg);
}

/* -------------------------
   Fetch de datos
   ------------------------- */
async function fetchDraftData({ baseUrl = DEFAULT_BASEURL, leagueId, position = 'TODAS', idExpert = '3701', extraParams = {} } = {}) {
  if (!leagueId) throw new Error('leagueId es requerido');
  const paramsObj = { position, idExpert };
  Object.entries(extraParams || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null)
      paramsObj[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  });
  const qs = new URLSearchParams(paramsObj).toString();
  const url = `${baseUrl}/${encodeURIComponent(leagueId)}?${qs}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.json();
}

/* -------------------------
   Normalización
   ------------------------- */
function normalizePlayers(payload) {
  const players = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.players)
    ? payload.players
    : [];
  return players
    .map((p) => ({
      id: String(p.player_id ?? p.id ?? p.sleeper_player_id ?? ''),
      name: p.name ?? p.full_name ?? p.nombre ?? '—',
      team: p.team ?? p.nfl_team ?? '—',
      pos: p.position ?? p.pos ?? p.position_id ?? '—',
      bye: p.bye ?? p.bye_week ?? null,
      status: p.status ?? 'LIBRE',
      overall: num(p.overall ?? p.rank ?? p.ecr_overall),
      posRank: num(p.pos_rank ?? p.position_rank),
      adpRank: num(p.adp_rank ?? p.adp_overall ?? p.adp ?? p.adpValue),
      vor: num(p.vor ?? p.vor_score ?? p.adjustedVOR),
      dropoff: num(p.dropoff ?? p.dropoff_value),
      projStdDev: num(p.projStdDev ?? p.stdDev),
      injuryRisk: normInjury(p.injuryRisk ?? p.injury_risk),
      valueVsADP: computeValueVsADP(p),
      raw: p,
    }))
    .filter((p) => p.id && p.pos !== '—');
}
function normInjury(x) {
  if (x == null) return 0;
  let v = Number(x);
  if (!Number.isFinite(v)) return 0;
  if (v > 1) v = Math.min(1, v / 100);
  return clamp(v, 0, 1);
}
function computeValueVsADP(p) {
  const adp = num(p.adp_rank ?? p.adp_overall ?? p.adp ?? p.adpValue);
  const r = num(p.rank ?? p.overall ?? p.ecr_rank);
  if (!adp || !r) return 0;
  return Math.max(0, adp - r);
}

/* -------------------------
   Necesidades / Scarcity / Score
   ------------------------- */
function computeNeeds(params, coach, players) {
  if (coach && coach.rosterNeeds) return coach.rosterNeeds;
  const starters = Array.isArray(params?.starterPositions) ? params.starterPositions : [];
  const need = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const s of starters) {
    if (need[s] != null) need[s]++;
    else if (s === 'FLEX') {
      const order = ['RB', 'WR', 'TE'];
      order.sort((a, b) => need[a] - need[b]);
      need[order[0]]++;
    } else if (s === 'SUPER_FLEX') {
      need.QB++;
    }
  }
  return need;
}
function scarcityForPos(pos, params) {
  const base = { RB: 2.4, WR: 1.3, QB: 1.2, TE: 1.0, K: 1.0, DST: 1.0 };
  const sf = !!params?.superFlex;
  const val = pos === 'DEF' ? base.DST : base[pos] ?? 1.0;
  return pos === 'QB' && sf ? val * 1.35 : pos === 'RB' && sf ? val * 0.95 : val;
}
function normPos(v, min, max) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return clamp((x - min) / Math.max(1, max - min), 0, 1);
}
function totalNeeds(n) {
  return Object.values(n).reduce((a, b) => a + (b || 0), 0) || 1;
}
function computeSharkScore(p, needs, params, strategy = 'balanced') {
  const w = DEFAULT_WEIGHTS[strategy] || DEFAULT_WEIGHTS.balanced;
  const vorN = normPos(p.vor, 0, 200);
  const adpN = normPos(p.valueVsADP, 0, 50);
  const riskN = 1 - clamp(p.injuryRisk * 0.6 + normPos(p.projStdDev, 0, 60) * 0.4, 0, 1);
  const needRaw = needs[p.pos] || 0;
  const needN = clamp(needRaw / Math.max(1, totalNeeds(needs)), 0, 1);
  const scarcity = clamp((scarcityForPos(p.pos, params) - 1.0) / 1.4, 0, 1);

  let score = 0;
  score += w.vor * vorN;
  score += w.adp * adpN;
  score += w.need * needN;
  score += w.scarcity * scarcity;
  score += w.risk * (1 - riskN);
  if (p.dropoff && p.dropoff > 10) score += 0.03;
  return score;
}

/* -------------------------
   Tiers / badges
   ------------------------- */
function inferTier(p) {
  if (p.raw?.tier) return p.raw.tier;
  const o = p.overall || 9999;
  if (o <= 24) return 'elite';
  if (o <= 72) return 'starter';
  return 'bench';
}
function riskBadge(p) {
  const r = p.injuryRisk;
  if (r >= 0.33) return '<span class="risk-tag">RIESGO</span>';
  if (r >= 0.2) return '<span class="risk-tag" style="opacity:.8">riesgo</span>';
  return '';
}

/* -------------------------
   Render base
   ------------------------- */
function ensureContainer() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    const e = el('div', '', '');
    e.id = CONTAINER_ID;
    document.body.prepend(e);
    return e;
  }
  return container;
}

function renderShell(container) {
  container.innerHTML = html`
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft - Tablero de Decisión
          </h4>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="btn-update-draft">
              <i class="bi bi-arrow-clockwise"></i> Actualizar
            </button>
          </div>
        </div>

        <form class="row g-3 mb-3" id="draft-controls">
          <div class="col-md-3">
            <label for="select-league" class="form-label">Liga</label>
            <select id="select-league" class="form-select">
              <option value="">Selecciona liga</option>
            </select>
          </div>
          <div class="col-md-2">
            <label for="select-position" class="form-label">Posición</label>
            <select id="select-position" class="form-select">
              <option value="TODAS">TODAS</option>
              ${POSITIONS.map((p) => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label for="select-expert" class="form-label">Experto</label>
            <select id="select-expert" class="form-select">
              <option value="">Selecciona experto</option>
            </select>
          </div>
          <div class="col-md-2">
            <label for="select-status" class="form-label">Status</label>
            <select id="select-status" class="form-select">
              <option value="LIBRE">LIBRE</option>
              <option value="TODOS">TODOS</option>
            </select>
          </div>
          <div class="col-md-2">
            <label for="input-bye" class="form-label">Bye condición</label>
            <input type="number" class="form-control" id="input-bye" placeholder="0" />
          </div>
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="chk-sleeperADP" />
              <label class="form-check-label" for="chk-sleeperADP">Sleeper ADP</label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-3 mb-2">
          <div id="ranks-updated-label" class="text-start"></div>
          <div id="adp-updated-label" class="text-start"></div>
        </div>

        <div id="draft-summary" class="mb-2"></div>

        <div id="board-root">
          <div id="pick-and-alts">
            <div id="draft-summary-top"></div>
            <div id="pick-now-wrap" class="mb-3"></div>
            <div class="row g-3" id="alternatives"></div>
          </div>

          <div class="mt-3" id="need-meter-wrap"></div>
          <div class="mt-2" id="tier-heatmap-wrap"></div>

          <div class="d-flex justify-content-between align-items-center mt-4 mb-2">
            <div class="btn-group" id="pos-filters"></div>
            <div>
              <select class="form-select form-select-sm" id="strategy-select" style="width:auto;display:inline-block;">
                <option value="safe">Estrategia: Seguro</option>
                <option value="balanced" selected>Estrategia: Balanceado</option>
                <option value="upside">Estrategia: Upside</option>
              </select>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-dark table-hover align-middle" id="players-table">
              <thead>
                <tr>
                  <th>Jugador</th><th>Pos</th><th>Team</th><th>Rank</th>
                  <th>ADP</th><th>ΔADP</th><th>VOR</th><th>Riesgo</th><th>Tier</th><th>Score</th><th></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  `;
}

/* -------------------------
   Render helpers
   ------------------------- */
function renderSummaryBadges(params) {
  const wrap = document.getElementById('draft-summary');
  if (!wrap) return;
  const badges = [];
  if (params?.scoring) badges.push(`<span class="badge bg-secondary">${params.scoring}</span>`);
  if (params?.superFlex) badges.push('<span class="badge bg-secondary">SuperFlex</span>');
  if (params?.dynasty) badges.push('<span class="badge bg-secondary">Dynasty</span>');
  if (params?.ADPdate) badges.push(`<span class="badge bg-secondary">ADP ${params.ADPdate}</span>`);
  wrap.innerHTML = badges.join(' ');
}
function renderNeedMeter(needs) {
  const meterWrap = document.getElementById('need-meter-wrap');
  if (!meterWrap) return;
  const total = totalNeeds(needs);
  meterWrap.innerHTML = `<div class="need-meter" id="need-meter">
    ${POSITIONS.map((pos) => {
      const t = (needs[pos] || 0) / total;
      const cls = t >= 0.5 ? 'high' : t >= 0.25 ? 'mid' : 'low';
      return `<div class="pos ${cls}">${pos}<br><small>${needs[pos] || 0} slots</small></div>`;
    }).join('')}
  </div>`;
}
function renderTierHeatmap(players) {
  const box = document.getElementById('tier-heatmap-wrap');
  if (!box) return;
  const byPos = groupBy(players, (p) => p.pos);
  const rows = POSITIONS.filter((pos) => byPos[pos])
    .map((pos) => {
      const dots = byPos[pos]
        .slice(0, 30)
        .map((p) => `<span class="heatmap-pos ${pos}" title="#${p.overall || ''} ${p.name}"></span>`)
        .join('');
      return `<div class="mb-1"><strong style="color:${POS_COLORS[pos]}">${pos}</strong> ${dots}</div>`;
    })
    .join('');
  box.innerHTML = rows || '';
}
function renderPickMain(top, params) {
  const wrap = document.getElementById('pick-now-wrap');
  if (!wrap) return;
  if (!top) {
    wrap.innerHTML = `<div class="text-muted">Sin candidatos.</div>`;
    return;
  }
  const risk = Math.round((top.injuryRisk || 0) * 100);
  const vor = top.vor || 0;
  const delta = top.valueVsADP || 0;
  const tier = inferTier(top);
  wrap.innerHTML = html`
    <div class="draft-pick-card" id="pick-now">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h4>${top.name}</h4>
          <div class="mb-1">
            <span class="badge" style="background:${POS_COLORS[top.pos] || '#444'}">${top.pos}</span>
            <span class="badge bg-secondary">${top.team}</span>
            ${top.bye ? `<span class="badge bg-secondary">Bye ${top.bye}</span>` : ''}
          </div>
          <div class="reason">${explainWhy(top, params)}</div>
        </div>
        <div class="text-end">
          <div class="mb-2">
            <span class="badge bg-dark">Rank #${top.overall || '—'}</span>
            <span class="badge bg-dark">VOR ${vor.toFixed(1)}</span>
            <span class="badge bg-dark">ΔADP +${delta}</span>
            <span class="badge bg-dark">Tier ${tier}</span>
          </div>
          <button class="btn btn-draft" data-action="queue" data-id="${top.id}">Añadir a cola</button>
        </div>
      </div>
      <div class="mt-3">
        <div class="progress" title="Confianza inversa al riesgo">
          <div class="progress-bar" style="width:${pct(1 - (top.injuryRisk || 0))}"></div>
        </div>
        <small class="text-muted">Riesgo estimado: ${risk}%</small>
      </div>
    </div>
  `;
}
function renderAltCard(containerId, p, label, params) {
  const node = document.getElementById(containerId);
  if (!node) return;
  if (!p) {
    node.innerHTML = '<div class="text-muted">—</div>';
    return;
  }
  node.innerHTML = html`
    <div class="alt-pick-card">
      <div class="d-flex justify-content-between">
        <div>
          <div class="fw-bold">${label}</div>
          <div class="mt-1">${p.name}</div>
          <div class="small text-muted">${p.team} · ${p.pos} · Rank #${p.overall || '—'}</div>
        </div>
        <div class="text-end">
          <div class="mb-2">
            <span class="badge bg-dark">VOR ${num(p.vor).toFixed(1)}</span>
            <span class="badge bg-dark">ΔADP +${num(p.valueVsADP)}</span>
          </div>
          <button class="btn btn-sm btn-accent" data-action="queue" data-id="${p.id}">A cola</button>
        </div>
      </div>
      <div class="mt-2">${riskBadge(p)}</div>
    </div>
  `;
}
function renderPosFilters(current = 'TODAS') {
  const wrap = document.getElementById('pos-filters');
  if (!wrap) return;
  const all = ['TODAS', ...POSITIONS];
  wrap.innerHTML = all
    .map((pos) => `<button type="button" class="btn btn-sm ${pos === current ? 'btn-accent' : 'btn-outline-secondary'} me-1" data-pos="${pos}">${pos}</button>`)
    .join('');
}
function renderTable(players) {
  const tbody = document.querySelector('#players-table tbody');
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  players.forEach((p) => {
    const tr = el('tr');
    tr.classList.add(`tier-${inferTier(p)}`);
    tr.innerHTML = html`
      <td>${p.name}</td>
      <td><span class="badge" style="background:${POS_COLORS[p.pos] || '#444'}">${p.pos}</span></td>
      <td>${p.team}</td>
      <td>${p.overall || '—'}</td>
      <td>${p.adpRank || '—'}</td>
      <td><span class="value-tag">+${num(p.valueVsADP)}</span></td>
      <td>${num(p.vor).toFixed(1)}</td>
      <td>${riskBadge(p)}</td>
      <td>${inferTier(p)}</td>
      <td>${num(p._score).toFixed(3)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-light" data-action="queue" data-id="${p.id}">Cola</button>
      </td>
    `;
    frag.appendChild(tr);
  });
  tbody.innerHTML = '';
  tbody.appendChild(frag);
}
function explainWhy(p, params) {
  const bits = [];
  if (p.valueVsADP >= 8) bits.push('Gran valor vs ADP');
  else if (p.valueVsADP >= 4) bits.push('Valor vs ADP');
  if (p.vor >= 20) bits.push('Mayor VOR disponible');
  if (p.dropoff && p.dropoff > 10) bits.push('Evita gran corte de tier');
  if (params?.superFlex && p.pos === 'QB') bits.push('SuperFlex favorece QBs');
  return bits.join(' · ') || 'Mejor combinación de valor y seguridad';
}

/* -------------------------
   Helpers
   ------------------------- */
function groupBy(arr, keyFn) {
  return arr.reduce((m, x) => {
    const k = keyFn(x);
    (m[k] = m[k] || []).push(x);
    return m;
  }, {});
}
function pickTopAlternatives(sorted) {
  if (!sorted.length) return { top: null, safe: null, balanced: null, upside: null };
  const top = sorted[0];
  const safe = [...sorted].sort((a, b) => (a.injuryRisk || 0) - (b.injuryRisk || 0))[0] || null;
  const upside = [...sorted].sort(
    (a, b) => (b.valueVsADP || 0) + (b.vor || 0) - ((a.valueVsADP || 0) + (a.vor || 0))
  )[0] || null;
  const balanced = sorted[1] || null;
  return { top, safe, balanced, upside };
}
function addToQueue(player) {
  try {
    const key = 'draft_queue';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    if (!arr.find((x) => x.id === player.id))
      arr.push({ id: player.id, name: player.name, pos: player.pos, team: player.team });
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {}
}

/* -------------------------
   Selector de LIGAS (robusto)
   ------------------------- */
async function populateLeagueSelect(selectEl) {
  // 1) Si tu app ya expone un helper visual (TomSelect), úsalo.
  try {
    if (typeof window.renderLeagueSelect === 'function') {
      await window.renderLeagueSelect('#select-league', {
        plugins: ['dropdown_input'],
        dropdownInput: false,
        create: false,
        persist: false,
        onChange() {
          try { localStorage.setItem('draftLeague', this.getValue?.() || ''); } catch (e) {}
        },
      });
      return;
    }
  } catch (_) {}

  // 2) Fallback: cargar ligas manuales del usuario + (opcional) endpoint genérico.
  const userId = await getUserIdFromClient().catch(() => null);
  const token = await getAccessTokenFromClient().catch(() => null);
  const leagues = [];

  // Manuales (backend propio)
  try {
    if (userId) {
      const arr = await fetchManualLeaguesByUser(userId, token);
      if (Array.isArray(arr)) {
        arr.forEach((l) => {
          leagues.push({
            id: String(l.league_id || l.id),
            label: l.name ? `${l.name} · (${l.league_id || l.id})` : String(l.league_id || l.id),
          });
        });
      }
    }
  } catch (e) {
    console.warn('No se pudieron cargar ligas manuales:', e);
  }

  // Endpoint genérico opcional (si existe en tu app)
  try {
    const res = await fetch('/api/leagues', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr)) {
        arr.forEach((l) => {
          const id = String(l.id || l.league_id);
          if (id && !leagues.find((x) => x.id === id)) {
            leagues.push({ id, label: l.name ? `${l.name} · (${id})` : id });
          }
        });
      }
    }
  } catch (_) {}

  // Pinta options
  if (leagues.length) {
    selectEl.innerHTML =
      `<option value="">Selecciona liga</option>` +
      leagues.map((l) => `<option value="${l.id}">${l.label}</option>`).join('');
  } else {
    selectEl.innerHTML = `<option value="">(no se encontraron ligas)</option>`;
  }

  // Restaurar último valor si existe
  try {
    const saved = localStorage.getItem('draftLeague');
    if (saved) selectEl.value = saved;
  } catch (_) {}
}

/* -------------------------
   Selector de EXPERTOS (robusto)
   ------------------------- */
async function populateExpertSelect(selectEl) {
  try {
    if (typeof window.renderExpertSelect === 'function') {
      await window.renderExpertSelect('#select-expert', {
        plugins: ['dropdown_input'],
        dropdownInput: false,
        create: false,
        persist: false,
        onChange() {
          try { localStorage.setItem('draftExpert', this.getValue?.() || ''); } catch (e) {}
        },
      });
      return;
    }
  } catch (_) {}

  // Fallback: endpoint genérico
  try {
    const res = await fetch('/api/experts');
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length) {
        selectEl.innerHTML =
          `<option value="">Selecciona experto</option>` +
          arr.map((x) => `<option value="${x.value || x.id || x.name}" data-id="${x.id || x.value || ''}">${x.label || x.name || x.value}</option>`).join('');
      } else {
        selectEl.innerHTML = `<option value="3701">Default (3701)</option>`;
      }
    } else {
      selectEl.innerHTML = `<option value="3701">Default (3701)</option>`;
    }
  } catch (_) {
    selectEl.innerHTML = `<option value="3701">Default (3701)</option>`;
  }

  try {
    const saved = localStorage.getItem('draftExpert');
    if (saved) selectEl.value = saved;
  } catch (_) {}
}

/* -------------------------
   MAIN (export)
   ------------------------- */
export default async function renderDraftPro() {
  const container = ensureContainer();
  renderShell(container);

  // refs
  const leagueSel   = document.getElementById('select-league');
  const expertSel   = document.getElementById('select-expert');
  const positionSel = document.getElementById('select-position');
  const statusSel   = document.getElementById('select-status');
  const byeInput    = document.getElementById('input-bye');
  const sleeperChk  = document.getElementById('chk-sleeperADP');
  const btnUpdate   = document.getElementById('btn-update-draft');
  const strategySel = document.getElementById('strategy-select');

  // Poblado de selects
  await populateLeagueSelect(leagueSel);
  await populateExpertSelect(expertSel);

  // Restaurar prefs
  try {
    const savedPos = localStorage.getItem('draftPosition'); if (savedPos) positionSel.value = savedPos;
    const savedBye = localStorage.getItem('draftBye'); if (savedBye) byeInput.value = savedBye;
    const savedSleeper = localStorage.getItem('draftSleeperADP'); if (savedSleeper) sleeperChk.checked = savedSleeper === 'true';
  } catch (_) {}

  let currentPlayers = [];

  async function loadAndRender() {
    const leagueId     = (leagueSel?.value || '').toString().trim();
    const idExpert     = (expertSel?.dataset?.id || expertSel?.value || '3701').toString();
    const position     = (positionSel?.value || 'TODAS');
    const byeCondition = Number(byeInput?.value || 0);
    const sleeperADP   = !!sleeperChk?.checked;

    if (!leagueId) {
      document.getElementById('pick-now-wrap').innerHTML = `<div class="text-muted">Selecciona una liga y un experto para ver recomendaciones.</div>`;
      return;
    }

    try {
      showLoading('Cargando draft…');
      const payload = await fetchDraftData({
        baseUrl: DEFAULT_BASEURL,
        leagueId,
        position,
        idExpert,
        extraParams: { byeCondition, sleeperADP },
      });

      const params = payload?.params || {};
      renderSummaryBadges(params);

      const players = normalizePlayers(payload);
      currentPlayers = players.slice();

      const needs = computeNeeds(params, payload?.coach, players);
      renderNeedMeter(needs);

      // Score + sort
      players.forEach((p) => { p._score = computeSharkScore(p, needs, params, strategySel?.value || 'balanced'); });
      players.sort((a, b) => b._score - a._score);

      const { top, safe, balanced, upside } = pickTopAlternatives(players);
      renderPickMain(top, params);
      const altWrap = document.getElementById('alternatives');
      if (altWrap) {
        altWrap.innerHTML = `
          <div class="col-md-4"><div id="alt-safe"></div></div>
          <div class="col-md-4"><div id="alt-balanced"></div></div>
          <div class="col-md-4"><div id="alt-upside"></div></div>
        `;
      }
      renderAltCard('alt-safe', safe, 'Seguro', params);
      renderAltCard('alt-balanced', balanced, 'Equilibrado', params);
      renderAltCard('alt-upside', upside, 'Upside', params);

      renderTierHeatmap(players);
      renderPosFilters(position);
      renderTable(players);

      // Labels de actualización
      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        document.getElementById('ranks-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color:#1e1e1e;color:#fff;border:1px solid #333">
            <i class="bi bi-calendar-check-fill text-success"></i> Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>`;
      } else document.getElementById('ranks-updated-label').innerHTML = '';

      if (params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        document.getElementById('adp-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color:#1e1e1e;color:#fff;border:1px solid #333">
            <i class="bi bi-clock-history text-warning"></i> ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}
          </div>`;
      } else document.getElementById('adp-updated-label').innerHTML = '';

    } catch (err) {
      console.error('Error cargando draft:', err);
      showErrorMsg('No se pudo cargar datos del draft: ' + (err.message || err));
    } finally {
      hideLoading();
    }
  }

  // Eventos UI
  btnUpdate?.addEventListener('click', () => {
    try {
      localStorage.setItem('draftLeague', leagueSel.value || '');
      localStorage.setItem('draftExpert', expertSel.value || '');
      localStorage.setItem('draftPosition', positionSel.value || 'TODAS');
      localStorage.setItem('draftBye', byeInput.value || '0');
      localStorage.setItem('draftSleeperADP', !!sleeperChk.checked);
    } catch (_) {}
    loadAndRender();
  });

  document.getElementById('pos-filters')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pos]');
    if (!b) return;
    const pos = b.getAttribute('data-pos');
    renderPosFilters(pos);
    const filtered = pos === 'TODAS' ? currentPlayers : currentPlayers.filter((p) => p.pos === pos);
    renderTable(filtered);
  });

  document.getElementById('strategy-select')?.addEventListener('change', () => {
    const strat = document.getElementById('strategy-select').value;
    const needs = computeNeeds({}, null, currentPlayers);
    currentPlayers.forEach((p) => (p._score = computeSharkScore(p, needs, {}, strat)));
    currentPlayers.sort((a, b) => b._score - a._score);
    renderTable(currentPlayers);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="queue"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const p = currentPlayers.find((x) => x.id === id);
    if (!p) return;
    addToQueue(p);
    btn.textContent = 'En cola';
    btn.disabled = true;
  });

  // Primer render (si ya hay valores guardados dispara la carga)
  setTimeout(() => loadAndRender(), 120);
}
