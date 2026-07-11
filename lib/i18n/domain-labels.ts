import type { Language, TranslationKey } from "@/lib/i18n/translations";
import type { ActivityEvent, CostItem, Material, Person, ProjectGroup, ProjectStatus, ProjectVersion, Tool } from "@/lib/types";

const demoCompanyIds = new Set(["company-northstar", "company-color-works"]);
const demoProjectIds = new Set(Array.from({ length: 12 }, (_, index) => `project-${String(index + 1).padStart(2, "0")}`));

export function formatDemoEntityName(
  value: string,
  id: string,
  kind: "company" | "project",
  t: (key: TranslationKey) => string
) {
  const isDemo = kind === "company" ? demoCompanyIds.has(id) : demoProjectIds.has(id);
  return isDemo ? `${value}${t("exampleNameSuffix")}` : value;
}

export const projectNameKeys: Record<string, TranslationKey> = {
  "AI Web Game Prototype": "projectGameTitle",
  "Three.js Engine Experiment": "projectEngineTitle",
  "Visual Asset Production": "projectVisualAssetTitle",
  "Short Video Pipeline": "projectVideoTitle",
  "Runway Trailer Sprint": "projectRunwayTitle",
  "Motion Identity Pack": "projectMotionIdentityTitle",
  "Brand Landing Page": "projectBrandTitle",
  "Portfolio Relaunch": "projectPortfolioTitle",
  "Interactive Product Site": "projectInteractiveSiteTitle",
  "Marketing Campaign": "projectMarketingTitle",
  "Client Progress Room": "projectClientRoomTitle",
  "Event Concept Board": "projectEventBoardTitle"
};

export const groupNameKeys: Record<string, TranslationKey> = {
  "Game Projects": "projectGameGroup",
  "AI Video Projects": "groupAiVideo",
  "Website Projects": "projectBrandGroup",
  "Client Projects": "groupClientProjects"
};

export function getProjectGroupDisplayName(
  group: Pick<ProjectGroup, "name" | "nameI18n">,
  language: Language,
  t: (key: TranslationKey) => string
) {
  const localizedName = group.nameI18n?.[language]?.trim();

  if (localizedName) {
    return localizedName;
  }

  return translateDomainLabel(group.name, groupNameKeys, t, group.name);
}

export const companyDescriptionKeys: Record<string, TranslationKey> = {
  "company-northstar": "companyNorthstarDescription",
  "company-color-works": "companyColorWorksDescription"
};

export const groupDescriptionKeys: Record<string, TranslationKey> = {
  "Game Projects": "groupGameDescription",
  "AI Video Projects": "groupAiVideoDescription",
  "Website Projects": "groupWebsiteDescription",
  "Client Projects": "groupClientDescription"
};

export const phaseNameKeys: Record<string, TranslationKey> = {
  Planning: "stagePlanning",
  Design: "stageDesign",
  "Asset Production": "phaseAssetProduction",
  Development: "phaseDevelopment",
  Launch: "stageLaunch"
};

export const taskTitleKeys: Record<string, TranslationKey> = {
  "Brief locked": "taskBriefLocked",
  "Asset pass complete": "taskAssetPass",
  "Review notes cleared": "taskReviewNotes"
};

export const deliverableTitleKeys: Record<string, TranslationKey> = {
  "Direction package": "deliverableDirectionPackage",
  "Production batch": "deliverableProductionBatch",
  "Review build": "deliverableReviewBuild"
};

export const materialNameKeys: Record<string, TranslationKey> = {
  "Hero reference wall": "materialHeroReferenceWall",
  "Motion study": "materialMotionStudy",
  "Prototype capture": "materialPrototypeCapture",
  "Share deck": "materialShareDeck"
};

export const versionNameKeys: Record<string, TranslationKey> = {
  "Direction lock": "versionDirectionLock",
  "Interactive review": "versionInteractiveReview",
  "Launch candidate": "versionLaunchCandidate",
  "Demo release": "versionDemoRelease",
  "Official release": "versionOfficialRelease"
};

export const versionSummaryKeys: Record<string, TranslationKey> = {
  "Core visual direction, audience promise, and first playable shape are aligned.": "versionSummaryDirectionLock",
  "Key interactions, motion timing, and public review notes are collected in one pass.": "versionSummaryInteractiveReview",
  "Final content, share room, and delivery checklist are being prepared for release.": "versionSummaryLaunchCandidate",
  "Demo publishing checkpoint.": "versionSummaryDemoRelease",
  "Formal release checkpoint.": "versionSummaryOfficialRelease"
};

export const activityTitleKeys: Record<string, TranslationKey> = {
  "Brief approved": "activityBriefApproved",
  "Assets uploaded": "activityAssetsUploaded",
  "Share room updated": "activityShareRoomUpdated"
};

export const projectDescriptionKey: TranslationKey = "projectDescriptionGeneric";
export const phaseDescriptionKey: TranslationKey = "phaseDescriptionGeneric";
export const deliverableDescriptionKey: TranslationKey = "deliverableDescriptionGeneric";

export const statusKeys: Record<ProjectStatus, TranslationKey> = {
  planning: "statusPlanning",
  active: "statusActive",
  paused: "statusPaused",
  terminated: "statusTerminated",
  completed: "statusCompleted"
};

export const costCategoryKeys: Record<CostItem["category"], TranslationKey> = {
  software: "costCategorySoftware",
  people: "costCategoryPeople",
  outsourcing: "costCategoryOutsourcing",
  asset: "costCategoryAsset",
  server: "costCategoryServer",
  other: "costCategoryOther"
};

export const budgetCostCategoryKeys: Record<string, TranslationKey> = {
  personnel: "budgetCategoryPersonnel",
  travel: "budgetCategoryTravel",
  "daily-expenses": "budgetCategoryDailyExpenses",
  outsourcing: "budgetCategoryOutsourcing",
  extra: "budgetCategoryExtra",
  software: "budgetCategorySoftware",
  contingency: "budgetCategoryContingency",
  tax: "budgetCategoryTax",
  people: "costCategoryPeople",
  asset: "costCategoryAsset",
  server: "costCategoryServer",
  other: "costCategoryOther"
};

export const personTypeKeys: Record<Person["type"], TranslationKey> = {
  internal: "personTypeInternal",
  external: "personTypeExternal",
  vendor: "personTypeVendor",
  "ai-tool": "personTypeAiTool"
};

export const toolCategoryKeys: Record<Tool["category"], TranslationKey> = {
  ai: "toolCategoryAi",
  design: "toolCategoryDesign",
  dev: "toolCategoryDev",
  game: "toolCategoryGame",
  video: "toolCategoryVideo",
  other: "toolCategoryOther"
};

export const billingTypeKeys: Record<CostItem["billingType"], TranslationKey> = {
  "one-time": "billingTypeOneTime",
  monthly: "billingTypeMonthly",
  yearly: "billingTypeYearly",
  hourly: "billingTypeHourly",
  daily: "billingTypeDaily"
};

export const materialTypeKeys: Record<Material["type"], TranslationKey> = {
  image: "materialImage",
  video: "materialVideo",
  doc: "materialDoc",
  prototype: "materialPrototype",
  audio: "materialAudio",
  other: "materialOther"
};

export const materialStatusKeys: Record<Material["status"], TranslationKey> = {
  draft: "assetDraft",
  review: "assetReview",
  approved: "assetApproved"
};

export const versionStatusKeys: Record<ProjectVersion["status"], TranslationKey> = {
  draft: "versionDraft",
  review: "versionReview",
  released: "versionReleased"
};

export const activityToneClasses: Record<ActivityEvent["tone"], string> = {
  info: "bg-aqua text-ink",
  success: "bg-limepop text-ink",
  warning: "bg-coral text-white"
};

export function translateDomainLabel(
  value: string,
  dictionary: Record<string, TranslationKey>,
  t: (key: TranslationKey) => string,
  fallback = value
) {
  const key = dictionary[value];
  return key ? t(key) : fallback;
}
