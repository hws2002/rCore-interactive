// ── ch1_layout/data.js ──
// 设置正确的程序内存布局: linker.ld → entry.asm → clear_bss → 최종 메모리 맵

// ── 섹션 정의 (바텀→탑 순서) ──
// 각 섹션은 BASE(0x80200000)로부터의 오프셋과 크기를 가짐
// 시각화: 아래=낮은 주소, 위=높은 주소
const ALL_SECTIONS = [
  { id:'text',  label:'.text',         sublabel:'코드 (entry+kernel)', color:'#1a4a7a', border:'#4a90d9', addrStr:'0x80200000', sizeStr:'~8KB' },
  { id:'rodata',label:'.rodata',       sublabel:'읽기전용 데이터',      color:'#1a5a3a', border:'#4ad98a', addrStr:'~0x80202000', sizeStr:'~4KB' },
  { id:'data',  label:'.data',         sublabel:'초기화된 데이터',      color:'#3a4a1a', border:'#a0c840', addrStr:'~0x80203000', sizeStr:'~4KB' },
  { id:'stack', label:'.bss.stack',    sublabel:'부팅 스택 64KB',       color:'#6a1e55', border:'#d44fa0', addrStr:'~0x80204000', sizeStr:'64KB' },
  { id:'bss',   label:'.bss',          sublabel:'미초기화 데이터',      color:'#3a2a1a', border:'#c88040', addrStr:'~0x80214000', sizeStr:'~4KB' },
];

// 각 스텝에서 보여줄 섹션들 (누적 추가)
// visibleUntil: 이 섹션이 다이어그램에 나타나는 첫 스텝 (0-based)

// ── 코드 스니펫 ──
const CODE_CARGO = [
  '# .cargo/config.toml',
  '[build]',
  'target = "riscv64gc-unknown-none-elf"',
  '',
  '[target.riscv64gc-unknown-none-elf]',
  'rustflags = [',
  '    "-C", "link-arg=-Tsrc/linker.ld",',
  '    # ^ 커스텀 링커 스크립트 지정',
  ']',
];

const CODE_LINKER_HEADER = [
  '/* os/src/linker.ld */',
  'OUTPUT_ARCH(riscv)',
  'ENTRY(_start)             /* 진입점 = _start 심볼 */',
  '',
  'BASE_ADDRESS = 0x80200000; /* 커널 물리 주소 */',
  '',
  'SECTIONS {',
  '  . = BASE_ADDRESS;       /* 현재 주소 = 0x80200000 */',
  '  skernel = .;            /* 커널 시작 심볼 */',
];

const CODE_LINKER_TEXT = [
  '  /* ① .text 섹션: 코드 */',
  '  stext = .;              /* 0x80200000 */',
  '  .text : {',
  '    *(.text.entry)        /* _start 먼저! */',
  '    *(.text .text.*)      /* 나머지 코드 */',
  '  }',
  '  . = ALIGN(4K);          /* 4K 정렬 */',
  '  etext = .;              /* ~0x80202000 */',
];

const CODE_LINKER_RODATA = [
  '  /* ② .rodata 섹션: 읽기전용 데이터 */',
  '  srodata = .;',
  '  .rodata : {',
  '    *(.rodata .rodata.*)',
  '    *(.srodata .srodata.*)',
  '  }',
  '  . = ALIGN(4K);',
  '  erodata = .;            /* ~0x80203000 */',
];

const CODE_LINKER_DATA = [
  '  /* ③ .data 섹션: 초기화된 전역변수 */',
  '  sdata = .;',
  '  .data : {',
  '    *(.data .data.*)',
  '    *(.sdata .sdata.*)',
  '  }',
  '  . = ALIGN(4K);',
  '  edata = .;              /* ~0x80204000 */',
];

const CODE_LINKER_BSS = [
  '  /* ④ .bss 섹션: 미초기화 데이터 + 스택 */',
  '  .bss : {',
  '    *(.bss.stack)         /* 스택 먼저! 64KB */',
  '    sbss = .;             /* BSS 시작 (스택 제외) */',
  '    *(.bss .bss.*)',
  '    *(.sbss .sbss.*)',
  '  }',
  '  . = ALIGN(4K);',
  '  ebss = .;',
  '  ekernel = .;            /* 커널 끝 주소 */',
  '}',
];

const CODE_ENTRY = [
  '# os/src/entry.asm',
  '    .section .text.entry   # .text.entry 섹션에 배치',
  '    .globl _start',
  '_start:                    # @ 0x80200000 (링커가 보장)',
  '    la sp, boot_stack_top  # sp = 스택 최상단 주소',
  '    call rust_main          # Rust 커널 진입!',
  '',
  '    .section .bss.stack    # .bss.stack 섹션',
  'boot_stack_lower_bound:',
  '    .space 4096 * 16       # 64KB 예약',
  'boot_stack_top:            # sp 초기값이 여기를 가리킴',
];

const CODE_BUILD_DONE = [
  '# ① 컴파일 + 링크 완료',
  '$ cargo build --release',
  '   Compiling os v0.1.0',
  '    Finished in 3.14s',
  '',
  '# ② 이제 QEMU로 실행 (→ ch1_boot)',
  '$ qemu-system-riscv64 \\',
  '    -machine virt -nographic \\',
  '    -bios rustsbi-qemu.bin \\',
  '    -device loader,\\',
  '      file=os.bin,\\',
  '      addr=0x80200000',
];

// ── 스텝 데이터 ──
const STEPS = [
  {
    title: '문제: 링커 스크립트 없이 빌드',
    file: '─ 초기 상태 ─',
    code: CODE_CARGO, lineFrom: 0, lineTo: 8,
    sections: [],
    highlight: [],
    symbols: {},
    desc: '링커 스크립트가 없으면 컴파일러가 기본 레이아웃을 사용합니다.\n\n문제점:\n• _start 가 0x80200000에 배치된다는 보장 없음\n• .text.entry가 반드시 먼저 배치된다는 보장 없음\n• CPU는 0x80200000에서 실행 시작 → 엉뚱한 코드 실행\n\n해결: 커스텀 링커 스크립트(linker.ld)를 작성하고\n.cargo/config.toml에서 rustflags로 지정합니다.',
    detail: 'bare-metal 환경에서는 런타임(OS)이 없으므로 프로그램을 정확한 주소에 배치하는 것이 매우 중요합니다.',
  },
  {
    title: '.cargo/config.toml: -Tsrc/linker.ld',
    file: '.cargo/config.toml',
    code: CODE_CARGO, lineFrom: 5, lineTo: 8,
    sections: [],
    highlight: [],
    symbols: {},
    desc: '.cargo/config.toml의 rustflags에 링커 스크립트를 지정합니다.\n\n`"-C", "link-arg=-Tsrc/linker.ld"`\n\n이 설정으로 cargo build 시 자동으로\n링커 스크립트가 적용됩니다.\n\n타겟: riscv64gc-unknown-none-elf\n• riscv64gc: RISC-V 64비트 + GC 확장\n• unknown: 벤더 없음\n• none: OS 없음 (bare-metal)\n• elf: ELF 바이너리 형식',
    detail: 'RISC-V bare-metal 개발: std 없이 core만 사용. #![no_std] #![no_main] 필수.',
  },
  {
    title: 'linker.ld: OUTPUT_ARCH + ENTRY + BASE_ADDRESS',
    file: 'os/src/linker.ld',
    code: CODE_LINKER_HEADER, lineFrom: 1, lineTo: 8,
    sections: [],
    highlight: [],
    symbols: { BASE: '0x80200000' },
    desc: '링커 스크립트의 헤더 부분입니다.\n\n• OUTPUT_ARCH(riscv): RISC-V 아키텍처 ELF 출력\n• ENTRY(_start): ELF entry point = _start 심볼\n• BASE_ADDRESS = 0x80200000\n  → 커널 물리 베이스 주소 (RustSBI가 적재하는 곳)\n• . = BASE_ADDRESS\n  → 현재 위치 카운터를 베이스로 설정\n\n왜 0x80200000인가?\n  QEMU virt 보드: DRAM 시작 = 0x80000000 (하드웨어 스펙)\n  RustSBI: 앞 2MB(0x80000000~0x80200000)를 자신이 사용\n  → 커널은 0x80200000부터 시작하는 것이 관례\n\n이 값은 세 군데가 서로 약속한 값입니다:\n  ① RustSBI 소스: mepc = 0x80200000 (하드코딩)\n  ② QEMU 실행: -device loader,addr=0x80200000\n  ③ linker.ld: BASE_ADDRESS = 0x80200000  ← 지금 여기\n  셋 중 하나라도 다르면 커널이 실행되지 않습니다.',
    detail: 'RustSBI의 mepc는 rustsbi-qemu 소스에 KERNEL_ENTRY = 0x8020_0000으로 하드코딩되어 있습니다. RISC-V 생태계 관례(convention)이며, 하드웨어 스펙이 강제하는 값은 아닙니다.',
  },
  {
    title: '.text 섹션: .text.entry 우선 배치',
    file: 'os/src/linker.ld',
    code: CODE_LINKER_TEXT, lineFrom: 1, lineTo: 7,
    sections: ['text'],
    highlight: ['text'],
    symbols: { stext: '0x80200000', etext: '~0x80202000' },
    desc: '.text 섹션이 베이스 주소에 배치됩니다.\n\n핵심: `*(.text.entry)` 를 먼저!\n\nentry.asm의 _start는 .text.entry 섹션에 있으므로\n0x80200000에 정확히 위치합니다.\n\n그 다음 *(.text .text.*) 로 나머지 코드.\n\nALIGN(4K): 다음 섹션은 4K 경계에서 시작.',
    detail: '_start가 0x80200000에 있지 않으면 RustSBI가 mret 시 엉뚱한 명령을 실행하게 됩니다. .text.entry 우선 배치가 핵심!',
  },
  {
    title: 'ALIGN(4K) → .rodata 섹션',
    file: 'os/src/linker.ld',
    code: CODE_LINKER_RODATA, lineFrom: 1, lineTo: 7,
    sections: ['text', 'rodata'],
    highlight: ['rodata'],
    symbols: { stext: '0x80200000', etext: '~0x80202000', srodata: '~0x80202000', erodata: '~0x80203000' },
    desc: '.text 끝에서 4K 정렬 후 .rodata가 시작됩니다.\n\n.rodata: 읽기 전용 데이터\n• 문자열 리터럴 ("Hello, world!" 등)\n• const 배열, 정적 문자열\n• .srodata: 짧은 읽기전용 데이터 (RISC-V 소형 섹션)\n\netext = srodata ≈ 0x80202000',
    detail: '4K 정렬: 페이지 기반 메모리 보호(PMP, 이후 페이징)에서 섹션 단위로 접근 권한을 다르게 설정하기 위함입니다.',
  },
  {
    title: 'ALIGN(4K) → .data 섹션',
    file: 'os/src/linker.ld',
    code: CODE_LINKER_DATA, lineFrom: 1, lineTo: 7,
    sections: ['text', 'rodata', 'data'],
    highlight: ['data'],
    symbols: { stext: '0x80200000', srodata: '~0x80202000', sdata: '~0x80203000', edata: '~0x80204000' },
    desc: '.rodata 끝에서 4K 정렬 후 .data가 시작됩니다.\n\n.data: 초기화된 전역/정적 변수\n• 예: static mut COUNTER: u32 = 42;\n• 링커가 초기값을 바이너리에 포함\n• .sdata: 짧은 데이터 (RISC-V GP 기준 상대 접근)\n\nsdata ≈ 0x80203000, edata ≈ 0x80204000',
    detail: '.data 섹션은 ELF 파일에 초기값이 저장되어 있으며, 실행 전 복사가 필요합니다. bare-metal에서는 부트로더가 처리하거나 startup code에서 직접 처리합니다.',
  },
  {
    title: '.bss 섹션: .bss.stack 먼저 (64KB 스택)',
    file: 'os/src/linker.ld',
    code: CODE_LINKER_BSS, lineFrom: 1, lineTo: 9,
    sections: ['text', 'rodata', 'data', 'stack'],
    highlight: ['stack'],
    symbols: { sdata: '~0x80203000', edata: '~0x80204000', stack_lb: '~0x80204000', stack_top: '~0x80214000' },
    desc: '.bss 섹션에서 `.bss.stack`을 먼저 배치합니다.\n\n• .bss.stack = 부팅 스택 (entry.asm에서 선언)\n• 크기: 4096 × 16 = 65536 bytes = 64KB\n• boot_stack_lower_bound ~ boot_stack_top\n\n스택을 먼저 배치하는 이유:\n• sbss는 스택 이후부터 시작 (스택은 clear 불필요)\n• clear_bss()가 스택을 덮어쓰지 않도록',
    detail: '스택은 높은 주소(top)에서 낮은 주소로 자랍니다. boot_stack_top이 sp 초기값이 됩니다.',
  },
  {
    title: 'entry.asm 컴파일 → .text.entry + .bss.stack 섹션으로 ELF에 포함',
    file: 'os/src/entry.asm (소스코드 → 기계어로 변환되어 ELF에 삽입)',
    code: CODE_ENTRY, lineFrom: 0, lineTo: 10,
    sections: ['text', 'rodata', 'data', 'stack', 'bss'],
    highlight: ['text', 'stack'],
    symbols: {
      '_start':    '0x80200000 (링커 확정)',
      'stack_top': '0x80214000 (링커 확정)',
      sbss:        '~0x80214000',
      ebss:        '~0x80215000',
    },
    desc: '[ 빌드 타임 ] entry.asm이 컴파일되어 ELF에 들어갑니다.\n\n링커가 확정한 심볼:\n  _start        = 0x80200000  (.text.entry 시작)\n  boot_stack_top = 0x80214000  (.bss.stack 끝)\n\n_start, la sp, call rust_main의 실제 실행은\n→ ch1/boot에서 다룹니다 (런타임)',
    detail: 'entry.asm은 소스코드입니다. 이 시각화(ch1/build)는 빌드타임까지만 다룹니다.',
  },
  {
    title: 'ELF 빌드 완료 → QEMU 실행 준비',
    file: '$ cargo build → $ qemu-system-riscv64',
    code: CODE_BUILD_DONE, lineFrom: 0, lineTo: 3,
    sections: ['text', 'rodata', 'data', 'stack', 'bss'],
    highlight: [],
    nextPage: '../boot/index.html',
    symbols: {
      stext:     '0x80200000',
      etext:     '0x80202000',
      srodata:   '0x80202000',
      erodata:   '0x80203000',
      sdata:     '0x80203000',
      edata:     '0x80204000',
      stack_lb:  '0x80204000',
      stack_top: '0x80214000',
      sbss:      '0x80214000',
      ebss:      '0x80215000',
    },
    desc: '[ BUILD TIME 완료 ]\nlinker.ld에 따라 모든 섹션이 올바른 주소에 배치된\nos.bin ELF 바이너리가 생성되었습니다.\n\n이제 qemu-system-riscv64로 실행하면:\n  → 0x1000 Firmware ROM 실행\n  → 0x80000000 RustSBI 초기화\n  → 0x80200000 _start (우리가 만든 커널!)\n\n→ ch1_boot에서 이어집니다.',
    detail: '빌드 타임(linker.ld, cargo build)에서의 작업이 끝났습니다. 이후는 모두 런타임(QEMU 실행 중)입니다.',
  },
];
