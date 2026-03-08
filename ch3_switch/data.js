// ── ch3_switch/data.js ──
// Globals consumed by shared/renderer.js: ABI, MEM_LAYOUT, TRAP_OVERLAYS, spToVisualY, STEPS

// ── Step 자동 확장 ──
// rawSteps의 curLine이 점프할 때 (3→7 등), 사이 줄들(4,5,6)을 중간 스텝으로 자동 삽입.
// 중간 스텝은 레지스터/메모리 변화 없음 — 코드 인디케이터만 한 줄씩 이동.
function _getActiveFrame(st) {
  if (!st || !st.callStack) return null;
  for (let i = st.callStack.length - 1; i >= 0; i--) {
    if (st.callStack[i].code) return st.callStack[i];
  }
  return null;
}

function _expandToLineSteps(rawSteps) {
  const result = [];
  for (let si = 0; si < rawSteps.length; si++) {
    const st      = rawSteps[si];
    const prevExp = result.length > 0 ? result[result.length - 1] : null;
    const afCur   = _getActiveFrame(st);
    const afPrev  = _getActiveFrame(prevExp);

    // 같은 코드 배열이고 줄 번호가 2 이상 점프했으면 중간 줄 삽입
    if (afCur && afPrev &&
        afCur.code === afPrev.code &&
        afCur.curLine > afPrev.curLine + 1) {

      for (let ln = afPrev.curLine + 1; ln < afCur.curLine; ln++) {
        const lineText = (afCur.code[ln] && afCur.code[ln].t.trim()) || '';
        result.push({
          title:     lineText || '—',
          file:      st.file,
          mode:      st.mode,
          task:      st.task,
          callStack: st.callStack.map((frame, fi) =>
            (fi === st.callStack.length - 1 && frame.code)
              ? { ...frame, curLine: ln }
              : frame
          ),
          desc:      '',
          detail:    '',
          regs:      prevExp.regs,
          changed:   [],
          memActive: prevExp.memActive,
        });
      }
    }
    result.push(st);
  }
  return result;
}

const ABI = ['zero','ra','sp','gp','tp','t0','t1','t2','s0','s1','a0','a1','a2','a3','a4','a5','a6','a7','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','t3','t4','t5','t6'];

// SVG viewBox: 0 0 260 480
const MEM_LAYOUT = [
  {id:'app1',    y:23,  h:45,  label:'App1 .text (128KB)', addr:'0x80420000', lowAddr:'0x80400000', color:'#40916c'},
  {id:'app0',    y:70,  h:45,  label:'App0 .text (128KB)', addr:'0x80400000', lowAddr:'0x803E0000', color:'#2d6a4f'},
  // zigzag gap at ~y=118
  {id:'ustack1', y:130, h:26,  label:'UStack1  4KB',       addr:'0x80286000', lowAddr:'0x80285000', color:'#6a1e55'},
  {id:'kstack1', y:158, h:72,  label:'KStack1  8KB',       addr:'0x80285000', lowAddr:'0x80283000', color:'#7b3f00'},
  {id:'ustack0', y:234, h:26,  label:'UStack0  4KB',       addr:'0x80283000', lowAddr:'0x80282000', color:'#6a1e55'},
  {id:'kstack0', y:263, h:72,  label:'KStack0  8KB',       addr:'0x80282000', lowAddr:'0x80280000', color:'#7b3f00'},
  {id:'kernel',  y:339, h:120, label:'Kernel .text+.bss',  addr:'0x80280000', lowAddr:'0x80200000', color:'#3a5a8c'},
];

const TRAP_OVERLAYS = {
  trapctx0: {parent:'kstack0', label:'TrapCtx0  272B', color:'#e85d04', h:18},
  trapctx1: {parent:'kstack1', label:'TrapCtx1  272B', color:'#e85d04', h:18},
  taskctx:  {parent:'kernel',  label:'TaskCtx',        color:'#f4c542', h:18},
};

function spToVisualY(sp) {
  const pts = [
    [0x80420000,  23], [0x80400000,  70], [0x803E0000, 115], // app1/app0 .text
    // gap (zigzag) between app and stack regions
    [0x80286000, 130], [0x80285000, 158], [0x80284EF0, 162],
    [0x80283000, 234], [0x80282000, 263], [0x80281EF0, 267],
    [0x80280000, 339], [0x80200000, 459],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0,y0] = pts[i], [a1,y1] = pts[i+1];
    if (sp <= a0 && sp >= a1) {
      const t = (a0 - sp) / (a0 - a1);
      return Math.round(y0 + t*(y1-y0));
    }
  }
  return null;
}

// ── Base register states ──
const BASE_REGS = {
  x0:0, x1:0x80400018, x2:0x80283000, x3:0x80280000, x4:0,
  x5:0, x6:0, x7:0, x8:0x80282ff0, x9:0, x10:0x00000001,
  x11:0, x12:0, x13:0, x14:0, x15:0, x16:0, x17:0,
  x18:0, x19:0, x20:0, x21:0, x22:0, x23:0, x24:0,
  x25:0, x26:0, x27:0, x28:0, x29:0, x30:0, x31:0,
  sepc:0x80400024, sstatus:0x00000000, sscratch:0x80282000, scause:0
};
const TASK1_REGS = {
  x0:0, x1:0, x2:0x80286000, x3:0, x4:0,
  x5:0, x6:0, x7:0, x8:0, x9:0, x10:0,
  x11:0, x12:0, x13:0, x14:0, x15:0, x16:0, x17:0,
  x18:0, x19:0, x20:0, x21:0, x22:0, x23:0, x24:0,
  x25:0, x26:0, x27:0, x28:0, x29:0, x30:0, x31:0,
  sepc:0x80420000, sstatus:0x00000000, sscratch:0x80285000, scause:0
};

function regs(base, changes) { return Object.assign({}, base, changes); }

// Shorthand helpers (all based on BASE_REGS after trap entry)
// rA: after csrrw (sp=KStack, sscratch=UStack)
// scause = 0x8000000000000000: MSB=1(인터럽트), 하위비트5(SupervisorTimer)
// JS Number 정밀도 한계로 하위 5비트 손실 → 0x8000000000000000으로 저장
const SCAUSE_TIMER = 0x8000000000000000;

function rA(extra) { return regs(BASE_REGS, Object.assign({sstatus:0x100, x2:0x80282000, sscratch:0x80283000, scause:SCAUSE_TIMER}, extra)); }
// rB: after addi sp,-34*8
function rB(extra) { return regs(BASE_REGS, Object.assign({sstatus:0x100, x2:0x80281EF0, sscratch:0x80283000, scause:SCAUSE_TIMER}, extra)); }
// rC: after reading CSRs into t0/t1/t2
function rC(extra) { return regs(BASE_REGS, Object.assign({sstatus:0x100, x2:0x80281EF0, sscratch:0x80283000, x5:0x100, x6:0x80400024, x7:0x80283000, scause:SCAUSE_TIMER}, extra)); }
// rR: after __switch returns to Task1 context, entering __restore
function rR(extra) { return regs(TASK1_REGS, Object.assign({sstatus:0x100, x1:0x80203000, x2:0x80284EF0, x10:0x80260000, x11:0x80260050, sscratch:0x80283000, scause:SCAUSE_TIMER}, extra)); }

// ── Code snippets ──
const USER_APP = [
  {t:'// user/src/bin/00power.rs'},
  {t:'use user_lib::{println, exit};'},
  {t:''},
  {t:'const BASE: u64 = 10;'},
  {t:'const MOD:  u64 = 100003;'},
  {t:'const LEN:  u64 = 1000;'},
  {t:''},
  {t:'#[no_mangle]'},
  {t:'pub fn main() -> i32 {'},
  {t:'    let (mut s, mut p) = (0u64, 1u64);'},
  {t:'    for i in 0..LEN {'},
  {t:'        p = p * BASE % MOD;'},
  {t:'        s = (s + p) % MOD;  // ← 실행 중, 타이머 인터럽트 발생!'},
  {t:'    }'},
  {t:'    println!("sum = {}", s);'},
  {t:'    exit(0)'},
  {t:'}'},
];

const TRAP_S = [
  {t:'__alltraps:'},                                        // 0
  {t:'    csrrw sp, sscratch, sp'},                         // 1
  {t:'    # now sp=KStack0, sscratch=UStack0'},             // 2
  {t:'    addi sp, sp, -34*8'},                             // 3
  {t:'    sd x1, 1*8(sp)'},                                 // 4
  {t:'    sd x3, 3*8(sp)'},                                 // 5
  {t:'    # SAVE_GP macro: sd x5~x31'},                    // 6
  {t:'    .set n,5 ; .rept 27 ; SAVE_GP %n ; .endr'},      // 7
  {t:'    csrr t0, sstatus'},                               // 8
  {t:'    csrr t1, sepc'},                                  // 9
  {t:'    sd t0, 32*8(sp)'},                                // 10
  {t:'    sd t1, 33*8(sp)'},                                // 11
  {t:'    csrr t2, sscratch    # t2 = user sp'},            // 12
  {t:'    sd t2, 2*8(sp)'},                                 // 13
  {t:'    mv a0, sp'},                                      // 14
  {t:'    call trap_handler'},                              // 15
  {t:'__restore:'},                                         // 16
  {t:'    ld t0, 32*8(sp)    # sstatus'},                   // 17
  {t:'    ld t1, 33*8(sp)    # sepc'},                      // 18
  {t:'    ld t2, 2*8(sp)     # user sp'},                   // 19
  {t:'    csrw sstatus, t0'},                               // 20
  {t:'    csrw sepc, t1'},                                  // 21
  {t:'    csrw sscratch, t2'},                              // 22
  {t:'    ld x1, 1*8(sp)'},                                 // 23
  {t:'    ld x3, 3*8(sp)'},                                 // 24
  {t:'    # LOAD_GP macro: ld x5~x31'},                    // 25
  {t:'    .set n,5 ; .rept 27 ; LOAD_GP %n ; .endr'},      // 26
  {t:'    addi sp, sp, 34*8'},                              // 27
  {t:'    csrrw sp, sscratch, sp'},                         // 28
  {t:'    sret'},                                           // 29
];

const SWITCH_S = [
  {t:'__switch:'},                                          // 0
  {t:'    # a0 = current_task_cx_ptr'},                    // 1
  {t:'    # a1 = next_task_cx_ptr'},                       // 2
  {t:'    sd ra, 0(a0)      # save current ra'},            // 3
  {t:'    sd sp, 8(a0)      # save current sp'},            // 4
  {t:'    # SAVE_SN: sd s0~s11'},                          // 5
  {t:'    .set n,0 ; .rept 12 ; SAVE_SN %n ; .endr'},      // 6
  {t:'    ld ra, 0(a1)      # load next ra'},               // 7
  {t:'    # LOAD_SN: ld s0~s11'},                          // 8
  {t:'    .set n,0 ; .rept 12 ; LOAD_SN %n ; .endr'},      // 9
  {t:'    ld sp, 8(a1)      # load next sp'},               // 10
  {t:'    ret               # jump to ra = __restore'},     // 11
];

const TRAP_MOD = [
  {t:'pub fn trap_handler(cx: &mut TrapContext)'},          // 0
  {t:'        -> &mut TrapContext {'},                      // 1
  {t:'    let scause = scause::read();'},                   // 2
  {t:'    let stval  = stval::read();'},                    // 3
  {t:'    match scause.cause() {'},                         // 4
  {t:'        Trap::Interrupt('},                           // 5
  {t:'          Interrupt::SupervisorTimer) => {'},         // 6
  {t:'            set_next_trigger();'},                    // 7
  {t:'            suspend_current_and_run_next();'},        // 8
  {t:'        }'},                                          // 9
  {t:'        // ... other traps'},                         // 10
  {t:'    }'},                                              // 11
  {t:'    cx'},                                             // 12
  {t:'}'},                                                  // 13
];

const TASK_MOD = [
  {t:'pub fn suspend_current_and_run_next() {'},            // 0
  {t:'    mark_current_suspended();'},                      // 1
  {t:'    run_next_task();'},                               // 2
  {t:'}'},                                                  // 3
  {t:''},                                                   // 4
  {t:'fn mark_current_suspended() {'},                      // 5
  {t:'    let mut inner = TASK_MANAGER.inner'},             // 6
  {t:'                        .exclusive_access();'},       // 7
  {t:'    let cur = inner.current_task;  // cur = 0'},      // 8
  {t:'    inner.tasks[cur].task_status'},                   // 9
  {t:'        = TaskStatus::Ready;  // Task0 → Ready'},     // 10
  {t:'}'},                                                  // 11
  {t:''},                                                   // 12
  {t:'fn run_next_task() {'},                               // 13
  {t:'    if let Some(next) = find_next_task() {'},         // 14
  {t:'        inner.tasks[next].task_status'},              // 15
  {t:'            = TaskStatus::Running;  // Task1→Running'}, // 16
  {t:'        inner.current_task = next;  // current = 1'}, // 17
  {t:'        __switch(cur_cx_ptr, next_cx_ptr);'},         // 18
  {t:'    }'},                                              // 19
  {t:'}'},                                                  // 20
];

// ── PC 베이스 주소 (코드 배열 → 시작 물리 주소) ──
// renderer.js의 computePC()가 이를 참조해 PC = base + curLine*4 계산
const CODE_PC_BASE = new Map([
  [USER_APP,  0x80400000],  // App0 .text 시작
  [TRAP_S,    0x80203000],  // trap.S → __alltraps
  [SWITCH_S,  0x80204000],  // switch.S → __switch
  [TRAP_MOD,  0x80205000],  // trap/mod.rs (컴파일된 Rust)
  [TASK_MOD,  0x80206000],  // task/mod.rs (컴파일된 Rust)
]);

// ── Callstack done-frame shortcuts ──
const CS_APP_INT   = {file:'user/bin/00power.rs', done:'    // ← 타이머 인터럽트! (stvec → __alltraps)'};
const CS_TRAP_DONE = {file:'trap.S',              done:'    call trap_handler'};
const CS_MOD_DONE  = {file:'trap/mod.rs',         done:'    suspend_current_and_run_next()'};
const CS_SW_DONE   = {file:'task/mod.rs',         done:'    __switch(cur_cx_ptr, next_cx_ptr)'};
const CS_RET_DONE  = {file:'task/switch.S',       done:'    ret  → __restore'};

// ── STEPS (46 semantic steps → 자동 확장으로 더 늘어남) ──
const STEPS = _expandToLineSteps([

// ───────────────────────────────────────────────
// 1-2: User app + 타이머 인터럽트
// ───────────────────────────────────────────────
{
  title:'Task0 유저 모드 실행 중', file:'user/bin/00power.rs', mode:'U', task:0,
  callStack:[{file:'user/bin/00power.rs (main)', code:USER_APP, curLine:12}],
  desc:'Task0이 U-mode에서 반복 연산을 수행 중입니다.\n\n• sp = 0x80283000 (UStack0)\n• sscratch = 0x80282000 (KStack0 top 보관)\n\n부팅 시 trap::init()이 stvec CSR에 __alltraps 주소를 등록했습니다.\n트랩 발생 시 CPU가 자동으로 이 주소로 점프합니다.',
  detail:'stvec 설정: unsafe { stvec::write(__alltraps as usize, TrapMode::Direct); }  (os/src/trap/mod.rs)',
  regs:regs(BASE_REGS, {}), changed:[],
  memActive:['app0','ustack0']
},
{
  title:'타이머 인터럽트 발생! (하드웨어 자동 처리)', file:'RISC-V Hardware', mode:'S', task:0,
  callStack:[CS_APP_INT, {file:'trap.S (__alltraps)', code:TRAP_S, curLine:0}],
  desc:'타이머가 만료되어 하드웨어 인터럽트 발생.\nCPU가 소프트웨어 호출 없이 자동으로:\n① sstatus.SPP ← U (이전 모드 기록)\n② sepc ← 0x80400024 (인터럽트된 PC 저장)\n③ PC ← stvec = __alltraps 주소\n④ 특권 모드 → S-mode 전환\n\nstvec는 Direct 모드 → 모든 트랩이 __alltraps로 집중됩니다.',
  detail:'sstatus.SPIE=1(이전 SIE값), sstatus.SIE=0(인터럽트 마스킹). __alltraps 첫 줄이 다음입니다.',
  regs:regs(BASE_REGS, {sstatus:0x00000100, scause:SCAUSE_TIMER}), changed:['sstatus','scause'],
  memActive:['kernel','app0']
},

// ───────────────────────────────────────────────
// 3-15: __alltraps (13 스텝)
// ───────────────────────────────────────────────
{
  title:'__alltraps: csrrw sp, sscratch, sp', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:1}],
  desc:'sp와 sscratch를 원자적으로 교환합니다.\n\n• 교환 전: sp = 0x80283000 (UStack0)\n           sscratch = 0x80282000 (KStack0 top)\n• 교환 후: sp = 0x80282000 (KStack0 top)\n           sscratch = 0x80283000 (UStack0)\n\n이제 sp는 커널 스택 꼭대기를 가리킵니다.',
  detail:'csrrw rd, csr, rs1: t=CSR; CSR=rs1; rd=t  (원자적 교환)',
  regs:rA({}), changed:['x2','sscratch'],
  memActive:['kstack0']
},
{
  title:'__alltraps: addi sp, sp, -34*8', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:3}],
  desc:'커널 스택에 TrapContext 공간을 확보합니다.\n34 × 8 = 272 바이트:\n• x0~x31 (32개) = 256 byte\n• sstatus     = 8 byte\n• sepc        = 8 byte\n\nsp: 0x80282000 → 0x80281EF0',
  detail:'TrapContext 구조체: { x: [usize;32], sstatus: Sstatus, sepc: usize }  (272 bytes)',
  regs:rB({}), changed:['x2'],
  memActive:['kstack0','trapctx0']
},
{
  title:'__alltraps: sd x1, 1*8(sp)', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:4}],
  desc:'x1(ra) 레지스터를 TrapContext에 저장합니다.\n\nsd x1, 1*8(sp)  →  MEM[0x80281EF8] = x1\n\nx1(ra) = 0x80400018 (유저 앱의 복귀 주소)\nx2(sp)는 나중에 sscratch로 별도 저장합니다.',
  detail:'x2(sp)와 x4(tp)는 이 시점에 직접 저장하지 않습니다. x2는 csrrw로, x4는 앱에서 미사용.',
  regs:rB({}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: sd x3, 3*8(sp)', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:5}],
  desc:'x3(gp, global pointer)를 TrapContext에 저장합니다.\n\nsd x3, 3*8(sp)  →  MEM[0x80281F08] = x3\n\nx3(gp) = 0x80280000 (커널 글로벌 포인터)',
  detail:'gp(global pointer)는 링커가 설정. RISC-V에서 ±2KB 범위 전역변수 접근 최적화에 사용.',
  regs:rB({}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: SAVE_GP — sd x5~x31', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:7}],
  desc:'매크로 SAVE_GP를 통해 x5~x31을 TrapContext에 저장합니다.\n\n.set n, 5 ; .rept 27 ; SAVE_GP %n ; .endr\n\n각각:\n  sd x5,  5*8(sp)  → MEM[0x80281F18]\n  sd x6,  6*8(sp)  → MEM[0x80281F20]\n  ...\n  sd x31, 31*8(sp) → MEM[0x80281FE8]\n\nx4(tp)는 rCore에서 사용하지 않으므로 생략.',
  detail:'x0(zero)는 항상 0이므로 저장 불필요. 총 27개 sd 명령이 순차 실행.',
  regs:rB({}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: csrr t0, sstatus', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:8}],
  desc:'sstatus CSR 값을 t0 레지스터로 읽어옵니다.\n\ncsrr t0, sstatus  →  t0 = 0x00000100\n\n0x100 = sstatus.SPP=1 (이전 모드=S) 비트...\n실제로는 SPP=0(U-mode 출신), SPIE=1을 나타냅니다.\n0x100 = bit8 (SPIE) 세팅.',
  detail:'sstatus.SPP (bit8): 트랩 직전 특권 모드. 0=U-mode. sret 시 이 값으로 복귀.',
  regs:rB({x5:0x100}), changed:['x5'],
  memActive:['trapctx0']
},
{
  title:'__alltraps: csrr t1, sepc', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:9}],
  desc:'sepc CSR 값을 t1 레지스터로 읽어옵니다.\n\ncsrr t1, sepc  →  t1 = 0x80400024\n\nsepc는 인터럽트 발생 시점의 PC입니다.\nsret 시 이 주소로 복귀합니다.',
  detail:'sepc = 0x80400024: Task0의 유저 앱에서 인터럽트된 명령 주소.',
  regs:rB({x5:0x100, x6:0x80400024}), changed:['x6'],
  memActive:['trapctx0']
},
{
  title:'__alltraps: sd t0, 32*8(sp)', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:10}],
  desc:'t0(sstatus값)를 TrapContext의 sstatus 슬롯에 저장합니다.\n\nsd t0, 32*8(sp)  →  MEM[0x80281FF0] = 0x100\n\nTrapContext.sstatus = 0x100',
  detail:'오프셋 32*8=256: x0~x31(32개) 다음 슬롯 = sstatus 저장 위치.',
  regs:rB({x5:0x100, x6:0x80400024}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: sd t1, 33*8(sp)', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:11}],
  desc:'t1(sepc값)를 TrapContext의 sepc 슬롯에 저장합니다.\n\nsd t1, 33*8(sp)  →  MEM[0x80281FF8] = 0x80400024\n\nTrapContext.sepc = 0x80400024',
  detail:'오프셋 33*8=264: sstatus 다음 슬롯 = sepc 저장 위치.',
  regs:rB({x5:0x100, x6:0x80400024}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: csrr t2, sscratch', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:12}],
  desc:'sscratch CSR 값(유저 스택 주소)을 t2로 읽어옵니다.\n\ncsrr t2, sscratch  →  t2 = 0x80283000\n\n이것이 Task0의 유저 스택 포인터입니다.\nTrapContext.x[2]에 저장해야 합니다.',
  detail:'sscratch = 0x80283000 = UStack0 top. csrrw로 교환됐을 때 보관된 원래 sp.',
  regs:rC({}), changed:['x7'],
  memActive:['trapctx0']
},
{
  title:'__alltraps: sd t2, 2*8(sp)', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:13}],
  desc:'t2(유저 sp)를 TrapContext.x[2] 슬롯에 저장합니다.\n\nsd t2, 2*8(sp)  →  MEM[0x80281F00] = 0x80283000\n\nTrapContext.x[2] = 0x80283000 (Task0 유저스택)\n\nTrapContext가 이제 완전히 채워졌습니다!',
  detail:'x[2]는 sp의 인덱스. 유저 sp를 TrapContext에 보관해야 __restore에서 복원 가능.',
  regs:rC({}), changed:[],
  memActive:['trapctx0']
},
{
  title:'__alltraps: mv a0, sp', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:14}],
  desc:'TrapContext 포인터를 함수 인자(a0)로 설정합니다.\n\nmv a0, sp  →  a0 = 0x80281EF0\n\ntrap_handler의 첫 번째 인자: cx: &mut TrapContext\nRISC-V calling convention: 첫 인자는 a0 레지스터',
  detail:'a0(x10) = 0x80281EF0 = TrapContext의 시작 주소 (KStack0 - 272)',
  regs:rC({x10:0x80281EF0}), changed:['x10'],
  memActive:['kstack0','trapctx0']
},
{
  title:'__alltraps: call trap_handler', file:'trap.S', mode:'S', task:0,
  callStack:[{file:'trap.S (__alltraps)', code:TRAP_S, curLine:15}],
  desc:'Rust로 작성된 trap_handler 함수를 호출합니다.\n\ncall = auipc ra, <offset>  +  jalr ra, ra, <offset>\n• ra ← __alltraps 복귀 주소\n• PC ← trap_handler 주소\n\ntrap_handler(cx: &mut TrapContext) → &mut TrapContext',
  detail:'이 시점부터 S-mode Rust 코드 실행. a0=0x80281EF0 (TrapContext*).',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['kstack0','trapctx0']
},

// ───────────────────────────────────────────────
// 16-19: trap_handler (4 스텝)
// ───────────────────────────────────────────────
{
  title:'trap_handler: let scause = scause::read()', file:'trap/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, {file:'trap/mod.rs', code:TRAP_MOD, curLine:2}],
  desc:'scause CSR를 읽어 트랩 원인을 파악합니다.\n\nlet scause = scause::read();\n\nscause.bits() = 0x8000000000000005\n• MSB=1 → 인터럽트 (예외가 아님)\n• 하위 비트 5 → SupervisorTimer',
  detail:'scause 구조: [MSB: Exception/Interrupt 구분] [나머지 비트: 원인 코드]',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['kstack0','trapctx0']
},
{
  title:'trap_handler: let stval = stval::read()', file:'trap/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, {file:'trap/mod.rs', code:TRAP_MOD, curLine:3}],
  desc:'stval CSR를 읽어 추가 트랩 정보를 가져옵니다.\n\nlet stval = stval::read();\n\n타이머 인터럽트의 경우 stval = 0 (의미 없음)\n페이지 폴트면 폴트 주소, 불법 명령이면 명령 자체.',
  detail:'stval = "supervisor trap value". 트랩 종류에 따라 의미가 달라집니다.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['kstack0','trapctx0']
},
{
  title:'trap_handler: match → SupervisorTimer', file:'trap/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, {file:'trap/mod.rs', code:TRAP_MOD, curLine:6}],
  desc:'scause.cause()로 인터럽트 원인을 매칭합니다.\n\nmatch scause.cause() {\n    Trap::Interrupt(Interrupt::SupervisorTimer) => { ... }\n}\n\n→ SupervisorTimer 브랜치 진입!\n타이머 인터럽트 처리를 시작합니다.',
  detail:'SupervisorTimer = Interrupt 코드 5. M-mode SBI가 세팅한 타이머 만료.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['kstack0','trapctx0']
},
{
  title:'set_next_trigger() — 다음 타이머 예약', file:'trap/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, {file:'trap/mod.rs', code:TRAP_MOD, curLine:7}],
  desc:'SBI ecall을 통해 다음 타이머 인터럽트를 설정합니다.\n\nset_next_trigger();\n  → sbi_call(SBI_SET_TIMER, get_time() + CLOCK_FREQ/TICKS_PER_SEC)\n\n• CLOCK_FREQ = 12,500,000 Hz\n• TICKS_PER_SEC = 100\n→ 약 10ms 후에 다음 인터럽트 발생',
  detail:'SBI(Supervisor Binary Interface): S-mode OS가 M-mode RustSBI에 서비스 요청.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['kstack0','trapctx0']
},

// ───────────────────────────────────────────────
// 20-25: suspend_current_and_run_next (6 스텝)
// ───────────────────────────────────────────────
{
  title:'suspend_current_and_run_next() 진입', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:0}],
  desc:'태스크 스케줄링 함수에 진입합니다.\n\npub fn suspend_current_and_run_next() {\n    mark_current_suspended();\n    run_next_task();\n}\n\n현재 태스크(Task0)를 중단하고 다음 태스크(Task1)를 실행합니다.',
  detail:'TASK_MANAGER: 전역 정적 변수 (UPSafeCell<TaskManagerInner>). 안전한 내부 가변성.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'mark_current_suspended(): cur 확인', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:8}],
  desc:'TASK_MANAGER를 잠그고 현재 태스크 인덱스를 읽습니다.\n\nlet mut inner = TASK_MANAGER.inner.exclusive_access();\nlet cur = inner.current_task;  // cur = 0\n\n현재 실행 중인 태스크가 Task0 (index=0)임을 확인합니다.',
  detail:'exclusive_access(): UPSafeCell의 내부 가변 참조 획득. 단일 코어이므로 데이터 경쟁 없음.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'mark_current_suspended(): Task0 → Ready', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:10}],
  desc:'Task0의 TCB 상태를 Running → Ready로 변경합니다.\n\ninner.tasks[0].task_status = TaskStatus::Ready;\n\nTask0은 더 이상 Running 상태가 아닙니다.\n스케줄러가 다음에 이 태스크를 선택할 수 있습니다.',
  detail:'TCB(Task Control Block): { task_cx: TaskContext, task_status: TaskStatus }',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'run_next_task(): find_next_task() → Task1 발견', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:14}],
  desc:'Ready 상태인 다음 태스크를 탐색합니다.\n\nif let Some(next) = find_next_task() {\n\nfind_next_task(): current+1부터 순환 탐색\n→ Task1 발견! (Ready 상태)\n→ next = 1',
  detail:'순환 탐색: (0+1) % 2 = 1 → Task1. Ready 상태이면 선택.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'run_next_task(): Task1 → Running', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:16}],
  desc:'Task1의 TCB 상태를 Ready → Running으로 변경합니다.\n\ninner.tasks[1].task_status = TaskStatus::Running;\n\nTask1이 이제 실행 중 태스크로 선택됩니다.',
  detail:'이 시점에서 TASK_MANAGER는 Task1=Running, Task0=Ready를 기록합니다.',
  regs:rC({x10:0x80281EF0}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'run_next_task(): current=1, __switch 호출', file:'task/mod.rs', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, {file:'task/mod.rs', code:TASK_MOD, curLine:18}],
  desc:'current_task를 1로 업데이트하고 __switch를 호출합니다.\n\ninner.current_task = next;  // = 1\n__switch(cur_cx_ptr, next_cx_ptr);\n• a0 = &Task0.task_cx  (≈ 0x80260000)\n• a1 = &Task1.task_cx  (≈ 0x80260050)',
  detail:'Task1.task_cx.ra = __restore (goto_restore로 초기화됨)',
  regs:rC({x10:0x80260000, x11:0x80260050}), changed:['x10','x11'],
  memActive:['taskctx','kstack0']
},

// ───────────────────────────────────────────────
// 26-33: __switch (8 스텝)
// ───────────────────────────────────────────────
{
  title:'__switch 진입', file:'task/switch.S', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:0}],
  desc:'컨텍스트 스위칭 함수 __switch가 시작됩니다.\n\n• a0 = 0x80260000 = &Task0.task_cx  (저장 대상)\n• a1 = 0x80260050 = &Task1.task_cx  (복원 대상)\n\nTaskContext: { ra: usize, sp: usize, s: [usize;12] }\n→ 14개 필드 × 8byte = 112byte',
  detail:'__switch는 Rust extern "C" fn으로 선언. 링커가 배치한 어셈블리 함수.',
  regs:rC({x10:0x80260000, x11:0x80260050}), changed:[],
  memActive:['taskctx','kstack0']
},
{
  title:'__switch: sd ra, 0(a0) — Task0 ra 저장', file:'task/switch.S', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:3}],
  desc:'Task0의 복귀 주소(ra)를 TaskContext에 저장합니다.\n\nsd ra, 0(a0)  →  MEM[0x80260000] = ra\n\nTask0이 나중에 재개될 때 이 ra로 복귀합니다.\n(run_next_task() 다음 실행 지점)',
  detail:'ra = __switch 호출 직후 run_next_task()의 복귀 주소.',
  regs:rC({x10:0x80260000, x11:0x80260050}), changed:[],
  memActive:['taskctx']
},
{
  title:'__switch: sd sp, 8(a0) — Task0 sp 저장', file:'task/switch.S', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:4}],
  desc:'Task0의 현재 커널 스택 포인터를 TaskContext에 저장합니다.\n\nsd sp, 8(a0)  →  MEM[0x80260008] = 0x80281EF0\n\nsp = 0x80281EF0 = KStack0 내 TrapContext 위치\nTask0 재개 시 이 sp로 커널 스택을 복원합니다.',
  detail:'Task0.task_cx.sp = 0x80281EF0: KStack0 상단에서 TrapContext(272B) 만큼 내려간 위치.',
  regs:rC({x10:0x80260000, x11:0x80260050}), changed:[],
  memActive:['taskctx']
},
{
  title:'__switch: SAVE_SN — sd s0~s11', file:'task/switch.S', mode:'S', task:0,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:6}],
  desc:'Callee-saved 레지스터 s0~s11을 Task0 TaskContext에 저장합니다.\n\n.set n,0 ; .rept 12 ; SAVE_SN %n ; .endr\n→ sd s0, 16(a0)  MEM[0x80260010] = s0\n   sd s1, 24(a0)  ...\n   ...\n   sd s11, 104(a0)\n\nTask0의 실행 문맥이 완전히 보존됩니다.',
  detail:'Callee-saved (s0~s11=x8,x9,x18~x27): 함수 호출 후에도 보존돼야 하는 레지스터.',
  regs:rC({x10:0x80260000, x11:0x80260050}), changed:[],
  memActive:['taskctx']
},
{
  title:'__switch: ld ra, 0(a1) — Task1 ra 복원', file:'task/switch.S', mode:'S', task:1,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:7}],
  desc:'Task1의 복귀 주소를 TaskContext에서 ra로 로드합니다.\n\nld ra, 0(a1)  →  ra = MEM[0x80260050] = 0x80203000\n\n0x80203000 = __restore 주소\n(goto_restore()로 초기화된 값)\n\n이제 Task1의 컨텍스트로 진입 시작!',
  detail:'Task1.task_cx.ra = __restore: goto_restore(kstack1_top - sizeof::<TrapContext>())로 설정됨.',
  regs:rC({x1:0x80203000, x10:0x80260000, x11:0x80260050}), changed:['x1'],
  memActive:['taskctx','kstack1']
},
{
  title:'__switch: LOAD_SN — ld s0~s11', file:'task/switch.S', mode:'S', task:1,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:9}],
  desc:'Task1의 callee-saved 레지스터를 복원합니다.\n\n.set n,0 ; .rept 12 ; LOAD_SN %n ; .endr\n→ ld s0, 16(a1)   s0 = 0 (Task1 초기값)\n   ld s1, 24(a1)   s1 = 0\n   ...\n   ld s11, 104(a1)  s11 = 0\n\nTask1 첫 실행 → 모두 0으로 초기화.',
  detail:'Task1은 아직 한 번도 실행된 적 없으므로 s0~s11 = 0.',
  regs:rC({x1:0x80203000, x8:0, x9:0, x10:0x80260000, x11:0x80260050,
           x18:0, x19:0, x20:0, x21:0, x22:0, x23:0, x24:0, x25:0, x26:0, x27:0}),
  changed:['x8','x9','x18','x19','x20','x21','x22','x23','x24','x25','x26','x27'],
  memActive:['taskctx','kstack1']
},
{
  title:'__switch: ld sp, 8(a1) — Task1 sp 복원', file:'task/switch.S', mode:'S', task:1,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:10}],
  desc:'Task1의 커널 스택 포인터를 복원합니다.\n\nld sp, 8(a1)  →  sp = MEM[0x80260058] = 0x80284EF0\n\nsp = 0x80284EF0 = KStack1 내 TrapContext 위치\n이 TrapContext에는 Task1의 초기 실행 상태가 담겨 있습니다.',
  detail:'0x80285000 (KStack1 top) - 272 = 0x80284EF0 = Task1 TrapContext 시작 주소.',
  regs:regs(TASK1_REGS, {sstatus:0x100, x1:0x80203000, x2:0x80284EF0, x10:0x80260000, x11:0x80260050, sscratch:0x80283000}),
  changed:['x2'],
  memActive:['taskctx','kstack1']
},
{
  title:'__switch: ret → PC = ra = __restore', file:'task/switch.S', mode:'S', task:1,
  callStack:[CS_TRAP_DONE, CS_MOD_DONE, CS_SW_DONE, {file:'task/switch.S (__switch)', code:SWITCH_S, curLine:11}],
  desc:'ret 명령 실행: PC ← ra = 0x80203000 (__restore)\n\nret ≡ jalr x0, x1, 0\n\n이제 실행 흐름이 __restore로 이동합니다.\n• sp = 0x80284EF0 (Task1 KStack의 TrapContext)\n• Task1의 초기 실행 상태를 복원할 준비 완료',
  detail:'ra(x1) = 0x80203000 = __restore의 실제 주소. goto_restore()가 여기로 세팅.',
  regs:regs(TASK1_REGS, {sstatus:0x100, x1:0x80203000, x2:0x80284EF0, x10:0x80260000, x11:0x80260050, sscratch:0x80283000}),
  changed:[],
  memActive:['kstack1','trapctx1']
},

// ───────────────────────────────────────────────
// 34-45: __restore (12 스텝)
// ───────────────────────────────────────────────
{
  title:'__restore: ld t0, 32*8(sp) — sstatus 로드', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:17}],
  desc:'Task1 TrapContext에서 sstatus 값을 t0로 읽습니다.\n\nld t0, 32*8(sp)  →  t0 = MEM[0x80285FF0]\n\nt0 = 0x00000000 (Task1의 초기 sstatus)\nsstatus.SPP = 0 → sret 시 U-mode로 복귀 예정',
  detail:'TrapContext.sstatus: app_init_context()에서 설정. SPP=0으로 U-mode 복귀 보장.',
  regs:rR({x5:0x00000000}), changed:['x5'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: ld t1, 33*8(sp) — sepc 로드', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:18}],
  desc:'Task1 TrapContext에서 sepc 값을 t1로 읽습니다.\n\nld t1, 33*8(sp)  →  t1 = 0x80420000\n\n0x80420000 = Task1(App1)의 진입점\n= APP_BASE_ADDRESS + 1 * APP_SIZE_LIMIT\nsret 시 PC가 이 주소로 점프합니다.',
  detail:'sepc = 0x80420000: App1의 _start 주소. app_init_context()에서 entry point로 설정.',
  regs:rR({x5:0x00000000, x6:0x80420000}), changed:['x6'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: ld t2, 2*8(sp) — user sp 로드', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:19}],
  desc:'Task1 TrapContext에서 유저 스택 포인터를 t2로 읽습니다.\n\nld t2, 2*8(sp)  →  t2 = 0x80286000\n\n0x80286000 = UStack1 top (Task1 유저 스택)\nこれが sscratch에 저장되어 다음 alltraps에서 사용됩니다.',
  detail:'UStack1 = APP_BASE + 2*APP_SIZE_LIMIT - 1*USER_STACK_SIZE + USER_STACK_SIZE = 0x80286000',
  regs:rR({x5:0x00000000, x6:0x80420000, x7:0x80286000}), changed:['x7'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: csrw sstatus, t0', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:20}],
  desc:'t0 값으로 sstatus CSR를 업데이트합니다.\n\ncsrw sstatus, t0  →  sstatus = 0x00000000\n\nsstatus.SPP = 0 → sret 시 U-mode 복귀\nsstatus.SPIE = 0 → sret 후 인터럽트 활성화',
  detail:'sstatus=0: SPP=0(U), SIE=0(현재 인터럽트 마스킹), SPIE=1이면 sret후 SIE=1.',
  regs:rR({x5:0x00000000, x6:0x80420000, x7:0x80286000, sstatus:0x00000000}), changed:['sstatus'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: csrw sepc, t1', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:21}],
  desc:'t1 값으로 sepc CSR를 업데이트합니다.\n\ncsrw sepc, t1  →  sepc = 0x80420000\n\nsret 명령이 실행되면 PC ← sepc = 0x80420000\n→ Task1(App1)의 첫 번째 명령으로 점프!',
  detail:'sepc = 0x80420000 = App1 진입점. sret이 이 주소를 PC로 설정합니다.',
  regs:rR({x5:0x00000000, x6:0x80420000, x7:0x80286000, sstatus:0x00000000, sepc:0x80420000}), changed:['sepc'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: csrw sscratch, t2', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:22}],
  desc:'t2(유저 sp) 값으로 sscratch CSR를 업데이트합니다.\n\ncsrw sscratch, t2  →  sscratch = 0x80286000\n\n다음 번 타이머 인터럽트 시 __alltraps에서:\ncsrrw sp, sscratch, sp\n→ sp ↔ 0x80286000 (Task1 UStack)',
  detail:'sscratch = Task1 유저스택. 다음 트랩 진입 시 커널스택과 교환됩니다.',
  regs:rR({x5:0x00000000, x6:0x80420000, x7:0x80286000, sstatus:0x00000000, sepc:0x80420000, sscratch:0x80286000}),
  changed:['sscratch'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: ld x1, 1*8(sp)', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:23}],
  desc:'Task1 TrapContext에서 x1(ra)을 복원합니다.\n\nld x1, 1*8(sp)  →  x1 = TrapContext.x[1] = 0\n\nTask1 첫 실행이므로 ra = 0 (미사용)\n유저 앱의 main()이 종료되면 exit()을 호출하므로\nra가 실제 복귀 주소일 필요가 없습니다.',
  detail:'Task1.TrapContext.x[1] = 0: app_init_context()에서 모든 gpr을 0으로 초기화.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x1:0, x2:0x80284EF0, x5:0x00000000, x6:0x80420000, x7:0x80286000, sscratch:0x80286000, sepc:0x80420000}),
  changed:['x1'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: ld x3, 3*8(sp)', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:24}],
  desc:'Task1 TrapContext에서 x3(gp)을 복원합니다.\n\nld x3, 3*8(sp)  →  x3 = TrapContext.x[3] = 0\n\ngp(global pointer)가 0으로 복원됩니다.\nTask1 유저 앱의 글로벌 포인터는 링크 타임에 결정됩니다.',
  detail:'실제 앱에서는 gp가 .sdata 섹션 중간을 가리키도록 링커스크립트가 설정합니다.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80284EF0, x5:0x00000000, x6:0x80420000, x7:0x80286000, sscratch:0x80286000, sepc:0x80420000}),
  changed:['x3'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: LOAD_GP — ld x5~x31', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:26}],
  desc:'매크로 LOAD_GP로 x5~x31을 TrapContext에서 복원합니다.\n\n.set n,5 ; .rept 27 ; LOAD_GP %n ; .endr\n→ ld x5,  5*8(sp)  = 0\n   ld x6,  6*8(sp)  = 0\n   ...\n   ld x31, 31*8(sp) = 0\n\nTask1 첫 실행 → 모두 0.',
  detail:'x2(sp)와 x4(tp)는 여기서 복원하지 않습니다. x2는 addi/csrrw로, x4는 미사용.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80284EF0, sscratch:0x80286000, sepc:0x80420000}),
  changed:['x5','x6','x7','x8','x9','x10','x11','x12','x13','x14','x15','x16','x17','x18','x19','x20','x21','x22','x23','x24','x25','x26','x27','x28','x29','x30','x31'],
  memActive:['kstack1','trapctx1']
},
{
  title:'__restore: addi sp, sp, 34*8', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:27}],
  desc:'TrapContext 공간을 해제하고 sp를 KStack1 top으로 올립니다.\n\naddi sp, sp, 34*8  →  sp = 0x80284EF0 + 272 = 0x80285000\n\nsp = 0x80285000 = KStack1 top\nTrapContext는 더 이상 필요하지 않으므로 스택 해제.',
  detail:'실제로 메모리가 지워지지는 않습니다. sp를 올리면 그 위는 "사용 가능" 영역이 됩니다.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80285000, sscratch:0x80286000, sepc:0x80420000}),
  changed:['x2'],
  memActive:['kstack1']
},
{
  title:'__restore: csrrw sp, sscratch, sp', file:'trap.S', mode:'S', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:28}],
  desc:'sp와 sscratch를 다시 교환합니다.\n\n• 교환 전: sp = 0x80285000 (KStack1 top)\n           sscratch = 0x80286000 (Task1 UStack)\n• 교환 후: sp = 0x80286000 (UStack1 top)\n           sscratch = 0x80285000 (KStack1 top)\n\n이제 sp는 Task1의 유저 스택!',
  detail:'다음 트랩 발생 시 csrrw가 다시 sp↔sscratch 교환 → 커널스택으로 진입.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80286000, sscratch:0x80285000, sepc:0x80420000}),
  changed:['x2','sscratch'],
  memActive:['kstack1','ustack1']
},
{
  title:'sret — S-mode → U-mode 전환', file:'trap.S', mode:'U', task:1,
  callStack:[CS_RET_DONE, {file:'trap.S (__restore)', code:TRAP_S, curLine:29}],
  desc:'sret(Supervisor Return) 명령 실행:\n① sstatus.SIE ← sstatus.SPIE (인터럽트 활성화)\n② 특권 모드 ← sstatus.SPP = 0 (→ U-mode)\n③ PC ← sepc = 0x80420000 (App1 진입점)\n\nTask1이 유저 모드에서 실행을 시작합니다!',
  detail:'sret: S-mode에서 "인터럽트/예외에서 복귀"하는 명령. U-mode로 내려가며 sepc로 점프.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80286000, sscratch:0x80285000, sepc:0x80420000}),
  changed:[],
  memActive:['app1','ustack1']
},

// ───────────────────────────────────────────────
// 46: Task1 실행
// ───────────────────────────────────────────────
{
  title:'Task1 유저 모드 실행 중!', file:'—', mode:'U', task:1,
  callStack:[],
  desc:'Task1이 U-mode에서 성공적으로 실행을 시작했습니다!\n\n• PC = 0x80420000 (App1 _start)\n• sp = 0x80286000 (UStack1)\n• Mode = U-mode\n\n타이머 인터럽트가 발생하면 Task1도 동일한 과정을 거쳐\n다른 태스크로 전환됩니다 — 이것이 선점형 멀티태스킹!',
  detail:'rCore ch3 선점형 멀티태스킹(Preemptive Multitasking): 타이머가 CPU를 강제로 전환합니다.',
  regs:regs(TASK1_REGS, {sstatus:0x00000000, x2:0x80286000, sscratch:0x80285000, sepc:0x80420000}),
  changed:[],
  memActive:['app1','ustack1']
},

]); // end STEPS (_expandToLineSteps로 자동 중간 줄 삽입)
