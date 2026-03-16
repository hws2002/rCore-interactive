// ── ch1_shutdown/data.js ──
// 关机过程: rust_main → shutdown() → sbi_call(SBI_SHUTDOWN) → ecall → M-mode → 종료

// 특권 레벨 레이어 ID
// 'u': U-mode (최하위), 's': S-mode, 'm': M-mode (최상위)

// ── 코드 스니펫 ──
const CODE_MAIN = [
  '// os/src/main.rs',
  '#[no_mangle]',
  'pub fn rust_main() -> ! {',
  '    clear_bss();',
  '    // ... 초기화 완료 ...',
  '    println!("[kernel] Hello, world!");',
  '    // 정상 종료 요청',
  '    shutdown();  // ← 여기서 출발',
  '}',
];

const CODE_SHUTDOWN = [
  '// os/src/sbi.rs',
  'const SBI_SHUTDOWN: usize = 8;',
  '',
  'pub fn shutdown() -> ! {',
  '    // SBI EID=8 (Legacy: SHUTDOWN)',
  '    sbi_call(SBI_SHUTDOWN, 0, 0, 0);',
  '    unreachable!()',
  '}',
];

const CODE_SBI_CALL = [
  '// os/src/sbi.rs — sbi_call 내부',
  'fn sbi_call(which: usize, arg0: usize,',
  '            arg1: usize, arg2: usize) -> usize {',
  '    let mut ret;',
  '    unsafe { asm!(',
  '        "li x16, 0",        // extension ID = 0 (legacy)',
  '        "ecall",            // ← S→M 트랩 발생!',
  '        inlateout("x10") arg0 => ret, // a0 = arg0',
  '        in("x11") arg1,    // a1',
  '        in("x12") arg2,    // a2',
  '        in("x17") which,   // a7 = EID (8 = SHUTDOWN)',
  '    ); }',
  '    ret',
  '}',
];

const CODE_RUSTSBI = [
  '// RustSBI @ 0x80000000 (M-mode) — trap handler',
  'fn handle_ecall_from_s(ctx: &mut TrapContext) {',
  '    let eid = ctx.a7;  // x17 = 8 (SBI_SHUTDOWN)',
  '    match eid {',
  '        8 => {',
  '            // SBI_SHUTDOWN: 머신 종료',
  '            qemu_exit_handle.exit(0);',
  '            // QEMU: test-finisher에 0x5555 쓰기',
  '            // → QEMU 프로세스가 exit(0)으로 종료',
  '        }',
  '        _ => { /* 기타 SBI 서비스 처리 */ }',
  '    }',
  '}',
];

// ── 스텝 데이터 ──
const STEPS = [
  {
    title: 'rust_main: 커널 실행 중 (S-mode)',
    file: 'os/src/main.rs',
    code: CODE_MAIN, lineFrom: 7, lineTo: 7,
    mode: 's',  // 현재 활성 모드
    ecall: false,
    prevPage: '../boot/index.html',
    regs: { a7: '─', a0: '─', mode: 'S-mode', PC: '~0x80200400' },
    desc: 'rust_main이 S-mode에서 실행 중입니다.\n\nclear_bss() 완료, 로깅 초기화 완료,\n"[kernel] Hello, world!" 출력 완료.\n\n이제 shutdown()을 호출하여 QEMU를 종료합니다.\n커널은 현재 Supervisor 모드(S-mode)에서 동작 중입니다.',
    detail: 'S-mode: U-mode 앱보다 높고 RustSBI(M-mode)보다 낮은 특권 레벨. 페이지 테이블, 트랩 처리, 커널 주요 기능을 담당.',
  },
  {
    title: 'shutdown() 호출 → sbi_call(8, 0, 0, 0)',
    file: 'os/src/sbi.rs',
    code: CODE_SHUTDOWN, lineFrom: 3, lineTo: 6,
    mode: 's',
    ecall: false,
    regs: { a7: '─', a0: '─', mode: 'S-mode', PC: '~0x80200460' },
    desc: 'shutdown() 함수가 호출됩니다.\n\n• SBI_SHUTDOWN = 8 (Legacy SBI Extension ID)\n• sbi_call(which=8, arg0=0, arg1=0, arg2=0) 호출\n\nSBI(Supervisor Binary Interface)는 커널과 펌웨어 사이의\n표준 인터페이스입니다. EID(Extension ID) 8은\n시스템 종료를 의미합니다.',
    detail: 'SBI 스펙 (RISC-V): Legacy Extension EID 0x08 = sbi_shutdown(). 현재는 SRST Extension으로 대체되었으나 rCore ch1에서는 레거시 방식을 사용합니다.',
  },
  {
    title: '레지스터 준비: a7=8, a0=a1=a2=0',
    file: 'os/src/sbi.rs — inline asm',
    code: CODE_SBI_CALL, lineFrom: 4, lineTo: 10,
    mode: 's',
    ecall: false,
    regs: { a7: '0x8', a0: '0x0', mode: 'S-mode', PC: '~0x80200480' },
    desc: 'ecall 실행 직전, 레지스터를 설정합니다.\n\nRISC-V SBI 호출 규약:\n• a7 (x17) = EID = 8  (SBI_SHUTDOWN)\n• a6 (x16) = FID = 0  (Function ID, legacy=0)\n• a0 (x10) = arg0 = 0\n• a1 (x11) = arg1 = 0\n• a2 (x12) = arg2 = 0\n\n"li x16, 0" 명령으로 x16(a6)을 0으로 설정 후 ecall 실행.',
    detail: 'RISC-V SBI 호출 규약: 함수 인자는 a0~a5, 함수ID는 a6, 확장ID는 a7. 반환값은 a0(오류코드), a1(값).',
  },
  {
    title: 'ecall — S-mode → M-mode 트랩 발생!',
    file: 'os/src/sbi.rs — "ecall" 명령',
    code: CODE_SBI_CALL, lineFrom: 6, lineTo: 6,
    mode: 'ecall',  // 전환 애니메이션
    ecall: true,
    regs: { a7: '0x8', a0: '0x0', mode: 'S→M', PC: '0x80000??? (mtvec)' },
    desc: '`ecall` 명령이 실행됩니다!\n\n이 순간 CPU 하드웨어가 자동으로:\n① scause ← 환경호출 예외 (cause=9: ecall from S-mode)\n② sepc   ← ecall 다음 명령 주소 (복귀 주소 저장)\n③ PC     ← mtvec  (M-mode 트랩 벡터)\n④ mode   ← M-mode (특권 상승!)\n\nS-mode에서 M-mode로 올라갑니다.\n이제 RustSBI가 트랩을 처리합니다.',
    detail: 'ecall from S-mode → mcause=9. M-mode가 medeleg로 위임하지 않은 ecall이므로 M-mode mtvec로 직접 점프합니다.',
  },
  {
    title: 'M-mode: RustSBI trap handler 진입',
    file: 'RustSBI @ 0x80000000 (M-mode)',
    code: CODE_RUSTSBI, lineFrom: 1, lineTo: 2,
    mode: 'm',
    ecall: false,
    regs: { a7: '0x8', a0: '0x0', mode: 'M-mode', PC: '~0x80000300' },
    desc: 'RustSBI의 M-mode 트랩 핸들러가 실행됩니다.\n\ncause = ecall from S-mode이므로 SBI 요청을 처리합니다.\n\n• a7(x17) = 8 읽기 → SBI_SHUTDOWN 확인\n• mmode에서 최고 특권으로 실행 중\n\nRustSBI는 RISC-V 표준 SBI 인터페이스의 구현체입니다.',
    detail: 'mtvec(Machine Trap-Vector): M-mode 트랩 핸들러 주소. ecall from S-mode (cause=9)는 S-mode medeleg가 설정되어 있지 않으면 M-mode로 처리됩니다.',
  },
  {
    title: 'RustSBI: a7=8 확인 → SBI_SHUTDOWN 분기',
    file: 'RustSBI M-mode handler',
    code: CODE_RUSTSBI, lineFrom: 3, lineTo: 4,
    mode: 'm',
    ecall: false,
    regs: { a7: '0x8', a0: '0x0', mode: 'M-mode', PC: '~0x80000340' },
    desc: 'RustSBI가 EID(Extension ID)를 확인합니다.\n\n• a7 = 8 → Legacy SBI_SHUTDOWN\n• match eid { 8 => /* 종료 처리 */ }\n\nSBI_SHUTDOWN 분기로 진입하여\nQEMU 종료 시퀀스를 실행합니다.',
    detail: 'Legacy SBI (v0.1): EID 8 = sbi_shutdown(). SBI v0.2+에서는 SRST Extension(EID=0x53525354)으로 대체되었습니다.',
  },
  {
    title: 'QEMU virt test-finisher에 0x5555 쓰기',
    file: 'RustSBI → QEMU test-finisher (MMIO)',
    code: CODE_RUSTSBI, lineFrom: 6, lineTo: 8,
    mode: 'm',
    ecall: false,
    regs: { a7: '0x8', a0: '0x0', mode: 'M-mode', PC: '~0x80000360' },
    desc: 'RustSBI가 QEMU의 종료 메커니즘을 트리거합니다.\n\nQEMU virt 보드의 test-finisher MMIO:\n• 주소: 0x100000 (virt machine exit device)\n• 0x5555 쓰기 → QEMU exit(0) 성공 종료\n• 0x3333 쓰기 → QEMU exit(1) 실패 종료\n\n이 MMIO 쓰기가 QEMU 프로세스를 종료시킵니다.',
    detail: 'QEMU virt board: test-finisher @ 0x100000 (SiFive test MMIO). 이는 실제 RISC-V 하드웨어에는 없는 QEMU 전용 종료 메커니즘입니다.',
  },
  {
    title: '시스템 종료 완료 — QEMU 프로세스 exit',
    file: '— QEMU process exit —',
    code: CODE_RUSTSBI, lineFrom: 12, lineTo: 12,
    mode: 'off',
    ecall: false,
    regs: { a7: '0x8', a0: '0x0', mode: '—', PC: '—' },
    desc: 'QEMU 프로세스가 종료됩니다.\n\n콘솔 출력:\n  [rustsbi] System shutdown\n  (QEMU process exits with code 0)\n\nrCore ch1 커널의 전체 실행 흐름:\n  QEMU 실행\n  → 0x1000 Firmware\n  → 0x80000000 RustSBI\n  → 0x80200000 _start (entry.asm)\n  → rust_main (Rust 커널)\n  → shutdown() → ecall\n  → RustSBI 종료 처리\n  → QEMU exit',
    detail: '실제 하드웨어에서는 전원 관리 IC(PMIC)에 종료 신호를 보냅니다. QEMU에서는 test-finisher MMIO로 시뮬레이션합니다.',
  },
];
