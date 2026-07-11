<p align="center">
  <img src="./app/icon.svg" width="104" alt="Logo de Studio Map OS" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>SYSTÈME D’EXPLOITATION POUR PROJETS CRÉATIFS</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.es.md">Español</a> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <strong>Français</strong> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>Faites fonctionner un studio d’une seule personne comme une équipe au complet.</strong><br />
  Un système d’exploitation visuel et local-first pour les projets des créateurs indépendants et des entreprises individuelles.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="https://img.shields.io/badge/Live_Demo-Open_PWA-ff4b2b?style=for-the-badge&logo=pwa&logoColor=white" alt="Open Live Demo" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="https://img.shields.io/badge/Download-Portable_PWA-f4f414?style=for-the-badge&logo=github&logoColor=1c2328" alt="Download portable PWA" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="Étoiles GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="Forks GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="Issues GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="PWA installable" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Données local-first" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## Présentation

Studio Map OS relie les marques, groupes de projets, projets, personnes, logiciels, coûts, calendriers, jalons de publication et archives au sein d’un espace de travail visuel unique. Il aide les créateurs indépendants à mener plusieurs projets en parallèle sans réduire le processus créatif à une liste de tâches générique.

La version actuelle est une PWA installable et local-first. Les données métier restent sur l’appareil, sont chiffrées avec Web Crypto et conservées dans IndexedDB. Le Web App Manifest, le Service Worker, la page de repli hors ligne, les icônes d’application et le processus de création d’un paquet autonome sont intégrés. Les comptes, clés de récupération et sauvegardes sont également gérés dans le navigateur ; aucun backend métier distant ni système d’authentification serveur n’est encore connecté.

## Captures d’écran

![Vue d’ensemble du tableau de bord de Studio Map OS](./docs/screenshots/01.png)

![Vue de l’espace de travail d’un projet dans Studio Map OS](./docs/screenshots/02.png)

![Vue de gestion de Studio Map OS](./docs/screenshots/03.png)

## Fonctionnalités essentielles

| Gestion des projets | Contrôle local des données |
| --- | --- |
| Périmètres de tableau de bord pour le studio, les marques et les groupes de projets | Comptes locaux et clés de récupération de l’espace de travail |
| Statut, phases, tâches, calendriers et publications des projets | Enregistrements chiffrés de l’espace de travail dans IndexedDB |
| Budgets par phase, créances et totaux multidevises | Sauvegardes chiffrées de l’appareil, de l’espace de travail et des projets |
| Bibliothèques de personnes, abonnements logiciels et modèles de coûts | Migration des anciennes données du navigateur et récupération transactionnelle |
| Archivage, restauration et suppression définitive des projets | Instantanés partagés en lecture seule avec contrôle par champ |
| Mises en page pour ordinateur, tablette et mobile étroit | PWA installable, page de repli hors ligne et onze langues d’interface |

## Principales fonctions

- **Marques et groupes de projets** — créez des marques distinctes et organisez le travail avec des types de groupes de projets réutilisables.
- **Espaces de travail des projets** — suivez le statut, les phases, les objectifs, les tâches, les personnes, les outils, les ressources, les versions et les journaux d’activité.
- **Calendriers visuels** — configurez pour chaque projet les dates des phases, les tâches, les responsables, les outils, les notes et les lignes personnalisées.
- **Budgets structurés** — planifiez par phase le personnel, les déplacements, les dépenses quotidiennes, la sous-traitance, les coûts supplémentaires et les logiciels, y compris les taxes et les imprévus.
- **Coûts et créances** — consolidez les budgets, les coûts réels, les abonnements logiciels et les échéanciers de paiement des projets.
- **Bibliothèques réutilisables** — gérez les personnes, les outils logiciels, les abonnements et les modèles de coûts.
- **Archivage et portabilité** — archivez des projets, exportez un projet précis ou sauvegardez l’ensemble des données de Studio Map OS dans le navigateur.
- **Partage en lecture seule** — choisissez si un instantané de projet comprend les calendriers, livrables, personnes, outils, ressources, versions et aperçus des coûts.
- **Interface internationale** — utilisez l’application en anglais, chinois simplifié, japonais, espagnol, portugais, allemand, français, russe, turc, coréen ou thaï.

## Technologies

- Next.js 15 avec App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB et Local Storage

## Prise en charge PWA

Studio Map OS comprend une structure complète d’intégration PWA :

- Un Web App Manifest avec le mode d’affichage `standalone` et `/login` comme URL de démarrage.
- Des icônes 192×192 et 512×512, ainsi que des icônes maskable et Apple Touch.
- L’enregistrement automatique du Service Worker et la mise en cache à l’exécution avec Serwist.
- La pré-mise en cache de la racine, de la connexion, de l’inscription, de la page hors ligne, du manifest, de la ressource de marque et des icônes PWA.
- Une page de repli pour la navigation des documents à l’adresse `/offline`.
- Les métadonnées d’écran d’accueil iOS, les couleurs de thème et `viewport-fit=cover`.
- Un paquet PWA portable contenant le serveur Next.js autonome, les ressources statiques et un script de lancement.

> [!NOTE]
> Le mode développement désactive le Service Worker afin d’éviter que des caches obsolètes ne perturbent le développement. Vérifiez l’installation, la mise en cache et le fonctionnement hors ligne avec une build de production sur `localhost` ou HTTPS.

## Bien démarrer

### Prérequis

- Node.js 20 LTS recommandé
- npm
- Un navigateur moderne prenant en charge Web Crypto et IndexedDB

### Installation et exécution

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

Ouvrez [http://localhost:3000/register](http://localhost:3000/register) pour créer le premier compte local.

Lors de la première utilisation :

1. Saisissez un nom, une adresse e-mail et un mot de passe d’au moins huit caractères.
2. Créez un nouvel espace de travail.
3. Copiez ou téléchargez immédiatement la clé de récupération à 16 chiffres générée pour l’espace de travail.
4. Confirmez que la clé de récupération est conservée en lieu sûr avant d’accéder à l’espace de travail.

> [!IMPORTANT]
> La clé de récupération n’est pas stockée en clair avec le compte. Si le mot de passe et la clé de récupération sont tous deux perdus et qu’aucune sauvegarde exploitable ne subsiste, les données de l’espace de travail peuvent devenir irrécupérables.

Les comptes locaux existants peuvent se connecter sur [http://localhost:3000/login](http://localhost:3000/login). Aucun compte préconfiguré n’accepte un mot de passe arbitraire.

### Mode production et vérification de la PWA

```bash
npm run build
npm run start
```

Ouvrez [http://localhost:3000/login](http://localhost:3000/login) dans un navigateur compatible PWA pour inspecter le Manifest, le Service Worker et le point d’entrée de l’installation. Les navigateurs considèrent `localhost` comme un contexte sécurisé ; les déploiements de production doivent utiliser HTTPS.

### Création d’un paquet PWA portable

```bash
npm run package:pwa
```

Le paquet est créé dans `output/pwa/studio-map-os-pwa/`. Il comprend le serveur autonome, les ressources PWA et le lanceur macOS `START_STUDIO_MAP_OS.command`, qui utilise `127.0.0.1:3002` par défaut.

## Routes principales

| Route | Fonction |
| --- | --- |
| `/register` | Créer un compte local et un espace de travail, ou en rejoindre un avec une sauvegarde chiffrée |
| `/login` | Déverrouiller un compte local ou restaurer une sauvegarde complète de l’appareil |
| `/offline` | Page de repli du document lorsque la navigation du Service Worker échoue |
| `/dashboard` | Vue d’ensemble du studio, périmètres, métriques et cartes des projets |
| `/companies` | Gestion des marques et groupes de projets |
| `/company/?companyId=...` | Détails de la marque et résumés des projets associés |
| `/projects` | Tous les projets actifs |
| `/project/?projectId=...` | Statut, calendrier, publications, créances et paramètres du projet |
| `/project-costs/?projectId=...` | Détails du budget et des coûts du projet |
| `/project-share/?projectId=...` | Paramètres des champs partagés en lecture seule |
| `/costs` | Totaux des coûts du studio et paramètres de la devise d’affichage |
| `/libraries` | Bibliothèques de personnes, d’abonnements logiciels et de modèles de coûts |
| `/archive` | Projets archivés et récupération des sauvegardes de l’appareil et de l’espace de travail |
| `/share/?token=...` | Instantané local du projet en lecture seule |

## Modèle de données et de sécurité

```text
Pages React
    ↓
Adaptateurs locaux dans lib/api
    ↓
Base de données métier en mémoire
    ↓
Chiffrement Web Crypto
    ↓
Persistance IndexedDB
```

- Les données métier sont isolées par espace de travail et stockées sous forme d’enregistrements IndexedDB chiffrés.
- Un mot de passe déverrouille la clé maîtresse protégée de l’espace de travail ; cette clé n’est utilisée qu’en mémoire après la connexion.
- La clé de récupération à 16 chiffres permet de récupérer la clé maîtresse de l’espace de travail et de déverrouiller les fichiers de sauvegarde chiffrés.
- Les enregistrements de l’espace de travail et les enveloppes de sauvegarde utilisent la cryptographie du navigateur, notamment PBKDF2, HKDF et AES-GCM.
- Une sauvegarde complète de l’appareil contient les comptes locaux, les espaces de travail, les préférences et les instantanés chiffrés de la base de données. Les exports d’espaces de travail et de projets sont également chiffrés.
- Les navigateurs peuvent refuser les demandes de stockage persistant ; les sauvegardes chiffrées restent donc un élément essentiel de la protection des données.

> [!WARNING]
> Ces mécanismes n’ont pas fait l’objet d’un audit de sécurité indépendant. Ils ne remplacent ni une gestion professionnelle des clés, ni des sauvegardes serveur, ni des systèmes d’identité d’entreprise.

## Coûts multidevises

Les devises actuellement utilisées pour le calcul et l’affichage sont :

- CNY — yuan chinois
- USD — dollar américain
- JPY — yen japonais
- EUR — euro

Le navigateur récupère directement les taux de référence auprès du service Frankfurter adossé à la Banque centrale européenne (BCE) ; en cas d’échec, l’application utilise un cache récent du navigateur ou les taux intégrés. Les taux de change sont destinés aux estimations internes du studio, et non aux règlements ou aux conseils financiers.

## Fichiers de sauvegarde

| Type | Contenu | Nom de fichier habituel |
| --- | --- | --- |
| Sauvegarde complète de l’appareil | Tous les comptes locaux, espaces de travail, préférences et données chiffrées | `studio-map-os-*.smos-backup.json` |
| Sauvegarde de l’espace de travail | Données métier et préférences de l’espace de travail actuel | `studio-map-os-workspace-*.smos-backup.json` |
| Fichier de projet | Instantané d’un projet | `studio-map-os-project-*.smos-project.json` |

Vérifiez le type de sauvegarde et la clé de récupération avant toute restauration. La restauration d’une sauvegarde complète de l’appareil peut remplacer les données Studio Map OS présentes dans le navigateur actuel.

## Limites actuelles du partage public

Les enregistrements partagés en lecture seule restent actuellement dans le navigateur et sur l’origine du site qui les a générés. Une URL de partage peut être ouverte localement, mais les données ne sont pas publiées automatiquement sur un serveur distant. Par conséquent :

- Un lien peut cesser de fonctionner dans un autre navigateur, après l’effacement des données du site ou sur un autre appareil.
- Cette fonctionnalité n’équivaut pas encore à une page publique hébergée sur Internet.
- Le partage entre appareils nécessitera un stockage distant, un contrôle des accès et une infrastructure de révocation.

## Internationalisation

L’interface prend en charge onze langues. Les fichiers de langue se replient sur l’anglais lorsqu’une clé dédiée n’est pas disponible ; les dictionnaires russe et turc couvrent actuellement toutes les clés de traduction. Les améliorations de couverture et de formulation sont les bienvenues via les Issues et Pull Requests.

## Structure du projet

```text
app/                  Routes Next.js, Manifest, Service Worker et points d’entrée de la PWA statique
components/           Pages, modules produit, mise en page et UI partagée
lib/api/              Adaptateurs locaux de l’API métier
lib/i18n/             Dictionnaires d’interface et libellés de domaine
lib/mock/             Données de démonstration et logique d’agrégation
lib/security/         Chiffrement de l’espace de travail et du partage public
lib/storage/          IndexedDB et prise en charge du stockage persistant
lib/types/            Modèles de domaine
lib/utils/            Utilitaires de budget, devise, phase et publication
public/               Ressources de marque, icônes PWA et paquets Worker générés
scripts/              Scripts de build et d’empaquetage de la PWA portable
```

## Contrôles de qualité

```bash
npm run lint
npx tsc --noEmit --incremental false
```

Le dépôt ne comprend pas encore de tests unitaires ou end-to-end automatisés. Les modifications concernant le chiffrement, la migration, la récupération ou les calculs budgétaires doivent faire l’objet de vérifications supplémentaires avant leur intégration.

## Limites actuelles

- Les API métier reposent encore sur des adaptateurs locaux au navigateur ; aucun backend serveur de production n’est connecté.
- Les nouveaux projets héritent d’une partie de la structure du projet de démonstration au lieu de partir d’un modèle entièrement vide.
- Les processus de modification des coûts réels, des ressources et des journaux d’activité ne sont pas encore entièrement accessibles.
- Les détails des groupes de projets, la révocation du partage et les contrôles d’expiration des liens doivent encore être raccordés.
- Un rechargement complet de la page impose de saisir à nouveau le mot de passe pour déverrouiller l’espace de travail.
- La prise en charge PWA est intégrée, mais les tests automatisés Lighthouse, du parcours d’installation et end-to-end hors ligne ne sont pas encore configurés.
- Les pages dynamiques non mises en cache et les endpoints réseau en direct peuvent rester indisponibles hors ligne ; la page de repli hors ligne et les données locales ne remplacent pas les API distantes.

## Contribution

Les Issues et les Pull Requests sont les bienvenues. Avant de proposer une modification :

1. Décrivez la page, le modèle de données ou le périmètre de migration concernés.
2. Vérifiez les mises en page sur ordinateur et sur écran étroit.
3. Exécutez ESLint et la vérification TypeScript.
4. Documentez la rétrocompatibilité et la récupération des sauvegardes en cas de modification du format des données.

## Licence et droits d’auteur

Ce projet est distribué selon les termes de l’Apache License 2.0. Consultez [LICENSE](./LICENSE) pour plus de détails. Vous pouvez utiliser, copier, modifier et distribuer le projet conformément aux conditions de la licence.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. Tous droits réservés.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
