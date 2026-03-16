// ── ch1_boot/data.js ──
// 裸机启动过程: QEMU → 0x1000 Firmware → 0x80000000 RustSBI → 0x80200000 Kernel

// 주소 공간 세그먼트 (SVG 렌더링용)
const SEGMENTS = [
  { id:'k',   label:'KERNEL_BIN',          addrTop:'~0x80280000', addrBot:'0x80200000', color:'#1a5c3a', textColor:'#7dffba' },
  { id:'sbi', label:'RustSBI (M-mode)',     addrTop:'0x80200000',  addrBot:'0x80000000', color:'#1e3f7a', textColor:'#80c0ff' },
  { id:'fw',  label:'QEMU Firmware ROM',   addrTop:'~0x00002000', addrBot:'0x00001000', color:'#3a3a5a', textColor:'#b0b0e0' },
];

// SVG 내 각 세그먼트의 Y 위치 (고정 레이아웃)
const SEG_LAYOUT = {
  k:   { y: 28, h: 46 },
  sbi: { y: 82, h: 55 },
  // y=145~170: zigzag gap
  fw:  { y: 172, h: 38 },
};

// PC 값 → SVG Y 좌표 매핑
// 각 세그먼트 진입점(하단 경계)은 주소 라벨과 일치하도록 세그먼트 바닥으로 매핑
function pcToY(pcStr) {
  if (!pcStr || pcStr === '─') return null;
  const addr = parseInt(pcStr, 16);
  if (isNaN(addr)) return null;
  if (addr >= 0x80200000) {
    // 0x80200000 = k 세그먼트 바닥(진입점 = 낮은 주소 = 높은 SVG y)
    if (addr === 0x80200000) return SEG_LAYOUT.k.y + SEG_LAYOUT.k.h;
    return SEG_LAYOUT.k.y + SEG_LAYOUT.k.h / 2;
  }
  if (addr >= 0x80000000) {
    // 0x80000000 = sbi 세그먼트 바닥(RustSBI 진입점)
    if (addr === 0x80000000) return SEG_LAYOUT.sbi.y + SEG_LAYOUT.sbi.h;
    return SEG_LAYOUT.sbi.y + SEG_LAYOUT.sbi.h / 2;
  }
  if (addr >= 0x1000) {
    // 0x1000 = fw 세그먼트 바닥(Firmware 진입점)
    if (addr === 0x1000) return SEG_LAYOUT.fw.y + SEG_LAYOUT.fw.h;
    return SEG_LAYOUT.fw.y + SEG_LAYOUT.fw.h / 2;
  }
  return null;
}

// ── 코드 스니펫 ──
const CODE_QEMU = [
  'qemu-system-riscv64 \\',
  '  -machine virt \\',
  '  -nographic \\',
  '  -bios ../bootloader/rustsbi-qemu.bin \\',
  '  -device loader,\\',
  '    file=target/.../os.bin,\\',
  '    addr=0x80200000',
];

const CODE_FIRMWARE = [
  '# 0x1000: reset_vector  (QEMU virt 고정 ROM)',
  'reset_vector:',
  '  auipc t0, 0      # t0 = 0x1000 (현재 PC)',
  '  addi  a2, t0, 40 # a2 = DTB 주소',
  '  csrr  a0, mhartid # a0 = hart ID (= 0)',
  '  ld    t0, 24(t0)  # t0 = jump_target = 0x80000000',
  '  jr    t0          # → RustSBI!',
];

const CODE_RUSTSBI = [
  '// 0x80000000: rustsbi_main  (M-mode)',
  'fn rustsbi_main() {',
  '    init_uart();              // 콘솔 출력',
  '    init_timer();             // CLINT 타이머',
  '    init_pmp();               // 물리 메모리 보호',
  '    medeleg = 0xb1ab;         // 예외 → S-mode',
  '    mideleg = 0x0222;         // 인터럽트 → S-mode',
  '    mepc    = 0x80200000;     // 커널 진입점',
  '    mstatus.MPP = S_MODE;     // 다음 모드 = S',
  '    mret();  // PC←mepc, mode←MPP',
  '}',
];

const CODE_ENTRY = [
  '# os/src/entry.asm',
  '    .section .text.entry',
  '    .globl _start',
  '_start:                    # @ 0x80200000',
  '    la sp, boot_stack_top  # sp 초기화 (64KB 스택)',
  '    call rust_main          # Rust 커널 진입',
  '',
  '    .section .bss.stack',
  'boot_stack_lower_bound:',
  '    .space 4096 * 16       # 64KB',
  'boot_stack_top:',
];

const CODE_RUST_MAIN = [
  '// os/src/main.rs',
  'global_asm!(include_str!("entry.asm"));',
  '',
  '#[no_mangle]',
  'pub fn rust_main() -> ! {',
  '    clear_bss();',
  '    logging::init();',
  '    println!("[kernel] Hello, world!");',
  '    // 섹션 주소 출력 (trace/debug/info/warn/error)',
  '    use crate::board::QEMUExit;',
  '    QEMU_EXIT_HANDLE.exit_success();',
  '}',
  '',
  'fn clear_bss() {',
  '    extern "C" { fn sbss(); fn ebss(); }',
  '    (sbss as usize..ebss as usize)',
  '        .for_each(|a| unsafe { (a as *mut u8).write_volatile(0) });',
  '}',
];

// ── 스텝 데이터 ──
const STEPS = [
  {
    title: 'QEMU 실행 — ch1_build에서 만든 os.bin 적재',
    file: 'Makefile / shell',
    code: CODE_QEMU, lineFrom: 0, lineTo: 6,
    active: [],
    prevPage: '../build/index.html',
    regs: { PC:'─', mode:'─', mepc:'─', mstatus:'─' },
    desc: '← ch1_build에서 linker.ld로 올바르게 배치된\nos.bin ELF 바이너리를 QEMU가 적재합니다.\n\n핵심 파라미터:\n• -machine virt: QEMU의 가상 RISC-V 보드\n• -bios rustsbi-qemu.bin → 0x80000000에 적재\n• -device loader,addr=0x80200000 → os.bin을 0x80200000에 적재\n\n아직 CPU는 동작 전 상태입니다.',
    detail: 'KERNEL_ENTRY_PA = 0x80200000은 linker.ld의 BASE_ADDRESS와 반드시 일치해야 합니다.',
  },
  {
    title: 'CPU 파워온: PC = 0x1000',
    file: 'RISC-V Hardware',
    code: CODE_QEMU, lineFrom: 0, lineTo: 6,
    active: ['fw'],
    regs: { PC:'0x00001000', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: 'QEMU가 전원을 인가합니다. CPU가 초기화됩니다.\n\n• 모든 일반 레지스터 = 0\n• PC = 0x1000  (RISC-V 스펙 정의 reset vector)\n• 특권 모드 = M-mode  (최고 특권)\n\n0x1000에는 QEMU virt 보드에 하드코딩된 소형 부트 코드가 있습니다.',
    detail: 'RISC-V 스펙: 리셋 시 PC는 구현 정의된 reset vector로 설정됩니다. QEMU virt는 0x1000을 사용합니다.',
  },
  {
    title: 'Firmware @ 0x1000 실행 시작',
    file: 'QEMU virt ROM (0x1000)',
    code: CODE_FIRMWARE, lineFrom: 2, lineTo: 5,
    active: ['fw'],
    regs: { PC:'0x00001000', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: '0x1000의 펌웨어 코드가 실행됩니다.\n\n이 코드는 QEMU virt 머신에 고정(ROM)되어 있으며,\n다음 부트스테이지(RustSBI)의 주소를 읽어 점프 준비를 합니다.\n\n주요 작업:\n• mhartid 읽기 → a0 = hart ID (= 0)\n• DTB 주소 계산 → a2\n• jump target = 0x80000000 로드 → t0',
    detail: 'auipc로 현재 PC 기반 상대 주소를 계산합니다. RISC-V 부팅 규약: a0=hartid, a1=dtb.',
  },
  {
    title: 'jr t0 직전 — 점프 대상 t0 = 0x80000000 준비 완료',
    file: 'QEMU virt ROM (0x1000)',
    code: CODE_FIRMWARE, lineFrom: 6, lineTo: 6,
    active: ['fw'],
    regs: { PC:'0x00001010', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: '`jr t0` 직전 상태입니다. t0에는 이미 0x80000000이 들어있습니다.\n\n• `ld t0, 24(t0)` 로 점프 타겟(0x80000000)을 t0에 로드 완료\n• a0 = 0 (hart ID), a1 = DTB 주소도 준비 완료\n• PC는 아직 0x1000 (Firmware ROM 내)\n\nNext를 누르면 `jr t0`가 실행되어 PC가 0x80000000으로 바뀝니다.',
    detail: 'QEMU virt ROM은 고정된 점프 테이블을 통해 bios(-bios 파라미터)의 적재 주소를 알아냅니다.',
  },
  {
    title: 'jr t0 완료 → PC = 0x80000000 (RustSBI 진입)',
    file: 'QEMU virt ROM → RustSBI',
    code: CODE_FIRMWARE, lineFrom: 6, lineTo: 6,
    active: ['fw', 'sbi'],
    regs: { PC:'0x80000000', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: '`jr t0` 명령이 실행되어 PC가 0x80000000으로 점프했습니다.\n\n• PC = 0x80000000 (RustSBI 시작)\n• M-mode 유지 (특권 변화 없음)\n\nRustSBI가 하드웨어 초기화를 시작합니다.',
    detail: '-bios로 지정한 rustsbi-qemu.bin이 이미 0x80000000에 적재되어 있어 즉시 실행됩니다.',
  },
  {
    title: 'RustSBI: 하드웨어 초기화',
    file: 'RustSBI @ 0x80000000 (M-mode)',
    code: CODE_RUSTSBI, lineFrom: 2, lineTo: 4,
    active: ['sbi'],
    regs: { PC:'0x80000004', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: 'RustSBI가 M-mode에서 하드웨어를 초기화합니다.\n\n• UART: 콘솔 출력 준비\n• 타이머: CLINT 타이머 초기화\n• PMP: Physical Memory Protection\n  (커널이 접근 가능한 메모리 영역 정의)\n\nRustSBI 배너가 콘솔에 출력됩니다:\n  "[rustsbi] Version ...\n   [rustsbi] Platform: QEMU"',
    detail: 'SBI = Supervisor Binary Interface. OS 커널과 펌웨어 사이의 표준 인터페이스 (RISC-V 스펙).',
  },
  {
    title: 'RustSBI: medeleg / mideleg 설정',
    file: 'RustSBI (M-mode)',
    code: CODE_RUSTSBI, lineFrom: 5, lineTo: 6,
    active: ['sbi'],
    regs: { PC:'0x80000008', mode:'M', mepc:'0x00000000', mstatus:'0x00000000' },
    desc: 'M-mode CSR을 설정하여 트랩을 S-mode로 위임합니다.\n\n• medeleg = 0xb1ab: 예외(exception)를 S-mode에서 처리\n  (페이지폴트, ecall from U-mode, 불법 명령 등)\n• mideleg = 0x0222: 인터럽트를 S-mode에서 처리\n  (타이머 인터럽트, 외부 인터럽트)\n\n이 설정 후 OS 커널이 직접 트랩을 처리할 수 있습니다.',
    detail: 'medeleg/mideleg 비트 1: 해당 트랩을 M-mode handler 대신 S-mode의 stvec로 전달합니다.',
  },
  {
    title: 'RustSBI: mepc = 0x80200000, mstatus.MPP = S',
    file: 'RustSBI (M-mode)',
    code: CODE_RUSTSBI, lineFrom: 7, lineTo: 8,
    active: ['sbi', 'k'],
    regs: { PC:'0x8000000C', mode:'M', mepc:'0x80200000', mstatus:'0x00000800' },
    desc: 'RustSBI가 커널 진입을 준비합니다.\n\n• mepc = 0x80200000: mret 후 점프할 주소\n• mstatus.MPP = 01 (S-mode): mret 후 전환될 특권 모드\n\n"[rustsbi] Kernel entry: 0x80200000" 출력\n\nmret 명령은:\n  ① PC ← mepc = 0x80200000\n  ② mode ← mstatus.MPP = S-mode',
    detail: 'MPP(Machine Previous Privilege): mret 실행 시 복귀할 특권 레벨. 01=S-mode, 00=U-mode, 11=M-mode.',
  },
  {
    title: 'mret 직전 — mepc/MPP 설정 완료, 실행 대기',
    file: 'RustSBI (M-mode)',
    code: CODE_RUSTSBI, lineFrom: 9, lineTo: 9,
    active: ['sbi', 'k'],
    regs: { PC:'0x80000010', mode:'M', mepc:'0x80200000', mstatus:'0x00000800' },
    desc: '`mret` 직전 상태입니다. 모든 준비가 완료되었습니다.\n\n현재:\n• PC = 0x80000010 (RustSBI 내부, mret 명령 바로 앞)\n• mepc = 0x80200000 (mret 후 점프할 주소)\n• mstatus.MPP = 01 (S-mode, mret 후 전환될 모드)\n\nNext를 누르면 `mret`이 실행되어 PC가 0x80200000으로 바뀌고\nM-mode → S-mode로 전환됩니다.',
    detail: 'mret은 "machine-mode return" 명령입니다. mepc에 저장된 주소로 돌아가며 mstatus.MPP가 가리키는 특권 레벨로 전환합니다.',
  },
  {
    title: 'mret 완료 → S-mode 진입, PC = 0x80200000',
    file: 'RustSBI mret → Kernel _start',
    code: CODE_RUSTSBI, lineFrom: 9, lineTo: 9,
    active: ['k'],
    regs: { PC:'0x80200000', mode:'S', mepc:'0x80200000', mstatus:'0x00000100' },
    desc: '`mret` 명령이 실행되어 특권 모드가 전환됐습니다!\n\nmret 효과:\n① PC ← mepc = 0x80200000\n② mode ← MPP = S-mode  ← 핵심!\n③ mstatus.MIE ← MPIE\n\n이제 CPU는 S-mode(Supervisor Mode)로 동작하며,\nKERNEL_BIN의 _start 명령을 실행합니다.',
    detail: 'M → S mode 전환. 커널은 이제 S-mode 특권: U-mode 앱보다 높고 M-mode(RustSBI)보다는 낮습니다.',
  },
  {
    title: '_start: la sp, boot_stack_top',
    file: 'os/src/entry.asm @ 0x80200000 (런타임)',
    code: CODE_ENTRY, lineFrom: 3, lineTo: 4,
    active: ['k'],
    regs: { PC:'0x80200008', mode:'S', mepc:'0x80200000', mstatus:'0x00000100' },
    desc: 'CPU가 0x80200000에서 첫 명령을 실행합니다.\n\n`la sp, boot_stack_top`\n  = lui + addi (2 명령어 × 4바이트 = 8바이트)\n  = sp ← 0x80214000 (빌드타임에 링커가 계산한 값)\n  → 실행 후 PC = 0x80200008\n\nsp가 없으면 call 명령 즉시 크래시 —\n그래서 rust_main 호출 전에 반드시 sp를 초기화해야 합니다.\n\n스택은 높은 주소(top)에서 아래로 자랍니다.',
    detail: 'la = lui + addi 두 명령어로 확장됩니다. boot_stack_top 주소는 빌드타임에 링커가 확정하여 바이너리에 인코딩되어 있습니다.',
  },
  {
    title: 'call rust_main → Rust 커널 진입',
    file: 'os/src/entry.asm → os/src/main.rs (런타임)',
    code: CODE_ENTRY, lineFrom: 5, lineTo: 5,
    active: ['k'],
    showSp: true,
    regs: { PC:'0x80200010', mode:'S', mepc:'0x80200000', mstatus:'0x00000100' },
    desc: '`call rust_main`으로 Rust 함수로 점프합니다.\n\ncall = auipc ra, offset + jalr ra\n  → ra(반환주소) 저장 후 rust_main으로 점프\n\n`#[no_mangle]` 덕분에 링커가 rust_main 심볼을 찾을 수 있습니다.\n없으면 링크 실패: "undefined symbol: rust_main"',
    detail: 'global_asm!(include_str!("entry.asm"))으로 entry.asm이 main.rs와 같은 컴파일 단위에 포함됩니다.',
  },
  {
    title: 'rust_main: clear_bss() — .bss 영역 0으로 초기화',
    file: 'os/src/main.rs (런타임)',
    code: CODE_RUST_MAIN, lineFrom: 13, lineTo: 17,
    active: ['k'],
    showSp: true,
    regs: { PC:'0x80200100', mode:'S', mepc:'0x80200000', mstatus:'0x00000100' },
    desc: 'rust_main의 첫 번째 작업: clear_bss()\n\nsbss ~ ebss 범위(~0x80214000 ~ ~0x80215000)를 0으로 초기화합니다.\n\n이유:\n  ELF .bss 섹션은 파일에 초기값이 없습니다.\n  (크기만 기록, 실제 데이터 없음)\n  → 런타임에 소프트웨어가 직접 0으로 채워야 합니다.\n\nsbss/ebss 심볼은 linker.ld에서 정의됩니다.',
    detail: 'write_volatile: 컴파일러 최적화로 루프가 제거되지 않도록 volatile write를 사용합니다.',
  },
  {
    title: 'rust_main: exit_success() → QEMU 종료',
    file: 'os/src/main.rs → os/src/boards/qemu.rs (런타임)',
    code: CODE_RUST_MAIN, lineFrom: 9, lineTo: 10,
    active: ['k'],
    showSp: true,
    nextPage: '../shutdown/index.html',
    regs: { PC:'0x80200200', mode:'S', mepc:'0x80200000', mstatus:'0x00000100' },
    desc: 'rust_main이 QEMU_EXIT_HANDLE.exit_success()로 종료합니다.\n\nSBI ecall 없이 S-mode에서 직접 MMIO write!\n\nexit_success() → exit(0x5555)\n  → asm!("sw {0}, 0({1})", 0x5555, 0x100000)\n  → QEMU sifive_test @ 0x100000 → exit(0)\n\n裸机 환경에서 Rust 커널이 성공적으로 실행되고 종료됩니다!',
    detail: '이 exit_success() 흐름 전체는 ch1/shutdown에서 자세히 다룹니다.',
  },
];
