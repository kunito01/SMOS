<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS 로고" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>CREATIVE PROJECT OPERATING SYSTEM</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.es.md">Español</a> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <strong>한국어</strong> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>1인 스튜디오를 완전한 팀처럼 운영하세요.</strong><br />
  독립 크리에이터와 1인 기업을 위한 로컬 우선 비주얼 프로젝트 운영 시스템입니다.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="https://img.shields.io/badge/Live_Demo-Open_PWA-ff4b2b?style=for-the-badge&logo=pwa&logoColor=white" alt="Open Live Demo" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="https://img.shields.io/badge/Download-Portable_PWA-f4f414?style=for-the-badge&logo=github&logoColor=1c2328" alt="Download portable PWA" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub 스타" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub 포크" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub 이슈" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="설치 가능한 PWA" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="로컬 우선 데이터" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## 개요

Studio Map OS는 브랜드, 프로젝트 그룹, 프로젝트, 인력, 소프트웨어, 비용, 타임라인, 릴리스 체크포인트, 아카이브를 하나의 시각적 작업 공간으로 연결합니다. 창작 과정을 일반적인 할 일 목록에 억지로 맞추지 않으면서, 독립 크리에이터가 여러 프로젝트를 동시에 운영할 수 있도록 돕습니다.

현재 버전은 설치 가능한 로컬 우선 PWA입니다. 업무 데이터는 기기에 보관되며 Web Crypto로 암호화한 뒤 IndexedDB에 영구 저장됩니다. Web App Manifest, Service Worker, 오프라인 대체 화면, 애플리케이션 아이콘, 독립 실행형 패키징 워크플로가 통합되어 있습니다. 계정, 복구 키, 백업도 브라우저에서 처리됩니다. 원격 업무 백엔드와 서버 인증은 아직 연결되어 있지 않습니다.

## 스크린샷

![Studio Map OS 화면 01](./docs/screenshots/01.png)

![Studio Map OS 화면 02](./docs/screenshots/02.png)

![Studio Map OS 화면 03](./docs/screenshots/03.png)

## 핵심 기능 영역

| 프로젝트 운영 | 로컬 데이터 관리 |
| --- | --- |
| 스튜디오 전체, 브랜드, 프로젝트 그룹 단위의 대시보드 범위 | 로컬 계정과 작업 공간 복구 키 |
| 프로젝트 상태, 단계, 작업, 타임라인, 릴리스 | 암호화된 IndexedDB 작업 공간 레코드 |
| 단계별 예산, 미수금, 다중 통화 합계 | 암호화된 기기, 작업 공간, 프로젝트 백업 |
| 인력, 소프트웨어 구독, 비용 템플릿 라이브러리 | 기존 브라우저 데이터 마이그레이션과 트랜잭션 기반 복구 |
| 프로젝트 아카이브, 복원, 영구 삭제 | 필드별로 제어하는 읽기 전용 공유 스냅샷 |
| 데스크톱, 태블릿, 좁은 모바일 화면용 레이아웃 | 설치 가능한 PWA, 오프라인 대체 화면, 11개 인터페이스 언어 |

## 주요 기능

- **브랜드와 프로젝트 그룹** — 브랜드를 구분해 만들고 재사용 가능한 프로젝트 그룹 유형으로 작업을 정리합니다.
- **프로젝트 작업 공간** — 상태, 단계, 목표, 작업, 인력, 도구, 자료, 버전, 활동 기록을 추적합니다.
- **시각적 타임라인** — 프로젝트별 단계 일정, 작업, 담당자, 도구, 메모, 사용자 지정 행을 설정합니다.
- **구조화된 예산** — 세금과 예비비를 포함하여 인건비, 이동비, 일일 경비, 외주비, 추가 비용, 소프트웨어 비용을 단계별로 계획합니다.
- **비용과 미수금** — 예산, 실제 비용, 소프트웨어 구독, 프로젝트 대금 지급 일정을 통합합니다.
- **재사용 가능한 라이브러리** — 인력, 소프트웨어 도구, 구독, 비용 템플릿을 관리합니다.
- **아카이브와 이동성** — 프로젝트를 보관하고 개별 프로젝트를 내보내거나 브라우저의 모든 Studio Map OS 데이터를 백업합니다.
- **읽기 전용 공유** — 프로젝트 스냅샷에 타임라인, 결과물, 인력, 도구, 자료, 버전, 비용 미리보기 중 무엇을 포함할지 선택합니다.
- **다국어 인터페이스** — 영어, 중국어 간체, 일본어, 스페인어, 포르투갈어, 독일어, 프랑스어, 러시아어, 튀르키예어, 한국어, 태국어를 사용할 수 있습니다.

## 기술 구성

- App Router를 사용하는 Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB 및 Local Storage

## PWA 지원

Studio Map OS에는 완전한 PWA 통합 구조가 포함되어 있습니다.

- 표시 모드가 `standalone`이고 시작 URL이 `/login`인 Web App Manifest.
- 192×192, 512×512, 마스커블, Apple Touch 아이콘.
- Serwist 기반 Service Worker 자동 등록 및 런타임 캐싱.
- 루트, 로그인, 회원가입, 오프라인 페이지, Manifest, 브랜드 자산, PWA 아이콘 사전 캐싱.
- `/offline`의 문서 탐색 대체 화면.
- iOS 홈 화면 메타데이터, 테마 색상, `viewport-fit=cover`.
- 독립 실행형 Next.js 서버, 정적 자산, 실행 스크립트를 포함하는 휴대용 PWA 번들.

> [!NOTE]
> 개발 모드에서는 오래된 캐시가 개발을 방해하지 않도록 Service Worker를 비활성화합니다. 설치, 캐싱, 오프라인 동작은 `localhost` 또는 HTTPS의 프로덕션 빌드에서 확인하세요.

## 시작하기

### 요구 사항

- Node.js 20 LTS 권장
- npm
- Web Crypto와 IndexedDB를 지원하는 최신 브라우저

### 설치 및 실행

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

[http://localhost:3000/register](http://localhost:3000/register)를 열어 첫 번째 로컬 계정을 만드세요.

처음 사용할 때:

1. 이름, 이메일 주소, 8자 이상의 비밀번호를 입력합니다.
2. 새 작업 공간을 만듭니다.
3. 생성된 16자리 작업 공간 복구 키를 즉시 복사하거나 다운로드합니다.
4. 작업 공간에 들어가기 전에 복구 키가 안전하게 보관되었는지 확인합니다.

> [!IMPORTANT]
> 복구 키는 계정과 함께 평문으로 저장되지 않습니다. 비밀번호와 복구 키를 모두 잃어버리고 사용할 수 있는 백업도 없다면 작업 공간 데이터를 복구하지 못할 수 있습니다.

기존 로컬 계정은 [http://localhost:3000/login](http://localhost:3000/login)에서 로그인할 수 있습니다. 임의의 비밀번호를 허용하도록 미리 설정된 계정은 없습니다.

### 프로덕션 모드 및 PWA 확인

```bash
npm run build
npm run start
```

PWA를 지원하는 브라우저에서 [http://localhost:3000/login](http://localhost:3000/login)을 열어 Manifest, Service Worker, 설치 진입점을 확인하세요. 브라우저는 `localhost`를 보안 컨텍스트로 취급합니다. 프로덕션 배포에는 HTTPS를 사용해야 합니다.

### 휴대용 PWA 번들 만들기

```bash
npm run package:pwa
```

번들은 `output/pwa/studio-map-os-pwa/`에 생성됩니다. 독립 실행형 서버, PWA 자산, macOS 실행 프로그램 `START_STUDIO_MAP_OS.command`가 포함되며 기본적으로 `127.0.0.1:3002`를 사용합니다.

## 주요 경로

| 경로 | 용도 |
| --- | --- |
| `/register` | 로컬 계정과 작업 공간을 만들거나 암호화된 백업으로 기존 작업 공간에 참여 |
| `/login` | 로컬 계정의 잠금을 해제하거나 기기 전체 백업을 복원 |
| `/offline` | Service Worker 탐색이 실패했을 때 표시되는 문서 대체 화면 |
| `/dashboard` | 스튜디오 개요, 범위, 지표, 프로젝트 맵 |
| `/companies` | 브랜드 및 프로젝트 그룹 관리 |
| `/company/?companyId=...` | 브랜드 세부 정보와 연결된 프로젝트 요약 |
| `/projects` | 진행 중인 모든 프로젝트 |
| `/project/?projectId=...` | 프로젝트 상태, 타임라인, 릴리스, 미수금, 설정 |
| `/project-costs/?projectId=...` | 프로젝트 예산 및 비용 세부 정보 |
| `/project-share/?projectId=...` | 읽기 전용 공유 필드 설정 |
| `/costs` | 스튜디오 전체 비용 합계 및 표시 통화 설정 |
| `/libraries` | 인력, 소프트웨어 구독, 비용 템플릿 라이브러리 |
| `/archive` | 보관된 프로젝트와 기기 및 작업 공간 백업 복구 |
| `/share/?token=...` | 로컬 읽기 전용 프로젝트 스냅샷 |

## 데이터 및 보안 모델

```text
React 페이지
    ↓
lib/api의 로컬 어댑터
    ↓
메모리 내 업무 데이터베이스
    ↓
Web Crypto 암호화
    ↓
IndexedDB 영구 저장
```

- 업무 데이터는 작업 공간별로 분리되며 암호화된 IndexedDB 레코드로 저장됩니다.
- 비밀번호는 보호된 작업 공간 마스터 키의 잠금을 해제합니다. 마스터 키는 로그인 후 메모리에서만 사용됩니다.
- 16자리 복구 키로 작업 공간 마스터 키를 복구하고 암호화된 백업 파일의 잠금을 해제할 수 있습니다.
- 작업 공간 레코드와 백업 봉투에는 PBKDF2, HKDF, AES-GCM을 비롯한 브라우저 암호화 기술이 사용됩니다.
- 기기 전체 백업에는 로컬 계정, 작업 공간, 환경 설정, 암호화된 데이터베이스 스냅샷이 포함됩니다. 작업 공간과 프로젝트 내보내기도 암호화됩니다.
- 브라우저가 영구 저장소 요청을 거부할 수 있으므로 암호화된 백업은 여전히 데이터 보호의 핵심 요소입니다.

> [!WARNING]
> 이러한 메커니즘은 독립적인 보안 감사를 받지 않았습니다. 전문적인 키 관리, 서버 백업 또는 기업용 ID 시스템을 대신할 수 없습니다.

## 다중 통화 비용

현재 계산 및 표시에 지원되는 통화는 다음과 같습니다.

- CNY — 중국 위안
- USD — 미국 달러
- JPY — 일본 엔
- EUR — 유로

브라우저는 Frankfurter의 ECB 지원 서비스에서 기준 환율을 직접 가져오며, 가져오지 못하면 브라우저 캐시 또는 내장 환율을 사용합니다. 환율은 스튜디오 내부 견적용이며 결제 또는 재무 자문을 위한 것이 아닙니다.

## 백업 파일

| 유형 | 내용 | 일반적인 파일 이름 |
| --- | --- | --- |
| 기기 전체 백업 | 모든 로컬 계정, 작업 공간, 환경 설정, 암호화된 데이터 | `studio-map-os-*.smos-backup.json` |
| 작업 공간 백업 | 현재 작업 공간의 업무 데이터와 환경 설정 | `studio-map-os-workspace-*.smos-backup.json` |
| 프로젝트 파일 | 프로젝트 스냅샷 1개 | `studio-map-os-project-*.smos-project.json` |

복원하기 전에 백업 유형과 복구 키를 확인하세요. 기기 전체를 복원하면 현재 브라우저의 기존 Studio Map OS 데이터가 교체될 수 있습니다.

## 현재 공개 공유 범위

읽기 전용 공유 레코드는 현재 이를 생성한 브라우저와 웹사이트 오리진에 보관됩니다. 공유 URL은 로컬에서 열 수 있지만 데이터가 원격 서버에 자동으로 게시되지는 않습니다. 따라서 다음과 같은 제한이 있습니다.

- 다른 브라우저에서 열거나, 사이트 데이터를 지우거나, 다른 기기를 사용하면 링크가 작동하지 않을 수 있습니다.
- 이 기능은 아직 인터넷에 호스팅되는 공개 페이지와 같지 않습니다.
- 기기 간 공유에는 원격 저장소, 접근 제어, 접근 취소 인프라가 필요합니다.

## 국제화

인터페이스는 11개 언어를 지원합니다. 전용 번역 키가 없으면 로케일 파일이 영어로 대체됩니다. 현재 러시아어와 튀르키예어 사전은 모든 번역 키를 포함합니다. Issue와 Pull Request를 통한 번역 범위 및 표현 개선을 환영합니다.

## 프로젝트 구조

```text
app/                  Next.js 경로, Manifest, Service Worker, 정적 PWA 진입점
components/           페이지, 제품 모듈, 레이아웃, 공통 UI
lib/api/              로컬 업무 API 어댑터
lib/i18n/             인터페이스 사전 및 도메인 레이블
lib/mock/             데모 시드 데이터 및 집계 로직
lib/security/         작업 공간 및 공개 공유 암호화
lib/storage/          IndexedDB 및 영구 저장소 지원
lib/types/            도메인 모델
lib/utils/            예산, 통화, 단계, 릴리스 유틸리티
public/               브랜드 자산, PWA 아이콘, 생성된 Worker 번들
scripts/              휴대용 PWA 빌드 및 패키징 스크립트
```

## 품질 검사

```bash
npm run lint
npx tsc --noEmit --incremental false
```

이 저장소에는 아직 자동화된 단위 테스트나 엔드 투 엔드 테스트가 없습니다. 암호화, 마이그레이션, 복구 또는 예산 계산을 변경한 경우 병합 전에 추가로 검증해야 합니다.

## 현재 제한 사항

- 업무 API는 여전히 브라우저 로컬 어댑터이며 프로덕션 서버 백엔드에 연결되어 있지 않습니다.
- 새 프로젝트는 완전히 빈 템플릿에서 시작하지 않고 데모 프로젝트 구조의 일부를 상속합니다.
- 실제 비용, 자료, 활동 기록의 편집 흐름은 아직 완전히 제공되지 않습니다.
- 프로젝트 그룹 세부 정보, 공유 취소, 링크 만료 제어는 아직 연결 작업이 필요합니다.
- 페이지를 완전히 새로 고치면 작업 공간의 잠금을 해제하기 위해 비밀번호를 다시 입력해야 합니다.
- PWA 지원은 통합되었지만 자동화된 Lighthouse, 설치 흐름, 오프라인 엔드 투 엔드 테스트는 아직 구성되지 않았습니다.
- 캐시되지 않은 동적 페이지와 실시간 네트워크 엔드포인트는 오프라인에서 사용하지 못할 수 있습니다. 오프라인 대체 화면과 로컬 데이터는 원격 API를 대신하지 않습니다.

## 기여하기

Issue와 Pull Request를 환영합니다. 변경 사항을 제출하기 전에 다음을 확인하세요.

1. 영향을 받는 페이지, 데이터 모델 또는 마이그레이션 범위를 설명합니다.
2. 데스크톱과 좁은 화면의 레이아웃을 모두 확인합니다.
3. ESLint와 TypeScript 검사를 실행합니다.
4. 데이터 형식을 변경한 경우 하위 호환성과 백업 복구 방법을 문서화합니다.

## 라이선스

이 프로젝트는 Apache License 2.0에 따라 제공됩니다. 자세한 내용은 [LICENSE](./LICENSE)를 참조하세요. 라이선스 조건에 따라 프로젝트를 사용, 복제, 수정, 배포할 수 있습니다.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. All rights reserved.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
