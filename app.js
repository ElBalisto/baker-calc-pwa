/* Small localStorage helper */
const LS = {
  get(key, def) { try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : def; } catch { return def; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });
  restoreValues();
  wireWater(); wireStarter(); wireBulk(); wireSettings();
  computeWater(); computeStarter(); computeBulk();

  setupInstall();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  }
});

/* ---------- Math engine ---------- */
function waterTempC(ddt, room, flour, prefermentEnabled, pref, method, customFriction) {
  const frictionMap = { hand: 1.0, planetary: 9.0, spiral: 11.0 };
  const friction = method === 'custom' ? (Number(customFriction) || 0) : (frictionMap[method] ?? 1.0);
  const n = prefermentEnabled ? 4.0 : 3.0;
  const sum = room + flour + (prefermentEnabled ? pref : 0) + friction;
  return ddt * n - sum;
}
function starterPeakHours({ seed, flour, water, tempC, flourType, k, alpha, Q10, Tref }) {
  const total = seed + flour + water;
  const inoc = total > 0 ? seed / total : 0.2;
  const hydration = flour > 0 ? (water / flour) * 100 : 100;
  const flourFactor = (flourType === 'white') ? 1.0 : 0.85;
  const hydrationFactor = (hydration >= 90) ? 1.00 : (hydration >= 70 ? 1.07 : 1.15);
  const inocClamped = Math.min(Math.max(inoc, 0.01), 0.5);
  const tempFactor = Math.pow(Q10, (Tref - tempC) / 10.0);
  const hours = k * Math.pow(inocClamped, -alpha) * tempFactor * flourFactor * hydrationFactor;
  return { hours, inocPct: inocClamped * 100, hydrationPct: hydration };
}
function bulkHours({ starterPct, ddtC, flourType, hydrBand, saltPct, c, beta, Q10 }) {
  const flourFactor = (flourType === 'white') ? 1.0 : 0.9;
  const hydrationFactor = hydrBand === 'stiff' ? 1.10 : (hydrBand === 'high' ? 0.90 : 1.00);
  const saltFactor = saltPct >= 3.0 ? 1.10 : (saltPct >= 2.3 ? 1.05 : 1.00);
  const tref = 26.0;
  const sp = Math.max(starterPct, 1.0);
  const tempFactor = Math.pow(Q10, (tref - ddtC) / 10.0);
  return c * Math.pow(sp / 100.0, -beta) * tempFactor * flourFactor * hydrationFactor * saltFactor;
}

/* ---------- Water ---------- */
function wireWater() {
  ['w_ddt','w_room','w_flour','w_pref_on','w_pref','w_method','w_custom'].forEach(id =>
    document.getElementById(id).addEventListener('input', computeWater)
  );
  document.getElementById('w_method').addEventListener('change', () => {
    const show = document.getElementById('w_method').value === 'custom';
    document.getElementById('w_custom_wrap').classList.toggle('hidden', !show);
    computeWater();
  });
  document.getElementById('w_pref_on').addEventListener('change', () => {
    const on = document.getElementById('w_pref_on').checked;
    document.getElementById('w_pref_wrap').classList.toggle('hidden', !on);
    computeWater();
  });
}
function computeWater() {
  const ddt = num('w_ddt'), room = num('w_room'), flour = num('w_flour');
  const prefOn = document.getElementById('w_pref_on').checked;
  const pref = num('w_pref');
  const method = val('w_method');
  const custom = num('w_custom');
  const wt = waterTempC(ddt, room, flour, prefOn, pref, method, custom);
  document.getElementById('w_out').textContent = `${wt.toFixed(1)} °C`;
  const note = document.getElementById('w_note');
  note.textContent = ''; note.classList.remove('warning');
  if (wt < 0) { note.textContent = 'Very cold water—use ice/chilled water to hit DDT.'; note.classList.add('warning'); }
  else if (wt > 60) { note.textContent = 'Very warm water—recheck inputs/friction.'; note.classList.add('warning'); }
  LS.set('water', { ddt, room, flour, prefOn, pref, method, custom });
}

/* ---------- Starter ---------- */
function wireStarter() {
  ['s_seed','s_flour','s_water','s_temp','s_flourtype'].forEach(id =>
    document.getElementById(id).addEventListener('input', computeStarter)
  );
}
function computeStarter() {
  const k = num('set_st_k'), alpha = num('set_st_a'), Q10 = num('set_q10'), Tref = num('set_st_tref');
  const seed = num('s_seed'), flour = num('s_flour'), water = num('s_water');
  const tempC = num('s_temp'), flourTypeSel = val('s_flourtype');
  const flourType = (flourTypeSel === 'white') ? 'white' : 'whole';
  const { hours, inocPct, hydrationPct } = starterPeakHours({ seed, flour, water, tempC, flourType, k, alpha, Q10, Tref });
  document.getElementById('s_out').textContent = `${hours.toFixed(1)} h`;
  document.getElementById('s_inoc').textContent = inocPct.toFixed(1);
  document.getElementById('s_hydr').textContent = hydrationPct.toFixed(0);
  LS.set('starter', { seed, flour, water, tempC, flourType: flourTypeSel });
}

/* ---------- Bulk ---------- */
function wireBulk() {
  ['b_sp','b_ddt','b_flourtype','b_hydr_band','b_salt'].forEach(id =>
    document.getElementById(id).addEventListener('input', computeBulk)
  );
}
function computeBulk() {
  const c = num('set_b_c'), beta = num('set_b_b'), Q10 = num('set_q10');
  const starterPct = num('b_sp'), ddtC = num('b_ddt'), flourTypeSel = val('b_flourtype');
  const hydrBand = val('b_hydr_band'), saltPct = num('b_salt');
  const flourType = (flourTypeSel === 'white') ? 'white' : 'whole';
  const hours = bulkHours({ starterPct, ddtC, flourType, hydrBand, saltPct, c, beta, Q10 });
  document.getElementById('b_out').textContent = `${hours.toFixed(1)} h`;
  LS.set('bulk', { starterPct, ddtC, flourType: flourTypeSel, hydrBand, saltPct });
}

/* ---------- Settings ---------- */
function wireSettings() {
  ['set_st_k','set_st_a','set_q10','set_st_tref','set_b_c','set_b_b'].forEach(id =>
    document.getElementById(id).addEventListener('input', () => { saveSettings(); computeStarter(); computeBulk(); })
  );
}
function saveSettings() {
  const settings = {
    st_k: num('set_st_k'), st_a: num('set_st_a'),
    q10: num('set_q10'), st_tref: num('set_st_tref'),
    b_c: num('set_b_c'), b_b: num('set_b_b')
  };
  LS.set('settings', settings);
}
function restoreValues() {
  const S = LS.get('settings', null);
  if (S) { setVal('set_st_k', S.st_k); setVal('set_st_a', S.st_a); setVal('set_q10', S.q10); setVal('set_st_tref', S.st_tref); setVal('set_b_c', S.b_c); setVal('set_b_b', S.b_b); }
  const W = LS.get('water', null);
  if (W) { setVal('w_ddt', W.ddt); setVal('w_room', W.room); setVal('w_flour', W.flour); setChecked('w_pref_on', W.prefOn); setVal('w_pref', W.pref); setVal('w_method', W.method); setVal('w_custom', W.custom);
    document.getElementById('w_pref_wrap').classList.toggle('hidden', !W.prefOn);
    document.getElementById('w_custom_wrap').classList.toggle('hidden', W.method !== 'custom'); }
  const St = LS.get('starter', null);
  if (St) { setVal('s_seed', St.seed); setVal('s_flour', St.flour); setVal('s_water', St.water); setVal('s_temp', St.tempC); setVal('s_flourtype', St.flourType); }
  const B = LS.get('bulk', null);
  if (B) { setVal('b_sp', B.starterPct); setVal('b_ddt', B.ddtC); setVal('b_flourtype', B.flourType); setVal('b_hydr_band', B.hydrBand); setVal('b_salt', B.saltPct); }
}

/* ---------- PWA install button ---------- */
let deferredPrompt = null;
function setupInstall() {
  const btn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; btn.classList.remove('hidden'); });
  btn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; btn.classList.add('hidden'); });
}

/* Helpers */
function num(id) { return Number(document.getElementById(id).value); }
function val(id) { return document.getElementById(id).value; }
function setVal(id, v) { document.getElementById(id).value = v; }
function setChecked(id, v) { document.getElementById(id).checked = !!v; }
