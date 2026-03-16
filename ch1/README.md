# ch1 — 应用程序与基本执行环境

rCore ch1에서 다루는 개념들을 단계별로 시각화합니다.

---

## 실행 순서

```
① layout/   →   ② boot/   →   ③ shutdown/
  [BUILD TIME]     [RUN TIME]     [RUN TIME]
```

각 visualizer 마지막 스텝의 **이동 버튼**으로 자연스럽게 이어집니다.

---

## ① layout — 设置正确的程序内存布局

> **파일:** `layout/index.html`
> **단계:** 10 steps | **타임:** Build Time (cargo build 시 결정)

**학습 내용:**
- 왜 링커 스크립트가 필요한가 (기본 레이아웃의 문제점)
- `.cargo/config.toml`에서 `-Tsrc/linker.ld` 지정
- `linker.ld` 섹션 배치 순서:
  - `.text` (코드) — `.text.entry` 우선 배치로 `_start @ 0x80200000` 보장
  - `.rodata` (읽기전용 데이터)
  - `.data` (초기화된 전역변수)
  - `.bss.stack` (64KB 부팅 스택) + `.bss` (미초기화 데이터)
- `entry.asm`: `la sp, boot_stack_top`으로 스택 포인터 초기화
- 최종 ELF 바이너리 생성 → QEMU 실행 준비 완료

**핵심 주소:**
| 심볼 | 주소 |
|------|------|
| `stext` / `_start` | `0x80200000` |
| `etext` / `srodata` | `~0x80202000` |
| `sdata` | `~0x80203000` |
| `boot_stack_lower_bound` | `~0x80204000` |
| `boot_stack_top` / `sbss` | `~0x80214000` |
| `ebss` / `ekernel` | `~0x80215000` |

---

## ② boot — 裸机启动过程

> **파일:** `boot/index.html`
> **단계:** 10 steps | **타임:** Run Time (QEMU 실행 시)

**학습 내용:**
- `qemu-system-riscv64`가 `layout/`에서 만든 `os.bin`을 `0x80200000`에 적재
- CPU 파워온 → PC = `0x1000` (RISC-V reset vector)
- `0x1000` Firmware ROM: hart ID 읽기 → RustSBI 주소 로드 → 점프
- `0x80000000` RustSBI (M-mode):
  - UART / 타이머 / PMP 초기화
  - `medeleg` / `mideleg` 설정 (트랩 S-mode 위임)
  - `mepc = 0x80200000`, `mstatus.MPP = S-mode`
  - `mret` → **M-mode에서 S-mode로 전환!**
- `0x80200000` `_start` → `la sp, boot_stack_top` → `call rust_main`

**특권 레벨 전환:**
```
M-mode (RustSBI)  --mret-->  S-mode (Kernel)
```

---

## ③ shutdown — 关机过程

> **파일:** `shutdown/index.html`
> **단계:** 8 steps | **타임:** Run Time

**학습 내용:**
- `rust_main` 종료 시 `shutdown()` 호출
- `sbi_call(SBI_SHUTDOWN=8, 0, 0, 0)` → 레지스터 설정 (a7=8)
- `ecall` 명령 → **S-mode에서 M-mode로 트랩** 발생
- RustSBI M-mode 트랩 핸들러: `a7=8` 확인 → SBI_SHUTDOWN 처리
- QEMU test-finisher MMIO (`0x100000`)에 `0x5555` 쓰기 → `exit(0)`

**특권 레벨 전환:**
```
S-mode (Kernel)  --ecall-->  M-mode (RustSBI)  -->  QEMU exit
```

---

## 참고 — boot_chain (Overview)

> **파일:** `boot_chain/index.html`

ch1 전체 부팅 흐름을 7단계 개요로 빠르게 확인하는 별도 시각화.
세부 내용보다 **전체 그림**을 파악하고 싶을 때 먼저 보세요.

---

## 관련 소스 파일

```
os/src/
├── linker.ld       ← ①에서 핵심
├── entry.asm       ← ①, ② 연결 지점
├── main.rs         ← ② 마지막 단계
└── sbi.rs          ← ③에서 핵심
```
