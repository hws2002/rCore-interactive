// ── boot_chain/data.js ──
const CODE_FIRMWARE = [
  "reset_vector @ 0x1000",
  "setup temporary stack",
  "load next stage entry = 0x80000000",
  "jump 0x80000000"
];
const CODE_RUSTSBI = [
  "rustsbi_main @ 0x80000000",
  "init UART / timer / interrupt ctrl",
  "delegate traps to S-mode (medeleg/mideleg)",
  "setup PMP for supervisor",
  "load kernel entry = 0x80200000",
  "mret to supervisor entry"
];
const CODE_KERNEL = [
  "_start @ 0x80200000",
  "set sp = boot_stack_top",
  "call rust_main",
  "clear_bss()",
  "mm::init()",
  "trap::init()",
  "task::add_initproc()",
  "task::run_first_task()"
];

const SEGMENTS = [
  {id:"fw",  cls:"s-firmware", name:"Firmware (QEMU reset)", range:"0x00001000 ...", reason:"reset vector"},
  {id:"sbi", cls:"s-rustsbi",  name:"RustSBI",               range:"0x80000000 ...", reason:"machine-mode runtime / SBI"},
  {id:"k",   cls:"s-kernel",   name:"KERNEL_BIN",            range:"0x80200000 ...", reason:"linked kernel entry"}
];

const STEPS = [
  {
    title:"Reset lands at firmware vector",
    file:"qemu reset vector",
    code:CODE_FIRMWARE, line:0,
    desc:"CPU starts in M-mode at reset vector (here shown as 0x1000).\nFirmware prepares next stage jump.",
    active:["fw"],
    regs:{pc:"0x00001000", mode:"M", mepc:"-", stvec:"-", satp:"Bare"}
  },
  {
    title:"Firmware jumps to RustSBI",
    file:"firmware handoff",
    code:CODE_FIRMWARE, line:3,
    desc:"After minimal setup, control transfers to RustSBI at 0x80000000.",
    active:["fw","sbi"],
    regs:{pc:"0x80000000", mode:"M", mepc:"-", stvec:"-", satp:"Bare"}
  },
  {
    title:"RustSBI hardware init",
    file:"rustsbi platform init",
    code:CODE_RUSTSBI, line:1,
    desc:"RustSBI initializes UART/timer/interrupt controller\nand prepares runtime services for S-mode OS.",
    active:["sbi"],
    regs:{pc:"0x80000020", mode:"M", mepc:"-", stvec:"0x8000xxxx", satp:"Bare"}
  },
  {
    title:"RustSBI config for supervisor boot",
    file:"rustsbi trap/pmp setup",
    code:CODE_RUSTSBI, line:3,
    desc:"Configure delegation and PMP so supervisor kernel can run safely.",
    active:["sbi"],
    regs:{pc:"0x80000100", mode:"M", mepc:"0x80200000", stvec:"0x8000xxxx", satp:"Bare"}
  },
  {
    title:"RustSBI jumps to kernel entry",
    file:"rustsbi -> kernel",
    code:CODE_RUSTSBI, line:5,
    desc:"RustSBI sets mepc=0x80200000 and uses mret,\nentering S-mode kernel entry.",
    active:["sbi","k"],
    regs:{pc:"0x80200000", mode:"S", mepc:"0x80200000", stvec:"0x8000xxxx", satp:"Bare"}
  },
  {
    title:"Kernel _start begins",
    file:"os/src/entry.asm",
    code:CODE_KERNEL, line:1,
    desc:"Kernel sets stack then calls rust_main.\nControl is now inside KERNEL_BIN.",
    active:["k"],
    regs:{pc:"0x80200040", mode:"S", mepc:"-", stvec:"0x8000xxxx", satp:"Bare"}
  },
  {
    title:"Kernel early init sequence",
    file:"os/src/main.rs",
    code:CODE_KERNEL, line:5,
    desc:"Kernel clears BSS, initializes MM/trap,\nand then prepares first task scheduling.",
    active:["k"],
    regs:{pc:"0x80200180", mode:"S", mepc:"-", stvec:"__alltraps", satp:"Sv39"}
  }
];
