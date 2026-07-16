import type { TranslationKey } from "../translations";

/**
 * An intentionally playful pseudo-Sumerian locale.
 *
 * The signs are grouped by broad interface concepts instead of claiming to be
 * an academic translation. Safety-sensitive actions retain the English source
 * after the decorative cuneiform so the joke can never hide a destructive or
 * recovery-related instruction.
 */

const signLexicon: Record<string, string> = {
  account: "𒇽𒂍",
  action: "𒄑",
  active: "𒌓",
  activity: "𒄑𒌓",
  add: "𒆕",
  amount: "𒆬",
  apple: "𒀭",
  archive: "𒁾𒆠",
  asset: "𒆠",
  attachment: "𒁾",
  auth: "𒅆𒂍",
  backup: "𒁾𒁾",
  billing: "𒆬𒌓",
  brand: "𒀭𒆠",
  budget: "𒆬𒁹",
  button: "𒁹",
  cancel: "𒉡",
  category: "𒁹𒁹",
  change: "𒋛",
  client: "𒇽",
  close: "𒉡𒂍",
  cloud: "𒀭𒆠",
  cloudkit: "𒀭𒁾",
  color: "𒌓𒆠",
  company: "𒂍𒇽",
  complete: "𒅗",
  confirm: "𒄿",
  conflict: "𒍣𒍣",
  continue: "𒋫",
  copy: "𒁾𒁾",
  cost: "𒆬",
  create: "𒆕",
  currency: "𒆬",
  current: "𒁹",
  dashboard: "𒂍𒁹",
  date: "𒌓",
  day: "𒌓",
  delete: "𒉡𒁾",
  deliverable: "𒁾𒋫",
  description: "𒅴𒁾",
  device: "𒆠𒁹",
  dismiss: "𒉡",
  download: "𒁾𒋫",
  due: "𒌓𒁹",
  edit: "𒋛",
  email: "𒅴𒋫",
  empty: "𒉡𒆠",
  error: "𒍣",
  estimate: "𒁹𒆬",
  export: "𒁾𒋫",
  failed: "𒍣",
  file: "𒁾",
  filter: "𒁹𒅆",
  group: "𒇽𒇽",
  help: "𒅴𒇽",
  import: "𒋫𒁾",
  invite: "𒅴𒇽",
  key: "𒅆𒆠",
  language: "𒅴",
  library: "𒂍𒁾",
  link: "𒋫",
  local: "𒆠",
  lock: "𒅆",
  login: "𒇽𒂍",
  logout: "𒇽𒋫",
  material: "𒆠",
  member: "𒇽",
  month: "𒌓𒌓",
  name: "𒈬",
  nav: "𒋫",
  new: "𒆕",
  next: "𒋫",
  node: "𒀀",
  note: "𒁾𒅴",
  notification: "𒅴𒌓",
  open: "𒂍𒋫",
  owner: "𒇽𒁹",
  password: "𒅆𒅆",
  payment: "𒆬𒋫",
  people: "𒇽𒇽",
  person: "𒇽",
  phase: "𒌓𒁹",
  plan: "𒁾𒁹",
  private: "𒅆𒂍",
  progress: "𒋫𒌓",
  project: "𒂍𒆠",
  public: "𒅆𒌓",
  rate: "𒆬𒁹",
  received: "𒆬𒂍",
  recovery: "𒅆𒁾",
  release: "𒌓𒋫",
  reminder: "𒅴𒌓",
  remove: "𒉡𒁾",
  report: "𒁾𒅴",
  reset: "𒆕𒆠",
  restore: "𒋫𒁾",
  role: "𒇽𒁹",
  save: "𒁾𒆠",
  search: "𒅆",
  security: "𒅆𒅆",
  settings: "𒋛𒁹",
  share: "𒋫𒇽",
  software: "𒌨𒁾",
  stage: "𒌓𒁹",
  status: "𒁹",
  storage: "𒁾𒂍",
  studio: "𒂍𒇽",
  subscription: "𒆬𒌓",
  success: "𒅗",
  summary: "𒁾𒁹",
  sync: "𒋫𒋫",
  task: "𒄑𒁹",
  team: "𒇽𒇽",
  template: "𒁾𒆕",
  time: "𒌓",
  timeline: "𒌓𒌓",
  title: "𒈬",
  tool: "𒌨",
  update: "𒋛",
  upload: "𒋫𒁾",
  user: "𒇽",
  version: "𒌓𒁾",
  warning: "𒍣",
  workflow: "𒄑𒋫",
  workspace: "𒂍𒆠",
  year: "𒌓𒌓𒌓"
};

const exactTranslations: Partial<Record<TranslationKey, string>> = {
  languageName: "𒅴𒂠",
  languageSwitch: "𒅴 𒋛",
  navDashboard: "𒂍 𒁹",
  navCompanies: "𒂍 𒇽",
  navProjects: "𒂍 𒆠",
  navCosts: "𒆬",
  navLibraries: "𒂍 𒁾",
  navWorkflow: "𒄑 𒋫",
  navArchive: "𒁾 𒆠",
  exampleNameSuffix: " · 𒁹",
  loginButton: "𒂍 𒋫",
  close: "𒉡 𒂍",
  cancel: "𒉡 · Cancel"
};

const safetySensitiveKeyPattern =
  /(acknowledgement|apple|auth|backup|blocked|clear|cloud|confirm|conflict|corrupt|danger|delete|development|device|download|email|error|export|failed|file|import|invalid|irreversible|key|lock|logout|mismatch|overwrite|password|permission|privacy|private|protect|public|recovery|remove|replace|reset|restore|security|signout|storage|sync|unavailable|upload|warning)/i;

const protectedTokenPattern =
  /\{[^{}]+\}|(?:[$€£¥₩₹]\s*)?\d[\d.,:/-]*(?:\s?(?:%|KB|MB|GB|TB|days?|weeks?|months?|years?|hours?))?|Studio Map OS|Apple ID|Apple|iCloud|CloudKit|IndexedDB|Web Crypto|GitHub Pages|PWA|HTML|PDF|JSON|CSV|URL|API|WebGL|Demo|\/[A-Za-z0-9_.~/-]+|\.[A-Za-z0-9]{1,8}\b/g;

const fallbackSigns = ["𒀀", "𒁾", "𒂍", "𒆠", "𒇽", "𒌓", "𒌋", "𒍣"];

const splitWords = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];

const createFallbackPhrase = (key: string) => {
  const hash = [...key].reduce((total, character) => total + character.codePointAt(0)!, 0);
  const first = fallbackSigns[hash % fallbackSigns.length];
  const second = fallbackSigns[(hash * 7 + key.length) % fallbackSigns.length];

  return first === second ? first : `${first} ${second}`;
};

const createSignPhrase = (key: TranslationKey, english: string) => {
  const words = [...splitWords(key), ...splitWords(english)];
  const signs = words.flatMap((word) => signLexicon[word]?.split(" ") ?? []);
  const uniqueSigns = [...new Set(signs)].slice(0, 6);

  return uniqueSigns.length > 0 ? uniqueSigns.join(" ") : createFallbackPhrase(key);
};

const extractProtectedTokens = (english: string) =>
  [...new Set(english.match(protectedTokenPattern) ?? [])];

const createTranslation = (key: TranslationKey, english: string) => {
  const exact = exactTranslations[key];

  if (exact) {
    return exact;
  }

  const signPhrase = createSignPhrase(key, english);

  if (safetySensitiveKeyPattern.test(key)) {
    return `${signPhrase} — ${english}`;
  }

  const protectedTokens = extractProtectedTokens(english);

  return protectedTokens.length > 0
    ? `${signPhrase} · ${protectedTokens.join(" · ")}`
    : signPhrase;
};

export const createSumerianJokeTranslations = (
  englishTranslations: Record<TranslationKey, string>
) =>
  Object.fromEntries(
    Object.entries(englishTranslations).map(([key, english]) => [
      key,
      createTranslation(key as TranslationKey, english)
    ])
  ) as Record<TranslationKey, string>;
