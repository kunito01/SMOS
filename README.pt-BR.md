<p align="center">
  <img src="./app/icon.svg" width="104" alt="Logotipo do Studio Map OS" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>SISTEMA OPERACIONAL DE PROJETOS CRIATIVOS</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.es.md">Español</a> · <strong>Português</strong> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>Faça um estúdio de uma pessoa funcionar como uma equipe completa.</strong><br />
  Um sistema operacional visual e local-first para projetos, criado para profissionais independentes e empresas de uma só pessoa.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="https://img.shields.io/badge/Live_Demo-Open_PWA-ff4b2b?style=for-the-badge&logo=pwa&logoColor=white" alt="Open Live Demo" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="https://img.shields.io/badge/Download-Portable_PWA-f4f414?style=for-the-badge&logo=github&logoColor=1c2328" alt="Download portable PWA" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="Estrelas no GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="Forks no GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="Issues no GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="PWA instalável" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Dados local-first" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## Visão geral

O Studio Map OS conecta marcas, grupos de projetos, projetos, pessoas, software, custos, cronogramas, marcos de lançamento e arquivos em um único espaço de trabalho visual. Ele ajuda profissionais independentes a conduzir vários projetos em paralelo sem reduzir o processo criativo a uma lista de tarefas genérica.

A versão atual é uma PWA instalável e local-first. Os dados de negócio permanecem no dispositivo, são criptografados com Web Crypto e armazenados de forma persistente no IndexedDB. Estão integrados o Web App Manifest, o Service Worker, a página alternativa offline, os ícones do aplicativo e o fluxo de empacotamento independente. Contas, chaves de recuperação e backups também são gerenciados no navegador; ainda não há conexão com um backend empresarial remoto nem com autenticação de servidor.

## Capturas de tela

![Visão geral do painel do Studio Map OS](./docs/screenshots/01.png)

![Visão do espaço de trabalho de um projeto no Studio Map OS](./docs/screenshots/02.png)

![Visão de gerenciamento do Studio Map OS](./docs/screenshots/03.png)

## Capacidades principais

| Operações de projetos | Controle local dos dados |
| --- | --- |
| Escopos de painel para todo o estúdio, por marca e por grupo de projetos | Contas locais e chaves de recuperação do espaço de trabalho |
| Status, fases, tarefas, cronogramas e lançamentos de projetos | Registros criptografados do espaço de trabalho no IndexedDB |
| Orçamentos por fase, valores a receber e totais em várias moedas | Backups criptografados do dispositivo, do espaço de trabalho e de projetos |
| Bibliotecas de pessoas, assinaturas de software e modelos de custos | Migração de dados legados do navegador e recuperação transacional |
| Arquivamento, restauração e exclusão permanente de projetos | Instantâneos compartilhados somente para leitura com controle por campo |
| Layouts para desktop, tablet e telas móveis estreitas | PWA instalável, página alternativa offline e onze idiomas de interface |

## Principais recursos

- **Marcas e grupos de projetos** — crie marcas distintas e organize o trabalho com tipos reutilizáveis de grupos de projetos.
- **Espaços de trabalho de projetos** — acompanhe status, fases, metas, tarefas, pessoas, ferramentas, materiais, versões e registros de atividade.
- **Cronogramas visuais** — configure datas de fases, tarefas, responsáveis, ferramentas, observações e linhas personalizadas para cada projeto.
- **Orçamentos estruturados** — planeje por fase pessoal, viagens, despesas diárias, terceirização, custos adicionais e software, incluindo impostos e contingência.
- **Custos e valores a receber** — consolide orçamentos, custos reais, assinaturas de software e cronogramas de pagamentos de projetos.
- **Bibliotecas reutilizáveis** — gerencie pessoas, ferramentas de software, assinaturas e modelos de custos.
- **Arquivo e portabilidade** — arquive projetos, exporte um projeto específico ou faça backup de todos os dados do Studio Map OS no navegador.
- **Compartilhamento somente para leitura** — escolha se um instantâneo do projeto inclui cronogramas, entregáveis, pessoas, ferramentas, materiais, versões e prévias de custos.
- **Interface internacional** — use o aplicativo em inglês, chinês simplificado, japonês, espanhol, português, alemão, francês, russo, turco, coreano ou tailandês.

## Tecnologia

- Next.js 15 com App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB e Local Storage

## Suporte a PWA

O Studio Map OS inclui uma estrutura completa de integração PWA:

- Um Web App Manifest com o modo de exibição `standalone` e `/login` como URL inicial.
- Ícones de 192×192 e 512×512, além de ícones maskable e Apple Touch.
- Registro automático do Service Worker e cache em tempo de execução com Serwist.
- Pré-cache da raiz, do login, do registro, da página offline, do manifest, do recurso de marca e dos ícones PWA.
- Uma página alternativa para navegação de documentos em `/offline`.
- Metadados para a tela inicial do iOS, cores do tema e `viewport-fit=cover`.
- Um pacote PWA portátil com o servidor independente do Next.js, recursos estáticos e um script de inicialização.

> [!NOTE]
> O modo de desenvolvimento desativa o Service Worker para impedir que caches desatualizados interfiram no desenvolvimento. Verifique a instalação, o cache e o funcionamento offline usando uma build de produção em `localhost` ou HTTPS.

## Primeiros passos

### Requisitos

- Recomenda-se Node.js 20 LTS
- npm
- Um navegador moderno compatível com Web Crypto e IndexedDB

### Instalação e execução

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

Abra [http://localhost:3000/register](http://localhost:3000/register) para criar a primeira conta local.

No primeiro uso:

1. Informe um nome, um endereço de e-mail e uma senha com pelo menos oito caracteres.
2. Crie um novo espaço de trabalho.
3. Copie ou baixe imediatamente a chave de recuperação de 16 dígitos gerada para o espaço de trabalho.
4. Confirme que a chave de recuperação está guardada com segurança antes de entrar no espaço de trabalho.

> [!IMPORTANT]
> A chave de recuperação não é armazenada em texto simples junto com a conta. Se a senha e a chave de recuperação forem perdidas e não houver nenhum backup utilizável, os dados do espaço de trabalho poderão se tornar irrecuperáveis.

Contas locais existentes podem entrar em [http://localhost:3000/login](http://localhost:3000/login). Não existe uma conta pré-configurada que aceite uma senha arbitrária.

### Modo de produção e verificação da PWA

```bash
npm run build
npm run start
```

Abra [http://localhost:3000/login](http://localhost:3000/login) em um navegador compatível com PWA para inspecionar o Manifest, o Service Worker e o ponto de entrada da instalação. Os navegadores tratam `localhost` como um contexto seguro; implantações de produção devem usar HTTPS.

### Criação de um pacote PWA portátil

```bash
npm run package:pwa
```

O pacote é gravado em `output/pwa/studio-map-os-pwa/`. Ele inclui o servidor independente, os recursos PWA e o inicializador para macOS `START_STUDIO_MAP_OS.command`, que usa `127.0.0.1:3002` por padrão.

## Rotas principais

| Rota | Finalidade |
| --- | --- |
| `/register` | Criar uma conta local e um espaço de trabalho, ou entrar em um deles usando um backup criptografado |
| `/login` | Desbloquear uma conta local ou restaurar um backup completo do dispositivo |
| `/offline` | Página alternativa do documento quando a navegação do Service Worker falha |
| `/dashboard` | Visão geral do estúdio, escopos, métricas e mapas de projetos |
| `/companies` | Gerenciamento de marcas e grupos de projetos |
| `/company/?companyId=...` | Detalhes da marca e resumos dos projetos vinculados |
| `/projects` | Todos os projetos ativos |
| `/project/?projectId=...` | Status, cronograma, lançamentos, valores a receber e configurações do projeto |
| `/project-costs/?projectId=...` | Detalhes do orçamento e dos custos do projeto |
| `/project-share/?projectId=...` | Configurações dos campos compartilhados no modo somente para leitura |
| `/costs` | Totais de custos do estúdio e configurações da moeda de exibição |
| `/libraries` | Bibliotecas de pessoas, assinaturas de software e modelos de custos |
| `/archive` | Projetos arquivados e recuperação de backups do dispositivo e do espaço de trabalho |
| `/share/?token=...` | Instantâneo local do projeto somente para leitura |

## Modelo de dados e segurança

```text
Páginas React
    ↓
Adaptadores locais em lib/api
    ↓
Banco de dados de negócio em memória
    ↓
Criptografia com Web Crypto
    ↓
Persistência no IndexedDB
```

- Os dados de negócio são isolados por espaço de trabalho e armazenados como registros criptografados no IndexedDB.
- Uma senha desbloqueia a chave mestra protegida do espaço de trabalho; a chave mestra é usada somente na memória após o login.
- A chave de recuperação de 16 dígitos pode recuperar a chave mestra do espaço de trabalho e desbloquear arquivos de backup criptografados.
- Os registros do espaço de trabalho e os envelopes de backup usam criptografia do navegador, incluindo PBKDF2, HKDF e AES-GCM.
- Um backup completo do dispositivo contém contas locais, espaços de trabalho, preferências e instantâneos criptografados do banco de dados. As exportações de espaços de trabalho e projetos também são criptografadas.
- Os navegadores podem recusar solicitações de armazenamento persistente, portanto os backups criptografados continuam sendo uma parte essencial da proteção dos dados.

> [!WARNING]
> Esses mecanismos não passaram por uma auditoria de segurança independente. Eles não substituem o gerenciamento profissional de chaves, os backups de servidor nem os sistemas corporativos de identidade.

## Custos em várias moedas

As moedas atuais de cálculo e exibição são:

- CNY — yuan chinês
- USD — dólar americano
- JPY — iene japonês
- EUR — euro

O navegador obtém diretamente as taxas de referência do serviço Frankfurter, respaldado pelo Banco Central Europeu (BCE); se a solicitação falhar, o aplicativo usa um cache recente do navegador ou as taxas integradas. As taxas de câmbio destinam-se a estimativas internas do estúdio, não a liquidações ou aconselhamento financeiro.

## Arquivos de backup

| Tipo | Conteúdo | Nome de arquivo habitual |
| --- | --- | --- |
| Backup completo do dispositivo | Todas as contas locais, os espaços de trabalho, as preferências e os dados criptografados | `studio-map-os-*.smos-backup.json` |
| Backup do espaço de trabalho | Dados de negócio e preferências do espaço de trabalho atual | `studio-map-os-workspace-*.smos-backup.json` |
| Arquivo de projeto | Instantâneo de um projeto | `studio-map-os-project-*.smos-project.json` |

Verifique o tipo de backup e a chave de recuperação antes de restaurar. A restauração de um backup completo do dispositivo pode substituir os dados existentes do Studio Map OS no navegador atual.

## Limites atuais do compartilhamento público

Os registros compartilhados somente para leitura permanecem atualmente no navegador e na origem do site que os gerou. Uma URL de compartilhamento pode ser aberta localmente, mas os dados não são publicados automaticamente em um servidor remoto. Por isso:

- Um link pode deixar de funcionar em outro navegador, após a limpeza dos dados do site ou em outro dispositivo.
- Esse recurso ainda não equivale a uma página pública hospedada na Internet.
- O compartilhamento entre dispositivos exigirá armazenamento remoto, controle de acesso e infraestrutura de revogação.

## Internacionalização

A interface oferece suporte a onze idiomas. Os arquivos de localidade recorrem ao inglês quando uma chave específica não está disponível; os dicionários de russo e turco cobrem atualmente todas as chaves de tradução. Melhorias de cobertura e redação são bem-vindas por meio de Issues e Pull Requests.

## Estrutura do projeto

```text
app/                  Rotas do Next.js, Manifest, Service Worker e pontos de entrada da PWA estática
components/           Páginas, módulos do produto, layout e UI compartilhada
lib/api/              Adaptadores locais da API de negócio
lib/i18n/             Dicionários da interface e rótulos de domínio
lib/mock/             Dados de demonstração e lógica de agregação
lib/security/         Criptografia do espaço de trabalho e do compartilhamento público
lib/storage/          IndexedDB e suporte a armazenamento persistente
lib/types/            Modelos de domínio
lib/utils/            Utilitários de orçamento, moeda, fase e lançamento
public/               Recursos de marca, ícones PWA e pacotes Worker gerados
scripts/              Scripts de build e empacotamento da PWA portátil
```

## Verificações de qualidade

```bash
npm run lint
npx tsc --noEmit --incremental false
```

O repositório ainda não inclui testes unitários ou end-to-end automatizados. Alterações em criptografia, migração, recuperação ou cálculos de orçamento devem passar por verificações adicionais antes da integração.

## Limitações atuais

- As APIs de negócio ainda são adaptadores locais do navegador; nenhum backend de servidor de produção está conectado.
- Novos projetos herdam partes da estrutura do projeto de demonstração em vez de começar com um modelo totalmente vazio.
- Os fluxos de edição de custos reais, materiais e registros de atividade ainda não estão totalmente disponíveis.
- Os detalhes dos grupos de projetos, a revogação do compartilhamento e os controles de expiração de links ainda precisam ser conectados.
- Uma atualização completa da página exige a senha para desbloquear o espaço de trabalho novamente.
- O suporte a PWA está integrado, mas testes automatizados do Lighthouse, do fluxo de instalação e end-to-end offline ainda não foram configurados.
- Páginas dinâmicas não armazenadas em cache e endpoints de rede em tempo real ainda podem ficar indisponíveis offline; a página alternativa offline e os dados locais não substituem APIs remotas.

## Contribuição

Issues e Pull Requests são bem-vindos. Antes de enviar uma alteração:

1. Descreva a página, o modelo de dados ou o escopo de migração afetados.
2. Verifique os layouts de desktop e de telas estreitas.
3. Execute o ESLint e a verificação do TypeScript.
4. Documente a compatibilidade com versões anteriores e a recuperação de backups em alterações do formato dos dados.

## Licença e direitos autorais

Este projeto é disponibilizado sob os termos da Apache License 2.0. Consulte [LICENSE](./LICENSE) para mais detalhes. Você pode usar, copiar, modificar e distribuir o projeto de acordo com os termos da licença.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. Todos os direitos reservados.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
