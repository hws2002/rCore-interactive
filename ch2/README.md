# ch2 — 批处理系统

rCore ch2에서 다루는 batch OS의 trap 처리 흐름을 단계별로 시각화합니다.

---

## 실행 순서

```
① trap/   →   ② batch/
  [런타임: 매 ecall/예외]   [trap_handler 분기]
```

---

## ① trap — Trap 처리 전 과정

> **파일:** `trap/index.html`
> **단계:** 18 steps | **타임:** 런타임 (매 ecall / 예외)

**전체 흐름:**
```
run_next_app()
  → app_init_context(): TrapContext{sepc=0x80400000, SPP=User, x[2]=user_sp}
  → push_context(): TrapContext를 kernel stack에 배치
  → __restore(cx_ptr)
    · mv sp, a0        ← sp = TrapContext 주소
    · ld CSRs          ← sstatus/sepc/user_sp 복원
    · ld x1~x31        ← 일반 레지스터 복원
    · addi sp, 34*8    ← TrapContext 해제, sp = kernel_stack_top
    · csrrw sp,sscratch,sp ← sp=user_sp, sscratch=kernel_top
    · sret             ← PC=0x80400000, U-mode

[User 실행 중...]

ecall → hardware:
  sepc ← PC, scause ← 8, mode ← S, PC ← stvec=__alltraps

__alltraps:
  · csrrw sp, sscratch, sp  ← sp=kernel_top, sscratch=user_sp
  · addi sp, -34*8          ← TrapContext 공간 확보
  · sd x1~x31               ← 레지스터 저장
  · sd sstatus/sepc/user_sp ← CSR 저장
  · call trap_handler(cx)

trap_handler → __restore → sret
```

**핵심 데이터 구조:**
```
TrapContext {
    x: [usize; 32],  // x[0..31] — 일반 레지스터
    sstatus: Sstatus, // trap 이전 sstatus (SPP 포함)
    sepc: usize,      // trap을 일으킨 PC (또는 복귀 PC)
}
// 크기: 34 × 8 = 272 bytes
// 위치: kernel stack 최상단 (kernel_stack_top - 272)
```

**sp/sscratch 상태 변화:**
| 시점 | sp | sscratch |
|---|---|---|
| 최초 실행 | tcx_start | ─ (모름) |
| __restore CSR 복원 후 | tcx_start | user_stack_top |
| addi sp, 34*8 후 | kernel_stack_top | user_stack_top |
| csrrw 교환 후 (U-mode 직전) | user_stack_top | kernel_stack_top |
| __alltraps csrrw 직후 | kernel_stack_top | user_sp |
| addi sp, -34*8 후 | tcx_start | user_sp |

---

## ② batch — 경로 A / B 분기

> **파일:** `batch/index.html`
> **단계:** 8 steps | **타임:** trap_handler 처리 후

**경로 A — syscall (UserEnvCall):**
```
scause = 0x8 (ecall from U-mode)
  cx.sepc += 4        ← 다음 명령으로 복귀
  cx.x[10] = syscall(cx.x[17], ...) ← a0 = 반환값
  return cx → __restore → sret → 같은 앱 계속
```

**경로 B — 치명적 예외:**
```
scause = StoreFault / IllegalInstruction
  run_next_app()
    load next app → 0x80400000
    new TrapContext{sepc=0x80400000}
    __restore → sret → 다음 앱 처음부터
```

---

## 관련 소스 파일

```
os/src/
├── batch.rs          ← run_next_app, push_context, AppManager
├── trap/
│   ├── mod.rs        ← trap_handler, trap::init (stvec 설정)
│   ├── context.rs    ← TrapContext, app_init_context
│   └── trap.S        ← __alltraps, __restore
└── syscall/
    └── mod.rs        ← syscall 분기 (sys_write, sys_exit, ...)
```
