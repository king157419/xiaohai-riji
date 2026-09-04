/* 小孩日记 · 逻辑。文案与数据全部在 content.js（window.XH），这里只负责渲染与状态。
   存储只有 localStorage 的 xh.diary 一项；地址带 ?fresh 时不读不写。零外部请求。 */
(function () {
  'use strict';
  const C = window.XH;
  const KEY = 'xh.diary';
  const SITE = 'https://xiaohai-riji.vercel.app';
  const FRESH = /[?&]fresh(?:[=&]|$)/.test(location.search);
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NUM = ['一', '二', '三', '四'];
  const SKY = {
    cover: { colors: ['#141830', '#2b2d4a'], dark: true },
    night: { colors: ['#0b1020', '#1c2541'], dark: true },
    paper: { colors: ['#f6f1e7', '#efe6d6'], dark: false, paper: true }
  };

  const app = document.getElementById('app');
  const skies = [document.getElementById('skyA'), document.getElementById('skyB')];
  let skyOn = -1;
  let state = newState();
  let current = null; // 正在显示的那篇日记

  function newState() { return { v: 1, date: null, picks: [], practice: null }; }

  /* ---------- 小工具 ---------- */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    }
    return el;
  }
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
  }
  function todayISO() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtDate(iso) {
    const parts = iso.split('-');
    return fill(C.diary.dateFmt, { m: Number(parts[1]), d: Number(parts[2]) });
  }
  function mount(el) {
    app.replaceChildren(el);
    window.scrollTo(0, 0);
  }
  function setSky(sky) {
    const nextIdx = skyOn === 0 ? 1 : 0;
    const next = skies[nextIdx];
    next.style.background = 'linear-gradient(180deg, ' + sky.colors[0] + ', ' + sky.colors[1] + ')';
    next.classList.add('show');
    if (skyOn >= 0) skies[skyOn].classList.remove('show');
    skyOn = nextIdx;
    document.body.classList.toggle('dark', !!sky.dark);
    document.body.classList.toggle('paper', !!sky.paper);
    document.body.style.background = sky.colors[1]; // 天色层之外（回弹、整页截图）也用同一色
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', sky.colors[0]);
  }

  /* ---------- 像素脸 ---------- */
  let faceSeq = 0;
  function makeFace(size) {
    const NS = 'http://www.w3.org/2000/svg';
    const id = 'xf' + (++faceSeq);
    const pad = Math.round(size * 0.16);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'face');
    svg.innerHTML =
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffb000"/><stop offset="1" stop-color="#ff9500"/></linearGradient>' +
      '<filter id="' + id + 'b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="0.32"/></filter></defs>';
    const gOff = document.createElementNS(NS, 'g');
    gOff.setAttribute('class', 'off');
    const gGlow = document.createElementNS(NS, 'g');
    gGlow.setAttribute('class', 'glow');
    gGlow.setAttribute('filter', 'url(#' + id + 'b)');
    const gLit = document.createElementNS(NS, 'g');
    gLit.setAttribute('class', 'lit');
    const cells = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const mk = function (fillv, inset, rx) {
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', x + inset);
          r.setAttribute('y', y + inset);
          r.setAttribute('width', 1 - inset * 2);
          r.setAttribute('height', 1 - inset * 2);
          r.setAttribute('rx', rx);
          r.setAttribute('fill', fillv);
          return r;
        };
        gOff.appendChild(mk('#262626', 0.1, 0.18));
        const gl = mk('#ffb000', 0.02, 0.3);
        gGlow.appendChild(gl);
        const li = mk('url(#' + id + 'g)', 0.1, 0.18);
        gLit.appendChild(li);
        cells.push([gl, li]);
      }
    }
    svg.appendChild(gOff);
    svg.appendChild(gGlow);
    svg.appendChild(gLit);
    const panel = h('div', { class: 'facepanel' }, svg);
    panel.style.padding = pad + 'px';
    panel.style.borderRadius = Math.round(size * 0.22) + 'px';
    function set(name) {
      const rows = C.faces[name] || C.faces.calm;
      rows.forEach(function (row, y) {
        for (let x = 0; x < 8; x++) {
          const on = row[x] === '#';
          cells[y * 8 + x].forEach(function (r) { r.classList.toggle('on', on); });
        }
      });
    }
    return { el: panel, set: set };
  }

  /* ---------- 存储 ---------- */
  function save(d) {
    if (FRESH) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, date: d.date, picks: d.picks, practice: d.practice }));
    } catch (e) { /* 存不了就算了 */ }
  }
  function load() {
    if (FRESH) return null;
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (!d || !Array.isArray(d.picks) || d.picks.length !== C.moments.length) return null;
      if (!d.picks.every(function (k, i) { return Number.isInteger(k) && !!C.moments[i].options[k]; })) return null;
      if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
      return d;
    } catch (e) { return null; }
  }

  /* ---------- 统计 ---------- */
  function tallies(picks) {
    const t = {};
    C.modeOrder.forEach(function (k) { t[k] = 0; });
    picks.forEach(function (k, i) { t[C.moments[i].options[k].mode]++; });
    return t;
  }
  function dominant(t) {
    if (t.free >= 4) return 'free';
    let best = null;
    ['scare', 'force', 'deny', 'refuse', 'later'].forEach(function (k) {
      if (best === null || t[k] > t[best]) best = k;
    });
    return best;
  }
  function tallyText(t) {
    return C.modeOrder
      .filter(function (k) { return t[k] > 0; })
      .map(function (k) { return fill(C.modes[k].tally, { n: t[k] }); })
      .join('，');
  }
  function quoted(s) { return String(s || '').trim().replace(/[。\s]+$/, ''); } // 引号里的句子不带句末句号
  function practiceLine(pr) {
    if (!pr || pr.skipped) return C.diary.skipped;
    if (pr.from) return fill(C.diary.rewrote, { from: quoted(pr.from), to: quoted(pr.to) });
    return fill(C.diary.said, { to: quoted(pr.to) });
  }
  function shareText(d) {
    const t = tallies(d.picks);
    const pr = d.practice;
    let line = C.diary.sharePracticeSkipped;
    if (pr && !pr.skipped) line = pr.from ? C.diary.sharePracticeRewrote : C.diary.sharePracticeSaid;
    return fill(C.diary.share, {
      date: fmtDate(d.date),
      tally: tallyText(t),
      practiceLine: line,
      url: SITE
    });
  }

  /* ---------- 复制 ---------- */
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    }
    legacyCopy(text);
    return Promise.resolve();
  }

  /* ---------- 公共块 ---------- */
  function about() {
    return h('details', { class: 'about' }, [h('summary', null, C.about.title)].concat(
      C.about.body.map(function (p) { return h('p', null, p); })
    ));
  }
  function foot(withGallery) {
    return h('footer', { class: 'foot' }, [
      h('p', { class: 'credit' }, C.about.credit),
      about(),
      withGallery ? h('p', null, h('a', { href: 'https://xiaoshijie.vercel.app', target: '_blank', rel: 'noopener' }, C.about.gallery)) : null
    ]);
  }

  /* ---------- 封面 ---------- */
  function renderCover() {
    state = newState();
    current = null;
    setSky(SKY.cover);
    const face = makeFace(96);
    face.set('calm');
    face.el.classList.add('breath');
    const saved = load();
    const sec = h('section', { class: 'screen cover' }, [
      h('div', { class: 'cover-main' }, [
        face.el,
        h('h1', { class: 'title' }, C.title),
        h('p', { class: 'tagline' }, C.tagline),
        h('p', { class: 'meta' }, C.introMeta),
        h('button', { class: 'btn primary big', type: 'button', onclick: function () { renderMoment(0); } }, C.startBtn),
        saved ? h('button', { class: 'link', type: 'button', onclick: function () { renderDiary(saved); } },
          fill(C.lastDiaryLink, { date: fmtDate(saved.date) })) : null
      ]),
      foot(false)
    ]);
    mount(sec);
  }

  /* ---------- 时刻页 ---------- */
  function renderMoment(i) {
    const m = C.moments[i];
    setSky({ colors: m.sky, dark: m.dark });
    const face = makeFace(56);
    face.set('calm');
    const noted = h('div', { class: 'noted', 'aria-live': 'polite' });
    const actions = h('div', { class: 'actions' });
    const optEls = m.options.map(function (o, k) {
      return h('button', { class: 'opt', type: 'button', onclick: function () { choose(k); } }, [
        h('span', { class: 'n', 'aria-hidden': 'true' }, NUM[k]),
        h('span', { class: 'txt' }, o.text)
      ]);
    });
    const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, C.moments.map(function (_, j) {
      return h('i', { class: j < i ? 'done' : j === i ? 'now' : '' });
    }));
    const sec = h('section', { class: 'screen moment' }, [
      h('header', { class: 'top' }, [
        h('div', { class: 'when' }, [h('span', { class: 'time' }, m.time), h('span', { class: 'name' }, m.name)]),
        dots,
        face.el
      ]),
      h('p', { class: 'scene' }, m.scene),
      h('p', { class: 'q' }, C.question),
      h('div', { class: 'opts' }, optEls),
      noted,
      actions
    ]);
    mount(sec);

    function choose(k) {
      if (state.picks[i] != null) return;
      state.picks[i] = k;
      const o = m.options[k];
      optEls.forEach(function (b, j) {
        b.disabled = true;
        b.classList.add(j === k ? 'chosen' : 'faded');
      });
      face.set(C.modes[o.mode].face);
      noted.appendChild(h('div', { class: 'lbl' }, C.noted));
      noted.appendChild(h('p', { class: 'dline' }, o.diary));
      requestAnimationFrame(function () { noted.classList.add('in'); });
      const last = i === C.moments.length - 1;
      const btn = h('button', {
        class: 'btn primary', type: 'button',
        onclick: function () { if (last) renderPractice(); else renderMoment(i + 1); }
      }, last ? C.toPracticeBtn : C.nextBtn);
      actions.appendChild(btn);
      setTimeout(function () {
        btn.focus({ preventScroll: true });
        btn.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
      }, REDUCED ? 0 : 350);
    }
  }

  /* ---------- 睡前练习 ---------- */
  function renderPractice() {
    setSky(SKY.night);
    const P = C.practice;
    const picks = state.picks
      .map(function (k, i) { return { i: i, k: k, m: C.moments[i], o: C.moments[i].options[k] }; })
      .filter(function (p) { return p.o.mode !== 'free'; });
    const allFree = picks.length === 0;
    let chosen = null;

    const detail = h('div', { class: 'detail', hidden: true });
    const ta = h('textarea', { placeholder: P.placeholder, rows: 3, 'aria-label': P.placeholder });
    const doneBtn = h('button', {
      class: 'btn primary', type: 'button', disabled: true,
      onclick: function () {
        finish({ skipped: false, mode: chosen ? chosen.o.mode : 'free', from: chosen ? chosen.o.text : null, to: ta.value.trim() });
      }
    }, P.done);
    const skipBtn = h('button', { class: 'btn', type: 'button', onclick: function () { finish({ skipped: true }); } }, P.skip);
    ta.addEventListener('input', function () { doneBtn.disabled = !ta.value.trim(); });

    function showHint(mode) {
      const hint = P.hints[mode];
      detail.replaceChildren(h('p', { class: 'hint' }, hint.hint), h('p', { class: 'example' }, hint.example), ta);
      detail.hidden = false;
    }

    const rows = picks.map(function (p) {
      const btn = h('button', { class: 'btn small', type: 'button' }, P.pick);
      const row = h('div', { class: 'pick' }, [
        h('span', { class: 'ptime' }, p.m.time),
        h('span', { class: 'ptext' }, p.o.text),
        btn
      ]);
      btn.addEventListener('click', function () {
        chosen = p;
        rows.forEach(function (r) {
          r.row.classList.toggle('chosen', r.p === p);
          r.row.classList.toggle('faded', r.p !== p);
        });
        showHint(p.o.mode);
        ta.focus({ preventScroll: true });
        detail.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
      });
      return { p: p, row: row };
    });

    const sec = h('section', { class: 'screen practice' }, [
      h('h2', null, P.title),
      h('p', { class: 'lead' }, allFree ? P.leadAllFree : P.lead),
      allFree ? null : h('div', { class: 'picks' }, rows.map(function (r) { return r.row; })),
      detail,
      h('div', { class: 'actions' }, [skipBtn, doneBtn])
    ]);
    mount(sec);
    if (allFree) showHint('free');
  }

  function finish(practice) {
    state.practice = practice;
    state.date = todayISO();
    save(state);
    renderDiary(state);
  }

  /* ---------- 日记页 ---------- */
  function renderDiary(d) {
    current = d;
    setSky(SKY.paper);
    const face = makeFace(56);
    face.set('sleep');
    const t = tallies(d.picks);
    const dom = dominant(t);
    const lines = d.picks.map(function (k, i) {
      const m = C.moments[i];
      return h('p', { class: 'line' }, [h('time', null, m.time), h('span', null, m.options[k].diary)]);
    });
    const copyBtn = h('button', { class: 'btn primary', type: 'button', onclick: doCopy }, C.diary.copyBtn);
    function doCopy() {
      copyText(shareText(d)).then(function () {
        copyBtn.textContent = C.diary.copied;
        setTimeout(function () { copyBtn.textContent = C.diary.copyBtn; }, 1600);
      });
    }
    const sec = h('section', { class: 'screen diary' }, [
      h('header', { class: 'dhead' }, [
        face.el,
        h('div', null, [h('h2', null, C.diary.title), h('div', { class: 'date' }, fmtDate(d.date))])
      ]),
      h('div', { class: 'entry' }, lines.concat([
        h('div', { class: 'close' }, [
          h('p', null, C.diary.tallyLead + tallyText(t) + '。'),
          h('p', null, C.diary.dominant[dom]),
          h('p', null, practiceLine(d.practice))
        ]),
        h('p', { class: 'sign' }, C.diary.signoff)
      ])),
      h('div', { class: 'card' }, [h('h3', null, C.diary.tomorrowTitle), h('p', null, C.diary.tomorrow[dom])]),
      h('div', { class: 'actions' }, [
        copyBtn,
        h('button', { class: 'btn', type: 'button', onclick: renderCover }, C.diary.againBtn)
      ]),
      foot(true)
    ]);
    mount(sec);
  }

  /* 给自动化测试留的只读窥孔 */
  window.__xh = {
    fresh: FRESH,
    state: function () { return state; },
    shareText: function () { return current ? shareText(current) : ''; }
  };

  renderCover();
})();
