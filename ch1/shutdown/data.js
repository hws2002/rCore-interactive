// ── ch1_shutdown/data.js ──
// 종료 과정: rust_main → exit_success() → sw 0x5555, 0(0x100000) → QEMU exit
// (SBI ecall 없음 — S-mode에서 직접 MMIO write)

// ── 코드 스니펫 ──
const CODE_MAIN = [
  '// os/src/main.rs',
  '#[no_mangle]',
  'pub fn rust_main() -> ! {',
  '    clear_bss();',
  '    logging::init();',
  '    println!("[kernel] Hello, world!");',
  '    // 섹션 주소 출력 (trace/debug/info/warn/error)',
  '    use crate::board::QEMUExit;',
  '    QEMU_EXIT_HANDLE.exit_success(); // ← 여기서 출발',
  '}',
];

const CODE_BOARD = [
  '// os/src/boards/qemu.rs',
  'const EXIT_SUCCESS: u32 = 0x5555;',
  'const EXIT_FAILURE_FLAG: u32 = 0x3333;',
  'const EXIT_RESET: u32 = 0x7777;',
  '',
  'impl QEMUExit for RISCV64 {',
  '    fn exit_success(&self) -> ! {',
  '        self.exit(EXIT_SUCCESS); // exit(0x5555)',
  '    }',
  '',
  '    fn exit(&self, code: u32) -> ! {',
  '        let code_new = match code {',
  '            EXIT_SUCCESS | EXIT_FAILURE | EXIT_RESET => code, // 특수값: 그대로',
  '            _ => exit_code_encode(code), // 일반값: (code<<16)|0x3333',
  '        };',
  '        unsafe {',
  '            asm!(',
  '                "sw {0}, 0({1})",',
  '                in(reg) code_new,  // 0x5555',
  '                in(reg) self.addr, // 0x100000 (VIRT_TEST)',
  '            );',
  '            loop { asm!("wfi", options(nomem, nostack)); }',
  '        }',
  '    }',
  '}',
  '',
  'const VIRT_TEST: u64 = 0x100000;',
  'pub const QEMU_EXIT_HANDLE: RISCV64 = RISCV64::new(VIRT_TEST);',
];

// ── 콜 체인 박스 정의 ──
// callStep: 0=rust_main, 1=exit_success, 2=exit, 3=sw MMIO, 4=QEMU exit
const CALL_CHAIN = [
  { id: 0, label: 'rust_main()',         sub: 'S-mode @ ~0x80200000', color:'#1a3f5a', border:'#4a90d9', text:'#80c0ff' },
  { id: 1, label: 'exit_success()',      sub: 'boards/qemu.rs',       color:'#1a4a3a', border:'#4ad98a', text:'#7dffba' },
  { id: 2, label: 'exit(0x5555)',        sub: 'code_new = 0x5555',    color:'#3a3a1a', border:'#c8a040', text:'#ffd080' },
  { id: 3, label: 'sw 0x5555, 0(0x100000)', sub: 'MMIO write (S-mode 직접)', color:'#3a1a1a', border:'#d44040', text:'#ffaaaa' },
  { id: 4, label: 'QEMU exit(0)',        sub: 'sifive_test @ 0x100000', color:'#2a1a3a', border:'#9b59b6', text:'#d7aefb' },
];

// ── 스텝 데이터 ──
const STEPS = [
  {
    title: 'rust_main: 초기화 완료 → exit_success() 호출',
    file: 'os/src/main.rs',
    code: CODE_MAIN, lineFrom: 7, lineTo: 8,
    callStep: 0,
    prevPage: '../boot/index.html',
    regs: { mode: 'S-mode', PC: '~0x80200400', addr: '─', val: '─' },
    desc: 'rust_main이 모든 초기화를 마치고 종료합니다.\n\n실행 순서:\n  clear_bss()      → .bss 0 초기화\n  logging::init()  → 로그 레벨 설정\n  println!(...)    → "[kernel] Hello, world!" 출력\n  섹션 주소 출력   → trace/debug/info/warn/error\n\n마지막으로 QEMU_EXIT_HANDLE.exit_success() 호출.\nSBI ecall 없이 S-mode에서 직접 MMIO write로 종료!',
    detail: 'sbi.rs의 shutdown()은 exit_failure()를 호출합니다 (CI 실패 테스트용). rust_main은 직접 exit_success()를 호출합니다.',
  },
  {
    title: 'exit_success() → exit(EXIT_SUCCESS = 0x5555)',
    file: 'os/src/boards/qemu.rs',
    code: CODE_BOARD, lineFrom: 5, lineTo: 7,
    callStep: 1,
    regs: { mode: 'S-mode', PC: '~0x80200500', addr: '─', val: '0x5555' },
    desc: 'exit_success()가 exit(0x5555)를 호출합니다.\n\nQEMU virt board test-finisher 규약:\n• 0x5555       → 정상 종료 (exit 0)  ✓\n• 0x3333xxxx   → 비정상 종료 (exit 1)\n• 0x7777       → QEMU 리셋\n\nEXIT_SUCCESS = 0x5555 상수는 SiFive test-finisher 스펙에서 정의됩니다.',
    detail: 'SiFive test-finisher: RISC-V QEMU virt 머신의 종료/리셋용 MMIO 디바이스. 주소 0x100000에 매핑됩니다.',
  },
  {
    title: 'exit(): 0x5555는 특수값 → 인코딩 없이 그대로',
    file: 'os/src/boards/qemu.rs',
    code: CODE_BOARD, lineFrom: 10, lineTo: 13,
    callStep: 2,
    regs: { mode: 'S-mode', PC: '~0x80200520', addr: '0x100000', val: '0x5555' },
    desc: 'exit() 내부에서 종료 코드를 처리합니다.\n\n• 0x5555, 0x3333xxxx, 0x7777 → 특수값, 그대로 사용\n• 그 외 일반 코드 → exit_code_encode()로 변환:\n    encode(code) = (code << 16) | 0x3333\n\n0x5555는 특수값이므로 변환 없이 code_new = 0x5555.\nself.addr = VIRT_TEST = 0x100000 (생성자에서 설정)',
    detail: 'exit_failure()는 exit_code_encode(1) = (1<<16)|0x3333 = 0x00013333을 씁니다.',
  },
  {
    title: 'asm! sw {0x5555}, 0({0x100000}) — MMIO write',
    file: 'os/src/boards/qemu.rs — inline asm',
    code: CODE_BOARD, lineFrom: 15, lineTo: 20,
    callStep: 3,
    regs: { mode: 'S-mode', PC: '~0x80200540', addr: '0x100000', val: '0x5555' },
    desc: 'RISC-V "sw" 명령으로 MMIO에 직접 씁니다.\n\n  sw 0x5555, 0(0x100000)\n  = 주소 0x100000에 워드값 0x5555 저장\n\nSBI ecall 없이 S-mode에서 직접 MMIO write!\nQEMU virt board는 S-mode에서 0x100000 접근을 허용합니다.\n\n이 한 명령으로 QEMU 종료 시퀀스가 트리거됩니다.',
    detail: 'MMIO(Memory-Mapped I/O): 하드웨어 레지스터를 일반 메모리 주소처럼 read/write. 실제 하드웨어에서는 PMP로 접근 제어.',
  },
  {
    title: 'QEMU test-finisher: 0x5555 수신 → 프로세스 종료',
    file: '— QEMU sifive_test @ 0x100000 —',
    code: CODE_BOARD, lineFrom: 26, lineTo: 27,
    callStep: 4,
    regs: { mode: '─', PC: '─', addr: '0x100000', val: '0x5555' },
    desc: 'QEMU가 MMIO write를 감지하고 프로세스를 종료합니다.\n\nQEMU sifive_test 디바이스 @ 0x100000:\n• 0x5555      → exit(0)  ✓ 정상 종료\n• 0x3333xxxx  → exit(1)  실패 종료\n• 0x7777      → machine reset\n\nrCore ch1 전체 실행 흐름:\n  QEMU → 0x1000 Firmware → 0x80000000 RustSBI\n  → 0x80200000 _start → rust_main (S-mode)\n  → exit_success() → sw 0x5555, 0(0x100000)\n  → QEMU exit(0)',
    detail: '실제 RISC-V 하드웨어: 전원 관리 IC(PMIC)에 종료 신호. QEMU: sifive_test MMIO로 시뮬레이션. SBI 개입 없음.',
  },
];
