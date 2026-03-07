// ── renderer.js ──
// Reads globals from data.js: ABI, MEM_LAYOUT, TRAP_OVERLAYS, spToVisualY, STEPS
// Manages: step (state), render(), go(), keyboard

let step = 0;

// ── Helpers ──
function parseHexAddr(addrStr) { return Number.parseInt(addrStr, 16); }
function fmtHex(v) { return '0x' + (v >>> 0).toString(16).padStart(8, '0'); }
function hex32(v) { return '0x' + ((v >>> 0).toString(16).padStart(8, '0')); }

function stackRegion(addr) {
  if (addr >= 0x80284ef0 && addr < 0x80285000) return 'TrapCtx1/KStack1';
  if (addr >= 0x80281ef0 && addr < 0x80282000) return 'TrapCtx0/KStack0';
  if (addr >= 0x80285000 && addr < 0x80287000) return 'KStack1';
  if (addr >= 0x80282000 && addr < 0x80284000) return 'KStack0';
  if (addr >= 0x80260000 && addr < 0x80261000) return 'TaskCtx/TCB';
  return 'Other';
}

function activeFrameOf(st) {
  if (!st || !st.callStack) return null;
  for (let i = st.callStack.length - 1; i >= 0; i--) {
    if (st.callStack[i].code) return st.callStack[i];
  }
  return null;
}

// ── PC 계산 ──
// CODE_PC_BASE (data.js 정의) 참조. base + curLine * 4 로 근사 계산.
function computePC(st) {
  if (typeof CODE_PC_BASE === 'undefined') return st.mode === 'U' ? st.regs.sepc : null;
  const frame = activeFrameOf(st);
  if (frame && frame.code) {
    const base = CODE_PC_BASE.get(frame.code);
    if (base != null) return base + frame.curLine * 4;
  }
  return st.mode === 'U' ? st.regs.sepc : null;
}

// ── Render memory boundary notes ──
function renderMemoryBoundaryNotes() {
  const box = document.getElementById('mem-boundary-notes');
  if (!box) return;
  box.innerHTML = '';
  MEM_LAYOUT.forEach(r => {
    const lowText = r.lowAddr || '—';
    const div = document.createElement('div');
    div.className = 'mem-note';
    div.textContent = `${r.label}: ${r.addr} → ${lowText}`;
    box.appendChild(div);
  });
}

// ── Render memory SVG ──
function renderMemory(activeSet, stateRegs) {
  const svg = document.getElementById('mem-svg');
  // viewBox height은 MEM_LAYOUT의 마지막 영역 bottom + 여백으로 결정
  const lastR = MEM_LAYOUT[MEM_LAYOUT.length - 1];
  const svgH  = lastR.y + lastR.h + 30;
  svg.setAttribute('viewBox', `0 0 260 ${svgH}`);
  svg.innerHTML = '';
  const BAR_X = 60, BAR_W = 120;

  function el(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }
  function txt(x, y, content, cls, fill, anchor, fs) {
    const t = el('text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    if (cls)    t.setAttribute('class', cls);
    if (fill)   t.setAttribute('fill', fill);
    if (anchor) t.setAttribute('text-anchor', anchor);
    if (fs)     t.setAttribute('font-size', fs);
    t.textContent = content;
    svg.appendChild(t);
  }
  function rect(x, y, w, h, fill, stroke, sw, pulse) {
    const r = el('rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', fill);
    r.setAttribute('stroke', stroke || '#2d3748');
    r.setAttribute('stroke-width', sw || '0.5');
    r.setAttribute('rx', '2');
    if (pulse) r.classList.add('mem-pulse');
    svg.appendChild(r);
    return r;
  }

  const defs = el('defs');
  defs.innerHTML = `
    <marker id="arr-sp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L0,6 L6,3 z" fill="#d29922"/>
    </marker>
    <marker id="arr-sc" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L0,6 L6,3 z" fill="#00bcd4"/>
    </marker>`;
  svg.appendChild(defs);

  txt(BAR_X + BAR_W/2, 13, '↑ Free  0x88000000', 'mem-addr', '#4a5568', 'middle', '8');

  function zigzag(y) {
    const z = el('polyline');
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push(`${BAR_X + i*15},${y + (i%2===0?0:5)}`);
    z.setAttribute('points', pts.join(' '));
    z.setAttribute('fill', 'none'); z.setAttribute('stroke', '#4a5568');
    z.setAttribute('stroke-width', '1'); z.setAttribute('stroke-dasharray', '3,2');
    svg.appendChild(z);
  }
  zigzag(16);

  // app0과 첫 스택 영역 사이 갭에 zigzag
  const _app0  = MEM_LAYOUT.find(r => r.id === 'app0');
  const _stk1  = MEM_LAYOUT.find(r => r.id === 'ustack1');
  if (_app0 && _stk1) {
    const gapY = Math.round(_app0.y + _app0.h + (_stk1.y - _app0.y - _app0.h) / 2) - 3;
    zigzag(gapY);
    txt(BAR_X + BAR_W + 3, gapY + 7, '···', 'mem-addr', '#4a5568', 'start', '8');
  }

  MEM_LAYOUT.forEach(r => {
    const isActive = activeSet.includes(r.id);
    rect(BAR_X, r.y, BAR_W, r.h, r.color, isActive ? '#ffd700' : '#2d3748', isActive ? '2' : '0.5', isActive);

    // 레이블: 영역이 충분히 크면 중앙, 작으면 위쪽
    const midY  = r.y + r.h / 2;
    const fs    = r.h >= 40 ? '10' : r.h >= 22 ? '9' : '8';
    txt(BAR_X + BAR_W/2, midY + 4, r.label, 'mem-label', null, 'middle', fs);

    // 상단 주소 (오른쪽)
    txt(BAR_X + BAR_W + 3, r.y + 7, r.addr, 'mem-addr', isActive ? '#ffd700' : '#5a6270', 'start', '7.5');
    // 하단 주소 (오른쪽, 영역 bottom에 표시)
    if (r.lowAddr && r.h >= 22) {
      txt(BAR_X + BAR_W + 3, r.y + r.h - 2, r.lowAddr, 'mem-addr', '#3d4a5a', 'start', '7');
    }
  });

  // 커널 하단 경계 주소
  const kern = MEM_LAYOUT[MEM_LAYOUT.length - 1];
  txt(BAR_X + BAR_W + 3, kern.y + kern.h + 8, '→0x80200000', 'mem-addr', '#5a6270', 'start', '7.5');

  Object.entries(TRAP_OVERLAYS).forEach(([id, ov]) => {
    if (!activeSet.includes(id)) return;
    const parent = MEM_LAYOUT.find(r => r.id === ov.parent);
    if (!parent) return;
    rect(BAR_X, parent.y, BAR_W, ov.h, ov.color, '#fff', '1.5', true);
    txt(BAR_X + BAR_W/2, parent.y + ov.h/2 + 3, ov.label, 'mem-label', '#fff', 'middle', '9');
  });

  function drawArrow(y, x1, label, color, markerId) {
    const line = el('line');
    line.setAttribute('x1', x1); line.setAttribute('x2', BAR_X - 2);
    line.setAttribute('y1', y);  line.setAttribute('y2', y);
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.5');
    line.setAttribute('marker-end', 'url(#' + markerId + ')');
    svg.appendChild(line);
    txt(x1 - 2, y + 3, label, 'mem-addr', color, 'end', '9');
  }

  const spY = spToVisualY(stateRegs.x2);
  if (spY !== null) drawArrow(spY, 44, 'sp', '#d29922', 'arr-sp');
  const scY = spToVisualY(stateRegs.sscratch);
  if (scY !== null) drawArrow(scY, 26, 'sc', '#00bcd4', 'arr-sc');
  renderMemoryBoundaryNotes();
}

// ── Render registers ──
function renderRegs(regs, changed) {
  const grid = document.getElementById('reg-grid');
  grid.innerHTML = '';
  for (let i = 0; i < 32; i++) {
    const key = 'x' + i;
    const val = regs[key] || 0;
    const isChanged = changed.includes(key);
    const cell = document.createElement('div');
    cell.className = 'reg-cell' + (isChanged ? ' changed' : '');
    cell.innerHTML = `<span class="reg-name">${key}</span><span class="reg-abi">${ABI[i]}</span><span class="reg-val">0x${val.toString(16).padStart(8,'0')}</span>${isChanged ? '<span class="reg-star">★</span>' : ''}`;
    grid.appendChild(cell);
  }
  const csrGrid = document.getElementById('csr-grid');
  csrGrid.innerHTML = '';
  [['sepc','sepc'],['sstatus','sstatus'],['sscratch','sscratch']].forEach(([k, label]) => {
    const val = regs[k] || 0;
    const isChanged = changed.includes(k);
    const cell = document.createElement('div');
    cell.className = 'csr-cell' + (isChanged ? ' changed' : '');
    cell.innerHTML = `<span class="csr-name">${label}${isChanged ? '★' : ''}</span><span class="csr-val">0x${val.toString(16).padStart(8,'0')}</span>`;
    csrGrid.appendChild(cell);
  });
}

// ── Stack changes panel ──
function stackWritesForStep(stepIdx) {
  if (stepIdx <= 0) return [];
  const prev = STEPS[stepIdx - 1];
  const cur  = STEPS[stepIdx];
  const prevF = activeFrameOf(prev);
  const curF  = activeFrameOf(cur);
  if (!curF || curF.curLine == null || !curF.code) return [];

  let start = curF.curLine, end = curF.curLine - 1;
  if (prevF && prevF.file === curF.file && prevF.code === curF.code && prevF.curLine != null && curF.curLine > prevF.curLine) {
    start = prevF.curLine + 1;
    end = curF.curLine - 1;
  }
  if (!(prevF && prevF.file === curF.file && prevF.code === curF.code) && curF.curLine > 0) {
    start = 0; end = curF.curLine - 1;
  }

  let sp = (prev.regs && prev.regs.x2) || (cur.regs && cur.regs.x2) || 0;
  const a0 = (cur.regs && cur.regs.x10) || (prev.regs && prev.regs.x10) || 0;
  const rows = [];

  for (let i = start; i <= end; i++) {
    const line = ((curF.code[i] && curF.code[i].t) || '').trim();
    const ln = i + 1;
    const lineRows = [];
    if (/addi sp,\s*sp,\s*-34\*8/.test(line)) { sp -= 34*8; lineRows.push(`alloc TrapContext [${hex32(sp)}..${hex32(sp+34*8)}) @ ${stackRegion(sp)}`); }
    if (/sd x1,\s*1\*8\(sp\)/.test(line))   lineRows.push(`${hex32(sp+8)} <= x1(ra) @ ${stackRegion(sp+8)}`);
    if (/sd x3,\s*3\*8\(sp\)/.test(line))   lineRows.push(`${hex32(sp+24)} <= x3(gp) @ ${stackRegion(sp+24)}`);
    if (/\bSAVE_GP\b/.test(line))            lineRows.push(`save x5~x31 to TrapContext @ ${stackRegion(sp)}`);
    if (/sd t0,\s*32\*8\(sp\)/.test(line))  lineRows.push(`${hex32(sp+256)} <= sstatus @ ${stackRegion(sp+256)}`);
    if (/sd t1,\s*33\*8\(sp\)/.test(line))  lineRows.push(`${hex32(sp+264)} <= sepc @ ${stackRegion(sp+264)}`);
    if (/sd t2,\s*2\*8\(sp\)/.test(line))   lineRows.push(`${hex32(sp+16)} <= user_sp @ ${stackRegion(sp+16)}`);
    if (/sd ra,\s*0\(a0\)/.test(line))       lineRows.push(`${hex32(a0)} <= ra @ ${stackRegion(a0)}`);
    if (/sd sp,\s*8\(a0\)/.test(line))       lineRows.push(`${hex32(a0+8)} <= sp @ ${stackRegion(a0+8)}`);
    if (/\bSAVE_SN\b/.test(line))            lineRows.push(`save s0~s11 @ ${stackRegion(a0+16)}`);
    if (/addi sp,\s*sp,\s*34\*8/.test(line)) sp += 34*8;
    if (lineRows.length === 0) rows.push(`L${ln}: (no stack write)`);
    else lineRows.forEach(msg => rows.push(`L${ln}: ${msg}`));
  }
  return rows;
}

function renderStackChanges(stepIdx) {
  const box = document.getElementById('stack-change-box');
  if (!box) return;
  box.innerHTML = '';
  const rows = stackWritesForStep(stepIdx);
  if (rows.length === 0) {
    const div = document.createElement('div');
    div.className = 'stack-change-none';
    div.textContent = 'No stack write in this step';
    box.appendChild(div);
    return;
  }
  rows.forEach(text => {
    const div = document.createElement('div');
    div.className = 'stack-change-item';
    div.textContent = text;
    box.appendChild(div);
  });
}

// ── Render code call-stack panel ──
function renderCode(callStack) {
  const panel = document.getElementById('code-lines');
  panel.innerHTML = '';
  if (!callStack || callStack.length === 0) {
    panel.innerHTML = '<div style="padding:10px;color:#8b949e;font-size:12px">— 이 스텝은 하드웨어/개념적 동작입니다 —</div>';
    return;
  }
  callStack.forEach(frame => {
    const isActive = !!frame.code;
    const wrapper = document.createElement('div');
    wrapper.className = 'cf ' + (isActive ? 'active' : 'done');

    const head = document.createElement('div');
    head.className = 'cf-head';
    const badge = document.createElement('span');
    badge.className = 'cf-badge';
    badge.textContent = isActive ? 'ACTIVE' : 'DONE';
    head.appendChild(badge);
    head.appendChild(Object.assign(document.createElement('span'), {textContent: frame.file}));
    wrapper.appendChild(head);

    if (isActive) {
      const body = document.createElement('div');
      body.className = 'cf-body';
      frame.code.forEach((line, i) => {
        const div = document.createElement('div');
        let cls = 'normal';
        if (i === frame.curLine) cls = 'highlight';
        else if (i < frame.curLine) cls = 'done';
        else if (i > frame.curLine + 4) cls = 'dimmed';
        div.className = 'code-line ' + cls;
        div.innerHTML = `<span class="line-num">${i+1}</span><span class="line-text">${line.t.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>${i === frame.curLine ? '<span class="code-arrow">◄</span>' : ''}`;
        body.appendChild(div);
      });
      wrapper.appendChild(body);
      setTimeout(() => {
        const hl = body.querySelector('.highlight');
        if (hl) hl.scrollIntoView({block:'nearest', behavior:'smooth'});
      }, 50);
    } else {
      const dl = document.createElement('div');
      dl.className = 'cf-done-line';
      dl.textContent = '✓ ' + (frame.done || '');
      wrapper.appendChild(dl);
    }
    panel.appendChild(wrapper);
  });
}

// ── Render CPU state ──
// codeSt: 현재 스텝 (mode, task, PC 계산)
// stateSt: 이전 스텝 (sepc, sscratch 값 표시)
function renderCPU(codeSt, stateSt) {
  const modeEl = document.getElementById('c-mode');
  modeEl.textContent = codeSt.mode === 'U' ? 'U-mode (유저)' : 'S-mode (커널)';
  modeEl.className = 'cpu-val ' + (codeSt.mode === 'U' ? 'u-mode' : 's-mode');

  const taskEl = document.getElementById('c-task');
  taskEl.textContent = 'Task' + codeSt.task;
  taskEl.className = 'cpu-val task' + codeSt.task;

  // PC: 현재 실행 중인 명령 주소
  const pcEl = document.getElementById('c-pc-cur');
  if (pcEl) {
    const pcVal = computePC(codeSt);
    pcEl.textContent = pcVal != null ? '0x' + pcVal.toString(16).padStart(8, '0') : '—';
  }

  // sepc: 이전 스텝의 레지스터 값 (트랩 복귀 주소)
  document.getElementById('c-pc').textContent = '0x' + stateSt.regs.sepc.toString(16).padStart(8,'0');

  const scratchEl = document.getElementById('c-scratch');
  scratchEl.textContent = '0x' + stateSt.regs.sscratch.toString(16).padStart(8,'0');
  scratchEl.style.color = stateSt.changed.includes('sscratch') ? '#f0c040' : '';
}

// ── Main render ──
// 코드 패널 → STEPS[step]  (지금 이 명령이 실행될 예정)
// 레지스터/메모리 → STEPS[step-1]  (이 명령 실행 전 상태, 즉 이전 명령의 결과)
// Step 0은 예외: 초기 상태 그대로 표시
function render() {
  const codeSt  = STEPS[step];
  const stateSt = step > 0 ? STEPS[step - 1] : STEPS[0];

  document.getElementById('step-num').textContent   = `Step ${step+1} / ${STEPS.length}`;
  document.getElementById('step-title').textContent = codeSt.title;
  document.getElementById('step-file').textContent  = codeSt.file;

  renderCode(codeSt.callStack);
  document.getElementById('desc-text').textContent   = codeSt.desc;
  document.getElementById('desc-detail').textContent = codeSt.detail || '';

  renderCPU(codeSt, stateSt);
  renderRegs(stateSt.regs, stateSt.changed);
  renderStackChanges(step);
  renderMemory(stateSt.memActive, stateSt.regs);

  const pct = (step / (STEPS.length - 1)) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('btn-prev').disabled = step === 0;
  document.getElementById('btn-next').disabled = step === STEPS.length - 1;
}

function go(dir) {
  step = Math.max(0, Math.min(STEPS.length - 1, step + dir));
  render();
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   go(-1);
});

render();
