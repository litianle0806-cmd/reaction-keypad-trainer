'use strict';

/* ================= 工具 ================= */
const $  = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const fmtDate  = ts => {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtClock = sec => {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60, p = n => String(n).padStart(2, '0');
  return `${p(m)}:${p(s)}`;
};

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function segInit(el, onPick) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('button', el).forEach(x => x.classList.toggle('on', x === b));
    onPick(b.dataset.v);
  });
}

/* ================= 评级 ================= */
function rxRating(ms) {
  if (ms <= 180) return { tag: 'SSS', label: '超凡', color: '#ffd166' };
  if (ms <= 215) return { tag: 'SS',  label: '闪电', color: '#ff9f43' };
  if (ms <= 250) return { tag: 'S',   label: '优秀', color: '#22e58c' };
  if (ms <= 290) return { tag: 'A',   label: '良好', color: '#5b8cff' };
  if (ms <= 330) return { tag: 'B',   label: '中等', color: '#a78bfa' };
  if (ms <= 400) return { tag: 'C',   label: '一般', color: '#8a93b5' };
  return { tag: 'D', label: '需要练习', color: '#ff5470' };
}
function kpRating(score) {
  if (score >= 200) return { tag: '键圣', label: '顶级水准', color: '#ffd166' };
  if (score >= 165) return { tag: '高手', label: '职业录入级', color: '#22e58c' };
  if (score >= 130) return { tag: '熟练', label: '岗位达标线', color: '#5b8cff' };
  if (score >= 95)  return { tag: '入门', label: '继续加油', color: '#a78bfa' };
  if (score >= 60)  return { tag: '新手', label: '熟能生巧', color: '#8a93b5' };
  return { tag: '见习', label: '刚开始', color: '#ff5470' };
}
function cpsRating(cps) {
  if (cps >= 12) return { tag: 'SSS', label: '神速连击', color: '#ffd166' };
  if (cps >= 10) return { tag: 'SS',  label: '极快', color: '#ff9f43' };
  if (cps >= 8)  return { tag: 'S',   label: '非常快', color: '#22e58c' };
  if (cps >= 6.5) return { tag: 'A',  label: '不错', color: '#5b8cff' };
  if (cps >= 5)  return { tag: 'B',   label: '中等', color: '#a78bfa' };
  if (cps >= 3.5) return { tag: 'C',  label: '一般', color: '#8a93b5' };
  return { tag: 'D', label: '慢慢来', color: '#ff5470' };
}
const MODE_NAME  = { single: '单次', five: '五连', choice: '选择' };
const INPUT_NAME = { mouse: '鼠标', enter: 'Enter' };

/* ================= Tab 切换 ================= */
let activeTab = 'reaction';
$$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
function switchTab(name) {
  if (name === activeTab) return;
  activeTab = name;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name !== 'reaction') RX.abort();
  if (name !== 'cps') CPS.abort();
  if (name !== 'keypad') KP.pause();
  if (name === 'stats') { renderStatsTab(); if (window.__INS) window.__INS.render(); }
}

/* ================= 反应力测试 ================= */
const RX = (() => {
  const area = $('#rx-area');
  const KEY = { history: 'rxHistory', best: 'rxBest' };
  let mode = 'five', input = 'mouse';
  let state = 'idle';   // idle | waiting | go | nogo | early | result | done
  let token = 0;        // 递增使挂起的定时器失效
  let goTs = 0;
  let seq = [], seqIdx = 0, events = [], times = [], mistakes = 0;
  let history = store.get(KEY.history, []);
  let best = store.get(KEY.best, { single: null, five: null, choice: null });

  const act = () => (input === 'mouse' ? '点击' : '按 Enter');

  function show(title, sub, cls) {
    area.className = 'rx-area' + (cls ? ' ' + cls : '');
    $('#rx-title').textContent = title;
    $('#rx-sub').innerHTML = sub || '';
  }
  function schedule(fn, ms) { const t = ++token; setTimeout(() => { if (t === token) fn(); }, ms); }

  function idleShow() {
    state = 'idle';
    const rule = mode === 'choice' ? `🟩 绿色立刻${act()} · 🟥 红色忍住别按` : `变绿后立刻${act()}`;
    show(input === 'enter' ? '按 Enter 开始' : '点击开始',
      `${rule}<br><span class="dim">${MODE_NAME[mode]}模式 · ${INPUT_NAME[input]}反应 · 抢跑作废本轮</span>`);
  }

  function buildSeq() {
    if (mode === 'single') return ['go'];
    if (mode === 'five') return ['go', 'go', 'go', 'go', 'go'];
    // 选择反应：5 绿 + 2 红，首位必为绿色
    const s = ['go', 'go', 'go', 'go', 'go', 'nogo', 'nogo'];
    for (let i = s.length - 1; i > 0; i--) {
      const j = 1 + Math.floor(Math.random() * i);
      [s[i], s[j]] = [s[j], s[i]];
    }
    s[0] = 'go';
    return s;
  }

  function startRun() {
    seq = buildSeq(); seqIdx = 0; events = []; times = []; mistakes = 0;
    renderChips();
    nextRound();
  }

  function nextRound() {
    if (seqIdx >= seq.length) { finishRun(); return; }
    state = 'waiting';
    show('等待…', `${mode === 'choice' ? '出现颜色：🟩 立刻' + act() + ' / 🟥 忍住' : '变绿后立刻' + act()}<br><span class="dim">第 ${seqIdx + 1} / ${seq.length} 轮</span>`, 'wait');
    schedule(() => {
      if (seq[seqIdx] === 'nogo') {
        state = 'nogo';
        show('🟥 红色', '忍住，别按！', 'nogo');
        schedule(() => { seqIdx++; nextRound(); }, 1200);
      } else {
        state = 'go';
        goTs = performance.now();
        show('🟩 现在！', '', 'go');
      }
    }, 1000 + Math.random() * 3000);
  }

  function react() {
    const ms = Math.round(performance.now() - goTs);
    times.push(ms); events.push({ ms }); seqIdx++;
    renderChips();
    state = 'result';
    const r = rxRating(ms);
    show(`${ms} ms`, `<b style="color:${r.color}">${r.tag} ${r.label}</b><br><span class="dim">${seqIdx < seq.length ? '稍后进入下一轮，也可立刻' + act() + '跳过' : '即将结算…'}</span>`, 'res');
    if (seqIdx >= seq.length) finishRun();
    else schedule(nextRound, 1100);
  }

  function nogoMistake() {
    mistakes++; events.push({ miss: true }); seqIdx++;
    renderChips();
    state = 'early';
    show('按错了 ❌', '红色不能按！稍后继续下一轮…', 'early');
    if (seqIdx >= seq.length) schedule(finishRun, 900);
    else schedule(nextRound, 1300);
  }

  function onInput(dev) {
    if (dev === 'mouse' && input === 'enter') { toast('当前为键盘模式：请按 Enter 键 ⌨️'); return; }
    if (dev === 'key' && input === 'mouse') return;
    token++; // 用户手动接管，作废挂起的自动跳转
    switch (state) {
      case 'idle':    startRun(); break;
      case 'waiting': state = 'early'; show('太早了 😅', `抢跑了！再${act()}一次重试本轮`, 'early'); break;
      case 'go':      react(); break;
      case 'nogo':    nogoMistake(); break;
      case 'early':   nextRound(); break;
      case 'result':  seqIdx < seq.length ? nextRound() : finishRun(); break;
      case 'done':    startRun(); break;
    }
  }

  function finishRun() {
    if (!times.length) { idleShow(); return; }
    state = 'done';
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const r = rxRating(avg);
    history.unshift({ ts: Date.now(), mode, input, avg, min, n: times.length, mistakes });
    history = history.slice(0, 30);
    if (best[mode] == null || avg < best[mode]) best[mode] = avg;
    store.set(KEY.history, history);
    store.set(KEY.best, best);
    renderHistory(); renderBest(); renderStatsTab();

    const extra = mistakes ? `<div class="warn">⚠ 误按红色 ${mistakes} 次</div>` : '';
    show(`${avg} ms`, `<b style="color:${r.color};font-size:22px">${r.tag} ${r.label}</b> · 最快 ${min}ms${extra}<br><span class="dim">再${act()}一次重新测试</span>`, 'done');
    $('#rx-avg').textContent = avg + ' ms';
    $('#rx-min').textContent = min + ' ms';
    $('#rx-rounds').textContent = `${times.length} 轮`;
    const rankEl = $('#rx-avg-rank');
    rankEl.textContent = `${r.tag} ${r.label}`;
    rankEl.style.color = r.color;
  }

  function renderChips() {
    $('#rx-chips').innerHTML = events.map(e =>
      e.miss ? '<span class="chip miss">❌</span>' : `<span class="chip">${e.ms}ms</span>`
    ).join('');
  }

  function renderBest() {
    $('#rx-best-single').textContent = best.single != null ? best.single + 'ms' : '--';
    $('#rx-best-five').textContent   = best.five   != null ? best.five   + 'ms' : '--';
    $('#rx-best-choice').textContent = best.choice != null ? best.choice + 'ms' : '--';
  }

  function renderHistory() {
    const chart = $('#rx-chart'), last = $('#rx-last');
    if (!history.length) {
      chart.innerHTML = '<div class="empty">暂无记录，先测一轮吧</div>';
      last.textContent = '';
      return;
    }
    const rows = history.slice(0, 14);
    const max = Math.max(...rows.map(h => h.avg));
    chart.innerHTML = rows.map(h => {
      const r = rxRating(h.avg);
      const hgt = Math.round(14 + (h.avg / max) * 86);
      return `<i class="bar" style="height:${hgt}%;background:${r.color}" title="${fmtDate(h.ts)} ${MODE_NAME[h.mode]}·${INPUT_NAME[h.input]} 平均 ${h.avg}ms"></i>`;
    }).join('');
    last.innerHTML = '最近：' + history.slice(0, 5)
      .map(h => `<span style="color:${rxRating(h.avg).color}">${h.avg}ms</span>`).join(' · ');
  }

  function abort() {
    token++;
    times = []; events = [];
    renderChips();
    idleShow();
  }

  segInit($('#rx-mode'),  v => { mode = v; abort(); });
  segInit($('#rx-input'), v => { input = v; abort(); });
  area.addEventListener('click', () => onInput('mouse'));

  renderBest(); renderHistory(); idleShow();
  return { onInput, abort };
})();

/* ================= 连击测试 ================= */
const CPS = (() => {
  const area = $('#cps-area');
  const KEY = { best: 'cpsBest' };
  const MIN_GAP = 8;   // 只挡住同一帧内的抖动；真实连击最短也在 50ms 以上
  let dur = 1;
  let state = 'idle';   // idle | count | running | done
  let token = 0;
  let presses = 0, times = [], lastDown = 0;
  let startTs = 0, tick = null;
  let best = store.get(KEY.best, {});

  function show(cls, count, title, sub) {
    area.className = 'cps-area' + (cls ? ' ' + cls : '');
    $('#cps-count').textContent = count;
    $('#cps-title').textContent = title;
    $('#cps-sub').innerHTML = sub;
  }

  function idleShow() {
    state = 'idle';
    $('#cps-bar-wrap').classList.add('hidden');
    show('', '0', '按 Enter 开始',
      `测 ${dur} 秒内能连按多少次<br><span style="opacity:.7">按住不放不算，每次都要真实按下并松开</span>`);
  }

  function startRun() {
    const t = ++token;
    state = 'count';
    presses = 0; times = []; lastDown = 0;
    let n = 3;
    show('armed', n, '准备…', '别提前按，倒计时结束才开始计数');
    n--;
    setTimeout(function step() {
      if (t !== token) return;
      if (n > 0) {
        $('#cps-count').textContent = n;
        n--;
        setTimeout(step, 700);
      } else begin();
    }, 700);
  }

  function begin() {
    state = 'running';
    presses = 0; times = []; lastDown = 0;
    startTs = performance.now();
    $('#cps-bar-wrap').classList.remove('hidden');
    $('#cps-bar').style.width = '100%';
    show('go', '0', '开始！按 Enter', `剩余 ${dur} 秒`);
    tick = setInterval(tickFn, 50);
  }

  function tickFn() {
    const left = dur * 1000 - (performance.now() - startTs);
    $('#cps-bar').style.width = Math.max(0, left / (dur * 1000) * 100) + '%';
    if (left <= 0) end();
  }

  // 只有真实按下才算：过滤按住产生的自动重复
  function onKeyDown(e) {
    if (e.repeat) return;
    if (state === 'idle' || state === 'done') { startRun(); return; }
    if (state !== 'running') return;

    const now = performance.now();
    if (lastDown && now - lastDown < MIN_GAP) return;
    if (now - startTs > dur * 1000) return;
    lastDown = now;
    presses++;
    times.push(now);
    $('#cps-count').textContent = presses;
    const el = $('#cps-flash');
    el.classList.remove('on');
    void el.offsetWidth;   // 强制回流，让每次按键都重新触发动画
    el.classList.add('on');
  }

  function end() {
    if (state !== 'running') return;
    clearInterval(tick);
    tick = null;
    state = 'done';
    $('#cps-bar-wrap').classList.add('hidden');
    const cps = +(presses / dur).toFixed(2);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const minInt = gaps.length ? Math.round(Math.min(...gaps)) : null;
    const r = cpsRating(cps);

    const key = String(dur);
    const prev = best[key] || 0;
    const isRec = presses > prev;
    if (isRec) { best[key] = presses; store.set(KEY.best, best); }

    // 连击也存历史，供数据洞察使用
    let hist = store.get('cpsHistory', []);
    hist.unshift({ ts: Date.now(), dur, presses, cps, minInt, rating: r.tag });
    hist = hist.slice(0, 40);
    store.set('cpsHistory', hist);
    renderBest(); renderStatsTab();

    show('done', presses,
      `${cps} 次/秒`,
      `<b style="color:${r.color};font-size:20px">${r.tag} · ${r.label}</b>${isRec ? '　<span class="new-rec">🎉 新纪录！</span>' : ''}<br>
       <span style="opacity:.75">${dur} 秒共 ${presses} 次${minInt != null ? ` · 最短间隔 ${minInt}ms` : ''}</span><br>
       <span style="opacity:.6">按 Enter 再来一次</span>`);

    $('#cps-cps').textContent = cps + ' 次/秒';
    $('#cps-total').textContent = `${presses} 次`;
    $('#cps-minint').textContent = minInt != null ? minInt + ' ms' : '--';
    const rankEl = $('#cps-rank');
    rankEl.textContent = `${r.tag} ${r.label}`;
    rankEl.style.color = r.color;
  }

  function renderBest() {
    [1, 3, 5, 10].forEach(d => {
      const el = $('#cps-best-' + d);
      if (el) el.textContent = best[String(d)] ? `${best[String(d)]} 次` : '--';
    });
  }

  function abort() {
    token++;
    if (tick) { clearInterval(tick); tick = null; }
    $('#cps-cps').textContent = '--';
    $('#cps-total').textContent = '--';
    $('#cps-minint').textContent = '--';
    const rankEl = $('#cps-rank');
    rankEl.textContent = '--';
    rankEl.style.color = '';
    idleShow();
  }

  segInit($('#cps-dur'), v => { dur = +v; abort(); });
  area.addEventListener('click', () => {
    // 鼠标点击只用于开始；计数只认 Enter，避免两种输入混算
    if (state === 'idle' || state === 'done') startRun();
    else if (state === 'running') toast('连击测试只认 Enter 键 ⌨️');
  });

  renderBest(); idleShow();
  return { onKeyDown, abort, isActive: () => state === 'count' || state === 'running' };
})();

/* ================= 小键盘练习 ================= */
const KP = (() => {
  const stageEl = $('#kp-stage');
  const overlay = $('#kp-overlay');
  const IDLE_HTML = stageEl.innerHTML;
  const KEY = { history: 'kpHistory', best: 'kpBest' };
  let cfg = { len: 'random', dur: 180 };
  let state = 'idle';   // idle | count | running | paused | done
  let token = 0;
  let groups = [], cur = 0;
  let st = { ok: 0, bad: 0, gOk: 0, gBad: 0 };
  let startTs = 0, accMs = 0, tick = null;
  let history = store.get(KEY.history, []);
  let best = store.get(KEY.best, { score: 0, kpm: 0 });

  const groupLen = () => (cfg.len === 'random' ? 6 + Math.floor(Math.random() * 15) : +cfg.len);

  function genGroup() {
    const n = groupLen(), digits = [];
    for (let i = 0; i < n; i++) digits.push(Math.floor(Math.random() * 10));
    return { digits, marks: Array(n).fill(null), pos: 0 };
  }

  function render() {
    while (groups.length < cur + 1) groups.push(genGroup());
    const g = groups[cur];
    if (!g) return;
    const wrap = document.createElement('div');
    wrap.className = 'kp-current';
    const no = document.createElement('span');
    no.className = 'gno';
    no.textContent = `第 ${cur + 1} 组 · ${g.digits.length} 位`;
    wrap.appendChild(no);
    const row = document.createElement('div');
    row.className = 'kp-digits';
    g.digits.forEach((d, j) => {
      const c = document.createElement('i');
      c.textContent = d;
      if (d === 0) c.classList.add('zero');
      if (g.marks[j]) c.classList.add(g.marks[j]);
      if (j === g.pos) c.classList.add('cursor');
      row.appendChild(c);
    });
    wrap.appendChild(row);
    stageEl.innerHTML = '';
    stageEl.appendChild(wrap);
    fitDigits(row);
  }

  // 按容器实际宽度自动缩放，保证长数字串也排成一行
  function fitDigits(row) {
    const digits = [...row.querySelectorAll('i')];
    if (!digits.length) return;
    const base = window.innerWidth <= 880 ? 52 : 88;
    const avail = stageEl.clientWidth - 48;
    let size = base;
    row.style.fontSize = size + 'px';
    let guard = 0;
    while (row.scrollWidth > avail && size > 24 && guard++ < 50) {
      size -= 2;
      row.style.fontSize = size + 'px';
    }
  }

  const elapsedMs = () => accMs + (startTs ? performance.now() - startTs : 0);

  function renderLive(finalMins) {
    const typed = st.ok + st.bad;
    const mins = finalMins != null ? finalMins : Math.max(elapsedMs() / 60000, 0.05);
    const kpm = Math.round(st.ok / mins);
    const acc = typed ? Math.round((st.ok / typed) * 100) : 100;
    $('#kp-typed').textContent = typed;
    $('#kp-ok').textContent = st.ok;
    $('#kp-bad').textContent = st.bad;
    $('#kp-gok').textContent = st.gOk;
    $('#kp-gbad').textContent = st.gBad;
    $('#kp-speed').textContent = kpm;
    $('#kp-kph').textContent = kpm * 60;
    $('#kp-acc').textContent = acc + '%';
    $('#kp-score').textContent = Math.round(kpm * acc / 100);
  }

  function renderBest() {
    $('#kp-best').textContent = best.score || '--';
    $('#kp-best-speed').textContent = best.kpm || '--';
  }

  function renderHistoryList() {
    const el = $('#kp-hist-list');
    if (!history.length) {
      el.innerHTML = '<p class="dim" style="margin:0">还没有记录，练一轮就有了</p>';
      return;
    }
    el.innerHTML = history.slice(0, 6).map(h => {
      const r = kpRating(h.score);
      return `<div class="kh-row">
        <span class="kh-time">${fmtDate(h.ts)}</span>
        <span class="kh-score" style="color:${r.color}">${h.score}</span>
        <span class="kh-meta">${h.kpm} 键/分 · ${h.acc}%</span>
      </div>`;
    }).join('');
  }

  function tickFn() {
    const remain = cfg.dur * 1000 - elapsedMs();
    $('#kp-clock').textContent = fmtClock(remain / 1000);
    $('#kp-bar').style.width = Math.min(100, elapsedMs() / (cfg.dur * 1000) * 100) + '%';
    renderLive();
    if (remain <= 0) end();
  }

  function startRun() {
    const t = ++token;
    groups = []; cur = 0;
    st = { ok: 0, bad: 0, gOk: 0, gBad: 0 };
    accMs = 0; startTs = 0;
    clearInterval(tick);
    stageEl.innerHTML = '';
    state = 'count';
    let n = 3;
    showOverlay(`<div class="ov-count">${n}</div>`);
    n--;
    setTimeout(function step() {
      if (t !== token) return;
      if (n > 0) { overlay.innerHTML = `<div class="ov-count">${n}</div>`; n--; setTimeout(step, 600); }
      else begin();
    }, 600);
  }

  function begin() {
    state = 'running';
    overlay.innerHTML = '';
    hideOverlay();
    render(); renderLive();
    startTs = performance.now();
    tick = setInterval(tickFn, 100);
    tickFn();
  }

  function pause() {
    if (state === 'running') {
      accMs += performance.now() - startTs; startTs = 0;
      clearInterval(tick);
      state = 'paused';
      showOverlay(`<div class="ov-num">⏸ 已暂停</div><p class="dim">计时已停止 · 按 <kbd>Enter</kbd> 或点击按钮继续</p><button class="btn-start" id="kp-ov-btn">继续 ▶</button><button class="btn-plain" id="kp-restart">放弃本轮，重新设置</button>`);
      $('#kp-ov-btn').addEventListener('click', resume);
      $('#kp-restart').addEventListener('click', resetIdle);
    } else if (state === 'count') {
      resetIdle();
    }
  }

  function resetIdle() {
    token++; state = 'idle';
    clearInterval(tick);
    startTs = 0; accMs = 0;
    st = { ok: 0, bad: 0, gOk: 0, gBad: 0 };
    overlay.innerHTML = '';
    hideOverlay();
    stageEl.innerHTML = IDLE_HTML;
    $('#kp-clock').textContent = fmtClock(cfg.dur);
    $('#kp-bar').style.width = '0';
    renderLive();
  }

  function resume() {
    if (state !== 'paused') return;
    hideOverlay();
    state = 'running';
    startTs = performance.now();
    tick = setInterval(tickFn, 100);
  }

  function end() {
    clearInterval(tick);
    // 用设定的时长而不是实际经过时间：后台标签页的定时器会被浏览器节流，
    // 结算可能晚触发十几秒，按实际时间算会把成绩压低。
    const mins = Math.max(Math.min(elapsedMs() / 60000, cfg.dur / 60), 0.05);
    startTs = 0;
    state = 'done';
    const kpm = Math.round(st.ok / mins);
    const acc = (st.ok + st.bad) ? Math.round(st.ok / (st.ok + st.bad) * 100) : 100;
    const score = Math.round(kpm * acc / 100);
    const r = kpRating(score);
    renderLive(mins);
    let rec = false;
    if (score > best.score) { best = { score, kpm }; rec = true; }
    store.set(KEY.best, best);
    history.unshift({ ts: Date.now(), dur: cfg.dur, kpm, acc, score, ok: st.ok, bad: st.bad, gOk: st.gOk, gBad: st.gBad });
    history = history.slice(0, 20);
    store.set(KEY.history, history);
    renderBest(); renderHistoryList(); renderStatsTab();
    showOverlay(`
      <div class="ov-title">⏰ 时间到！</div>
      <div class="ov-num">${score}<span class="unit">分</span></div>
      <div class="ov-rank" style="color:${r.color}">${r.tag} · ${r.label}</div>
      ${rec ? '<div class="new-rec">🎉 新纪录！</div>' : ''}
      <div class="ov-detail">速度 ${kpm} 键/分（${kpm * 60} KPH） · 正确率 ${acc}%<br>正确 ${st.ok} / 错误 ${st.bad} · 完成组 ${st.gOk}✓ ${st.gBad}✗</div>
      <button class="btn-start" id="kp-ov-btn">再来一次（按 Enter）</button>`);
    $('#kp-ov-btn').addEventListener('click', startRun);
  }

  function showOverlay(html) { overlay.innerHTML = html; overlay.classList.remove('hidden'); }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function onDigit(d) {
    if (state !== 'running') return;
    const g = groups[cur];
    if (!g || g.pos >= g.digits.length) return;
    g.marks[g.pos] = (String(g.digits[g.pos]) === d) ? 'ok' : 'bad';
    g.marks[g.pos] === 'ok' ? st.ok++ : st.bad++;
    g.pos++;
    if (g.pos >= g.digits.length) {
      g.marks.includes('bad') ? st.gBad++ : st.gOk++;
      cur++;
    }
    render(); renderLive();
  }

  function onStart() {
    if (state === 'running') { toast('练习进行中，请专心输入 💪'); return; }
    if (state === 'paused') { resume(); return; }
    startRun();
  }

  segInit($('#kp-len'), v => { cfg.len = v; });
  segInit($('#kp-dur'), v => {
    cfg.dur = +v;
    if (state === 'idle' || state === 'done') $('#kp-clock').textContent = fmtClock(cfg.dur);
  });
  $('#kp-start').addEventListener('click', onStart);
  $('#kp-hist-clear').addEventListener('click', () => {
    if (!confirm('确定清空本机所有小键盘练习记录？')) return;
    history = [];
    store.set(KEY.history, history);
    renderHistoryList(); renderStatsTab();
  });

  $('#kp-clock').textContent = fmtClock(cfg.dur);
  renderBest(); renderHistoryList(); renderLive();
  return { onStart, onDigit, pause, isPaused: () => state === 'paused' };
})();

/* ================= 全局按键 ================= */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // 小键盘暂停时可能停在别的标签页，Enter 仍应能继续
  if (e.key === 'Enter' && KP.isPaused()) { e.preventDefault(); KP.onStart(); return; }
  if (activeTab === 'reaction') {
    if (e.key === 'Enter') { e.preventDefault(); RX.onInput('key'); }
  } else if (activeTab === 'cps') {
    if (e.key === 'Enter') { e.preventDefault(); CPS.onKeyDown(e); }
  } else if (activeTab === 'keypad') {
    if (e.key === 'Enter') { e.preventDefault(); KP.onStart(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); KP.onDigit(e.key); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { RX.abort(); CPS.abort(); KP.pause(); }
});

/* ================= 记录页 ================= */
function renderStatsTab() {
  const rx = store.get('rxHistory', []);
  $('#st-rx-body').innerHTML = rx.length ? rx.map(h => {
    const r = rxRating(h.avg);
    return `<tr><td>${fmtDate(h.ts)}</td><td>${MODE_NAME[h.mode]}${h.mistakes ? ' ⚠' : ''}</td><td>${INPUT_NAME[h.input]}</td><td><b>${h.avg}ms</b></td><td>${h.min}ms</td><td style="color:${r.color}">${r.tag}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">暂无记录</td></tr>';

  const kp = store.get('kpHistory', []);
  $('#st-kp-body').innerHTML = kp.length ? kp.map(h => {
    const r = kpRating(h.score);
    return `<tr><td>${fmtDate(h.ts)}</td><td>${h.dur / 60} 分钟</td><td>${h.kpm}</td><td>${h.kpm * 60}</td><td>${h.acc}%</td><td><b>${h.score}</b></td><td style="color:${r.color}">${r.tag}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">暂无记录</td></tr>';

  const cpsBest = store.get('cpsBest', {});
  const el = $('#st-cps-bests');
  if (el) {
    el.innerHTML = [1, 3, 5, 10].map(d => {
      const v = cpsBest[String(d)];
      return `<span>${d} 秒 <b>${v ? v + ' 次' : '--'}</b></span>`;
    }).join('');
  }
}

$('#st-clear-rx').addEventListener('click', () => {
  if (!confirm('确定清空所有反应力记录？')) return;
  localStorage.removeItem('rxHistory'); localStorage.removeItem('rxBest');
  location.reload();
});
$('#st-clear-kp').addEventListener('click', () => {
  if (!confirm('确定清空所有小键盘记录？')) return;
  localStorage.removeItem('kpHistory'); localStorage.removeItem('kpBest');
  location.reload();
});
$('#st-clear-cps').addEventListener('click', () => {
  if (!confirm('确定清空连击最佳记录？')) return;
  localStorage.removeItem('cpsBest'); localStorage.removeItem('cpsHistory');
  location.reload();
});

/* ================= 数据洞察 ================= */
const INS = (() => {
  let view = 'rx';

  // 各视图的取值 / 单位 / 好坏方向 / 格式化
  const CFG = {
    rx: {
      label: '反应力', unit: 'ms', lowerBetter: true,
      name: '平均反应',
      get: () => store.get('rxHistory', []).map(h => ({
        ts: h.ts, v: h.avg, min: h.min, mode: MODE_NAME[h.mode],
        input: INPUT_NAME[h.input], tag: rxRating(h.avg).tag, color: rxRating(h.avg).color,
        detail: `${MODE_NAME[h.mode]}·${INPUT_NAME[h.input]}`
      }))
    },
    cps: {
      label: '连击', unit: '次/秒', lowerBetter: false,
      name: '每秒连击',
      get: () => store.get('cpsHistory', []).map(h => ({
        ts: h.ts, v: h.cps, presses: h.presses, dur: h.dur,
        tag: h.rating, color: cpsRating(h.cps).color,
        detail: `${h.dur} 秒 · ${h.presses} 次`
      }))
    },
    kp: {
      label: '小键盘', unit: '分', lowerBetter: false,
      name: '综合评分',
      get: () => store.get('kpHistory', []).map(h => ({
        ts: h.ts, v: h.score, kpm: h.kpm, acc: h.acc,
        tag: kpRating(h.score).tag, color: kpRating(h.score).color,
        detail: `${h.kpm} 键/分 · ${h.acc}%`
      }))
    }
  };

  // 按时间正序，取最近 20 条
  function series(cfg) {
    return cfg.get().slice(0, 20).reverse();
  }

  function stats(vals) {
    const n = vals.length;
    if (!n) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    if (n === 1) return { n, mean, min: vals[0], max: vals[0], sd: 0, cv: 0 };
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    return { n, mean, min: Math.min(...vals), max: Math.max(...vals), sd, cv: mean ? sd / mean : 0 };
  }

  // 波动越小越稳：用变异系数换算成 0-100 的稳定度
  const stableScore = cv => Math.round(Math.max(0, Math.min(100, (1 - cv / 0.35) * 100)));

  function renderMetrics(cfg, rows, st) {
    const box = $('#ins-metrics');
    if (!rows.length) { box.innerHTML = ''; return; }
    const unit = `<span class="u">${cfg.unit}</span>`;
    const best = cfg.lowerBetter ? st.min : st.max;
    // 与上一次相比
    let deltaHtml = '<span class="sub">仅一次记录</span>';
    if (rows.length >= 2) {
      const cur = rows[rows.length - 1].v, prev = rows[rows.length - 2].v;
      const diff = cur - prev;
      const good = cfg.lowerBetter ? diff < 0 : diff > 0;
      const sign = diff > 0 ? '+' : '';
      deltaHtml = `<span class="sub" style="color:${diff === 0 ? 'var(--dim)' : good ? 'var(--ok)' : 'var(--bad)'}">
        较上次 ${sign}${(+diff.toFixed(2))}${cfg.unit}</span>`;
    }
    const worst = cfg.lowerBetter ? st.max : st.min;
    const ss = stableScore(st.cv);

    box.innerHTML = `
      <div class="ins-metric"><span class="k">最佳成绩</span><b style="color:var(--gold)">${(+best.toFixed(2))}${unit}</b>
        <span class="sub">共 ${st.n} 次测试</span></div>
      <div class="ins-metric"><span class="k">平均值</span><b>${(+st.mean.toFixed(2))}${unit}</b>${deltaHtml}</div>
      <div class="ins-metric"><span class="k">${cfg.lowerBetter ? '最慢' : '最低'}</span><b style="color:var(--warn)">${(+worst.toFixed(2))}${unit}</b>
        <span class="sub">波动区间 ${(+(st.max - st.min).toFixed(2))}${cfg.unit}</span></div>
      <div class="ins-metric"><span class="k">发挥稳定度</span><b style="color:${ss >= 75 ? 'var(--ok)' : ss >= 45 ? 'var(--acc)' : 'var(--bad)'}">${ss}<span class="u">/100</span></b>
        <span class="sub">变异系数 ${(st.cv * 100).toFixed(1)}%</span></div>
      <div class="ins-metric"><span class="k">达标水平</span><b>${rows.filter(r => cfg.lowerBetter ? r.v <= st.mean : r.v >= st.mean).length}<span class="u">/${st.n}</span></b>
        <span class="sub">不低于自身均值</span></div>`;
  }

  function renderTrend(cfg, rows, st) {
    const box = $('#ins-trend'), axis = $('#ins-axis');
    $('#ins-trend-title').textContent = `${cfg.name}趋势（最近 ${rows.length} 次）`;
    if (!rows.length) {
      box.innerHTML = '<div class="empty">暂无数据</div>';
      axis.innerHTML = '';
      return;
    }
    const vals = rows.map(r => r.v);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || Math.abs(hi) || 1;
    // 留出上下边距，别让柱子顶满或贴底
    box.innerHTML = rows.map((r, i) => {
      const pct = 12 + ((r.v - lo) / span) * 82;
      return `<div class="col" title="${fmtDate(r.ts)} ${r.detail} → ${r.v}${cfg.unit}">
        <i style="height:${pct}%;background:${r.color}"></i>
      </div>`;
    }).join('');
    // 数值标注只显示最高/最低，避免拥挤
    const maxIdx = vals.indexOf(hi), minIdx = vals.indexOf(lo);
    const cols = [...box.children];
    if (cols[maxIdx]) cols[maxIdx].insertAdjacentHTML('beforeend', `<span style="top:-14px">${(+hi.toFixed(1))}</span>`);
    if (cols[minIdx] && minIdx !== maxIdx) cols[minIdx].insertAdjacentHTML('beforeend', `<span>${(+lo.toFixed(1))}</span>`);

    axis.innerHTML = rows.map((r, i) => {
      // 只标首、中、尾，避免挤在一起
      const label = (i === 0 || i === rows.length - 1 || (rows.length > 4 && i === Math.floor(rows.length / 2)))
        ? fmtDate(r.ts).split(' ')[0] : '';
      return `<span>${label}</span>`;
    }).join('');
  }

  function renderStability(cfg, st) {
    const box = $('#ins-stability');
    if (!st) { box.innerHTML = '<p class="stab-empty">暂无数据</p>'; return; }
    const ss = stableScore(st.cv);
    const sdRatio = Math.min(100, (st.cv / 0.35) * 100);
    // 相对最佳成绩的差距
    const best = cfg.lowerBetter ? st.min : st.max;
    const gap = cfg.lowerBetter ? (st.mean - best) / best : (best - st.mean) / best;
    const gapPct = Math.min(100, Math.max(0, gap * 100));

    const tone = cfg.lowerBetter
      ? (gap < 0.1 ? '你的平均值很接近最好水平，状态很稳。'
        : gap < 0.25 ? `平均比最好成绩慢 ${(gap * 100).toFixed(0)}%，还有收窄空间。`
          : `平均比最好成绩慢 ${(gap * 100).toFixed(0)}%，说明偶发的慢记录拉低了整体。`)
      : (gap < 0.1 ? '你的平均值很接近最好水平，状态很稳。'
        : gap < 0.25 ? `平均比最好成绩低 ${(gap * 100).toFixed(0)}%，还有提升空间。`
          : `平均比最好成绩低 ${(gap * 100).toFixed(0)}%，说明发挥不够稳定。`);

    box.innerHTML = `
      <div class="stab-row">
        <div class="k"><span>稳定度</span><b>${ss} / 100</b></div>
        <div class="stab-bar"><i style="width:${ss}%;background:${ss >= 75 ? 'var(--ok)' : ss >= 45 ? 'var(--acc)' : 'var(--bad)'}"></i></div>
      </div>
      <div class="stab-row">
        <div class="k"><span>离散程度（越小越稳）</span><b>${(st.cv * 100).toFixed(1)}%</b></div>
        <div class="stab-bar"><i style="width:${Math.max(3, 100 - sdRatio)}%;background:linear-gradient(90deg,var(--acc),var(--acc2))"></i></div>
      </div>
      <div class="stab-row">
        <div class="k"><span>平均值距最佳</span><b>${(gap * 100).toFixed(1)}%</b></div>
        <div class="stab-bar"><i style="width:${Math.max(3, 100 - gapPct)}%;background:var(--gold)"></i></div>
      </div>
      <p class="stab-note">${tone}<br>
      最佳 ${(+best.toFixed(2))}${cfg.unit} · 平均 ${(+st.mean.toFixed(2))}${cfg.unit} · 波动 ${(+(st.sd).toFixed(2))}${cfg.unit}</p>`;
  }

  function renderRecent(cfg, rows) {
    const box = $('#ins-recent');
    if (!rows.length) { box.innerHTML = '<p class="empty">暂无记录，先去测几次</p>'; return; }
    const best = cfg.lowerBetter
      ? Math.min(...rows.map(r => r.v)) : Math.max(...rows.map(r => r.v));
    box.innerHTML = rows.slice(-5).reverse().map(r => `
      <div class="rec-row${r.v === best ? ' best-row' : ''}">
        <span class="t">${fmtDate(r.ts)}</span>
        <span class="v">${r.detail}</span>
        <span class="v" style="color:${r.color};font-weight:700">${r.v.toFixed(2)}<span class="u" style="font-size:10px;color:var(--dim)"> ${cfg.unit}</span></span>
        <span class="rk" style="color:${r.color}">${r.tag}</span>
      </div>`).join('');
  }

  function render() {
    const cfg = CFG[view];
    const rows = series(cfg);
    const st = stats(rows.map(r => r.v));
    const hint = $('#ins-hint');

    const total = cfg.get().length;
    hint.textContent = total === 0
      ? `${cfg.label}还没有记录，先去测几次就能看到趋势`
      : total === 1
        ? `目前只有 1 次${cfg.label}记录，再测几次才能看出趋势和波动`
        : `${cfg.label}共 ${total} 次记录，下方显示最近 ${rows.length} 次`;

    renderMetrics(cfg, rows, st);
    renderTrend(cfg, rows, st);
    renderStability(cfg, st);
    renderRecent(cfg, rows);
  }

  $('#ins-switch').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('button', $('#ins-switch')).forEach(x => x.classList.toggle('on', x === b));
    view = b.dataset.v;
    render();
  });

  return { render };
})();
window.__INS = INS;
INS.render();

renderStatsTab();
