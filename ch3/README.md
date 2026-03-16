# ch3 — 多道程序与分时多任务

rCore ch3에서 다루는 태스크 관리와 컨텍스트 스위치를 단계별로 시각화합니다.

---

## 실행 순서

```
① load/   →   ② switch/
  [부팅 시]     [런타임: 타이머 인터럽트마다]
```

---

## ① load — 태스크 적재 & 첫 실행

> **파일:** `load/index.html`
> **단계:** 9 steps | **타임:** 커널 부팅 직후

**학습 내용:**
- 앱 바이너리들을 물리 메모리의 고정 슬롯에 적재
- 각 태스크의 `TaskControlBlock (TCB)` 빌드:
  - 커널 스택 할당
  - `TrapContext` 초기화 (sepc = 앱 진입점, sp = 유저 스택)
  - `TaskContext` 초기화 (ra = `__restore`, sp = 커널 스택)
- `run_first_task()`: 첫 번째 태스크의 `TaskContext`로 `__switch`

**핵심 메모리 레이아웃:**
```
0x80400000  App0 .text
0x803E0000  App1 .text
  ...
0x80286000  Task0 커널 스택 top
0x80284EF0  Task0 커널 스택 (TrapContext)
0x80283000  Task1 커널 스택 top
0x80281EF0  Task1 커널 스택 (TrapContext)
```

---

## ② switch — 타이머 인터럽트 & 컨텍스트 스위치

> **파일:** `switch/index.html`
> **단계:** 46 steps | **타임:** 런타임 (매 타이머 인터럽트)

**학습 내용:**

### Phase 1 — 인터럽트 트랩 (steps 1~20)
- 타이머 인터럽트 발생 → `stvec` → `__alltraps`
- `__alltraps`: `TrapContext`를 커널 스택에 저장
  - `sscratch ↔ sp` 교환 (유저 sp 저장, 커널 sp 복구)
  - `sd` 명령으로 레지스터 32개 + sstatus/sepc 저장
- `trap_handler(cx)` 호출: scause 확인 → 타이머 → `suspend_current_and_run_next()`

### Phase 2 — 컨텍스트 스위치 (steps 21~35)
- `__switch(cur_cx, nxt_cx)`:
  - **현재 태스크** `TaskContext` 저장 (ra, sp, s0~s11)
  - **다음 태스크** `TaskContext` 복원
  - `ret` → `ra`가 가리키는 `__restore`로 점프

### Phase 3 — 복귀 (steps 36~46)
- `__restore`:
  - 커널 스택에서 `TrapContext` 복원 (sstatus, sepc, 레지스터들)
  - `sscratch ↔ sp` 교환 (커널 sp 저장, 유저 sp 복구)
  - `sret` → sepc로 점프, U-mode 복귀

**핵심 데이터 구조:**

```
TaskContext { ra, sp, s0..s11 }   ← __switch가 저장/복원
TrapContext { x[0..32], sstatus, sepc }  ← __alltraps/__restore가 저장/복원
```

**특권 레벨 흐름:**
```
U-mode(App)  --타이머인터럽트-->  S-mode(__alltraps)
  --> trap_handler --> __switch --> __restore  --sret-->  U-mode(다음App)
```

---

## 관련 소스 파일

```
os/src/
├── task/
│   ├── mod.rs          ← TaskManager, run_first_task, suspend_current_and_run_next
│   ├── context.rs      ← TaskContext 구조체
│   └── switch.S        ← __switch 어셈블리
├── trap/
│   ├── mod.rs          ← trap_handler
│   └── trap.S          ← __alltraps, __restore
└── loader.rs           ← 앱 적재, get_app_data
```
