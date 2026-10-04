// The guide describes the reading method. It is loaded from YAML and checked
// here; the interface renders whatever a valid guide describes.

export type FieldType = 'short' | 'long' | 'checklist' | 'terms';
export const FIELD_TYPES: FieldType[] = ['short', 'long', 'checklist', 'terms'];
export const STATUSES = ['to-read', 'in-progress', 'read', 'set-aside'] as const;
export type Status = (typeof STATUSES)[number];

export interface GuideQuestion {
  id: string;
  heading: string;
  label: string;
  help: string;
  type: FieldType;
  /** Offer a button that hides the PDF while writing this answer. */
  recall: boolean;
  /** Shown in the library preview and revealed during review. */
  summary: boolean;
  /** This answer holds the reader's own questions, shown on every pass. */
  purposeQuestions: boolean;
  /** Show the reader's purpose questions above this field. */
  showPurposeQuestions: boolean;
}

export interface DecisionNote {
  id: string;
  heading: string;
  label: string;
}

export interface DecisionOption {
  id: string;
  label: string;
  help: string;
  status: Status;
  /** Stage to move to after choosing this option. */
  next: string | null;
  scheduleReview: boolean;
  note: DecisionNote | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface PurposeOption {
  id: string;
  label: string;
  suggestedPass: number | null;
}

export interface PurposeStage {
  kind: 'purpose';
  id: string;
  title: string;
  heading: string;
  goal: string;
  targetLabel: string;
  choiceLabel: string;
  options: PurposeOption[];
  questions: GuideQuestion[];
}

export interface PassStage {
  kind: 'pass';
  id: string;
  pass: number;
  title: string;
  heading: string;
  goal: string;
  targetLabel: string;
  targetMinutes: number | null;
  checklist: ChecklistItem[];
  questions: GuideQuestion[];
  decisionPrompt: string;
  decisions: DecisionOption[];
}

export type Stage = PurposeStage | PassStage;

export interface ReviewSettings {
  intervals: number[];
  targetLabel: string;
  prompt: string;
  help: string;
  remembered: string;
  fuzzy: string;
}

export interface Guide {
  name: string;
  notesHeading: string;
  reviewsHeading: string;
  purpose: PurposeStage;
  passes: PassStage[];
  review: ReviewSettings;
}

export class GuideError extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function obj(v: unknown, where: string): Obj {
  if (!isObj(v)) throw new GuideError(`${where} should be a mapping of keys to values.`);
  return v;
}

function list(v: unknown, where: string, optional = false): unknown[] {
  if (v === undefined || v === null) {
    if (optional) return [];
    throw new GuideError(`${where} is missing.`);
  }
  if (!Array.isArray(v)) throw new GuideError(`${where} should be a list.`);
  return v;
}

function str(v: unknown, where: string, fallback?: string): string {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new GuideError(`${where} is missing.`);
  }
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') throw new GuideError(`${where} should be text.`);
  const s = v.trim();
  if (!s && fallback === undefined) throw new GuideError(`${where} is empty.`);
  return s;
}

function bool(v: unknown, where: string): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw new GuideError(`${where} should be true or false.`);
  return v;
}

function num(v: unknown, where: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new GuideError(`${where} should be a positive number.`);
  }
  return v;
}

function headingText(v: unknown, where: string): string {
  const s = str(v, where);
  if (s.includes('\n')) throw new GuideError(`${where} must be a single line.`);
  return s;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function id(v: unknown, where: string): string {
  const s = str(v, where);
  if (!ID_RE.test(s)) {
    throw new GuideError(`${where} "${s}" should use only letters, digits, "-" and "_".`);
  }
  return s;
}

export function normalizeHeading(h: string): string {
  return h.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[], what: string, where: string, normalize = (s: string) => s): void {
  const seen = new Set<string>();
  for (const v of values) {
    const k = normalize(v);
    if (seen.has(k)) throw new GuideError(`${where}: ${what} "${v}" is used more than once.`);
    seen.add(k);
  }
}

function parseQuestion(raw: unknown, where: string): GuideQuestion {
  const q = obj(raw, where);
  const type = str(q.type, `${where}.type`, 'long') as FieldType;
  if (!FIELD_TYPES.includes(type)) {
    throw new GuideError(`${where}.type should be one of ${FIELD_TYPES.join(', ')}.`);
  }
  const heading = headingText(q.heading, `${where}.heading`);
  return {
    id: id(q.id, `${where}.id`),
    heading,
    label: str(q.label, `${where}.label`, heading) || heading,
    help: str(q.help, `${where}.help`, ''),
    type,
    recall: bool(q.recall, `${where}.recall`),
    summary: bool(q.summary, `${where}.summary`),
    purposeQuestions: bool(q.purpose_questions, `${where}.purpose_questions`),
    showPurposeQuestions: bool(q.show_purpose_questions, `${where}.show_purpose_questions`),
  };
}

function parseStatus(v: unknown, where: string): Status {
  const s = str(v, where, 'in-progress') || 'in-progress';
  if (!(STATUSES as readonly string[]).includes(s)) {
    throw new GuideError(`${where} should be one of ${STATUSES.join(', ')}.`);
  }
  return s as Status;
}

function parsePass(raw: unknown, index: number): PassStage {
  const where = `passes[${index + 1}]`;
  const p = obj(raw, where);
  const pass = num(p.pass, `${where}.pass`) ?? index + 1;
  const target = p.target === undefined ? {} : obj(p.target, `${where}.target`);
  const checklist = list(p.checklist, `${where}.checklist`, true).map((c, i) => {
    const w = `${where}.checklist[${i + 1}]`;
    if (typeof c === 'string') return { id: `step-${i + 1}`, text: str(c, w) };
    const o = obj(c, w);
    return { id: id(o.id, `${w}.id`), text: str(o.text, `${w}.text`) };
  });
  const questions = list(p.questions, `${where}.questions`, true).map((q, i) =>
    parseQuestion(q, `${where}.questions[${i + 1}]`),
  );
  const decision = p.decision === undefined ? {} : obj(p.decision, `${where}.decision`);
  const decisions = list(decision.options, `${where}.decision.options`, true).map((d, i) => {
    const w = `${where}.decision.options[${i + 1}]`;
    const o = obj(d, w);
    let note: DecisionNote | null = null;
    if (o.note !== undefined && o.note !== null) {
      const n = obj(o.note, `${w}.note`);
      const heading = headingText(n.heading, `${w}.note.heading`);
      note = { id: id(n.id, `${w}.note.id`), heading, label: str(n.label, `${w}.note.label`, heading) || heading };
    }
    return {
      id: id(o.id, `${w}.id`),
      label: str(o.label, `${w}.label`),
      help: str(o.help, `${w}.help`, ''),
      status: parseStatus(o.status, `${w}.status`),
      next: o.next === undefined || o.next === null ? null : id(o.next, `${w}.next`),
      scheduleReview: bool(o.schedule_review, `${w}.schedule_review`),
      note,
    };
  });
  unique(checklist.map((c) => c.id), 'checklist id', where);
  unique(decisions.map((d) => d.id), 'decision id', where);
  const fieldIds = [...questions.map((q) => q.id), ...decisions.flatMap((d) => (d.note ? [d.note.id] : []))];
  const fieldHeadings = [
    ...questions.map((q) => q.heading),
    ...decisions.flatMap((d) => (d.note ? [d.note.heading] : [])),
  ];
  unique(fieldIds, 'question id', where);
  unique(fieldHeadings, 'heading', where, normalizeHeading);
  return {
    kind: 'pass',
    id: id(p.id, `${where}.id`),
    pass,
    title: str(p.title, `${where}.title`),
    heading: headingText(p.heading, `${where}.heading`),
    goal: str(p.goal, `${where}.goal`, ''),
    targetLabel: str(target.label, `${where}.target.label`, ''),
    targetMinutes: num(target.minutes, `${where}.target.minutes`),
    checklist,
    questions,
    decisionPrompt: str(decision.prompt, `${where}.decision.prompt`, 'What next?') || 'What next?',
    decisions,
  };
}

export function parseGuide(raw: unknown): Guide {
  const g = obj(raw, 'The guide');
  const pr = obj(g.purpose, 'purpose');
  const choice = pr.choice === undefined ? {} : obj(pr.choice, 'purpose.choice');
  const purposeQuestions = list(pr.questions, 'purpose.questions', true).map((q, i) =>
    parseQuestion(q, `purpose.questions[${i + 1}]`),
  );
  const purpose: PurposeStage = {
    kind: 'purpose',
    id: id(pr.id ?? 'purpose', 'purpose.id'),
    title: str(pr.title, 'purpose.title', 'Purpose') || 'Purpose',
    heading: headingText(pr.heading ?? 'Purpose', 'purpose.heading'),
    goal: str(pr.goal, 'purpose.goal', ''),
    targetLabel: str(pr.target, 'purpose.target', ''),
    choiceLabel: str(choice.label, 'purpose.choice.label', 'Why am I reading this?') || 'Why am I reading this?',
    options: list(choice.options, 'purpose.choice.options', true).map((o, i) => {
      const w = `purpose.choice.options[${i + 1}]`;
      const oo = obj(o, w);
      return {
        id: id(oo.id, `${w}.id`),
        label: str(oo.label, `${w}.label`),
        suggestedPass: num(oo.suggested_pass, `${w}.suggested_pass`),
      };
    }),
    questions: purposeQuestions,
  };
  unique(purpose.options.map((o) => o.id), 'purpose option id', 'purpose');
  unique(purposeQuestions.map((q) => q.id), 'question id', 'purpose');
  unique(purposeQuestions.map((q) => q.heading), 'heading', 'purpose', normalizeHeading);

  const passes = list(g.passes, 'passes').map((p, i) => parsePass(p, i));
  if (passes.length === 0) throw new GuideError('passes should list at least one pass.');

  const stageIds = [purpose.id, ...passes.map((p) => p.id)];
  unique(stageIds, 'stage id', 'The guide');
  const notesHeading = headingText(g.notes_heading ?? 'Notes', 'notes_heading');
  const reviewsHeading = headingText(g.reviews_heading ?? 'Reviews', 'reviews_heading');
  unique(
    [purpose.heading, ...passes.map((p) => p.heading), notesHeading, reviewsHeading],
    'stage heading',
    'The guide',
    normalizeHeading,
  );
  for (const p of passes) {
    for (const d of p.decisions) {
      if (d.next && !stageIds.includes(d.next)) {
        throw new GuideError(`${p.id}: decision "${d.id}" moves to "${d.next}", which is not a stage id.`);
      }
    }
  }

  const rv = g.review === undefined ? {} : obj(g.review, 'review');
  const outcomes = rv.outcomes === undefined ? {} : obj(rv.outcomes, 'review.outcomes');
  const intervals = list(rv.intervals ?? [7, 30, 90], 'review.intervals').map((n, i) => {
    const v = num(n, `review.intervals[${i + 1}]`);
    if (v === null || v < 1 || !Number.isInteger(v)) {
      throw new GuideError(`review.intervals[${i + 1}] should be a whole number of days.`);
    }
    return v;
  });
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i] <= intervals[i - 1]) throw new GuideError('review.intervals should increase.');
  }

  return {
    name: str(g.name, 'name', 'Guide') || 'Guide',
    notesHeading,
    reviewsHeading,
    purpose,
    passes,
    review: {
      intervals,
      targetLabel: str(rv.target, 'review.target', ''),
      prompt: str(rv.prompt, 'review.prompt', 'What do you remember?') || 'What do you remember?',
      help: str(rv.help, 'review.help', ''),
      remembered: str(outcomes.remembered, 'review.outcomes.remembered', 'Remembered') || 'Remembered',
      fuzzy: str(outcomes.fuzzy, 'review.outcomes.fuzzy', 'Fuzzy') || 'Fuzzy',
    },
  };
}

export function allStages(guide: Guide): Stage[] {
  return [guide.purpose, ...guide.passes];
}

/** Every answer field of a stage, including decision notes, in guide order. */
export function stageFields(stage: Stage): { id: string; heading: string }[] {
  const fields = stage.questions.map((q) => ({ id: q.id, heading: q.heading }));
  if (stage.kind === 'pass') {
    for (const d of stage.decisions) if (d.note) fields.push({ id: d.note.id, heading: d.note.heading });
  }
  return fields;
}

export function purposeQuestionsField(guide: Guide): GuideQuestion | undefined {
  return guide.purpose.questions.find((q) => q.purposeQuestions);
}

export function summaryFields(guide: Guide): { stage: PassStage | PurposeStage; question: GuideQuestion }[] {
  return allStages(guide).flatMap((stage) =>
    stage.questions.filter((q) => q.summary).map((question) => ({ stage, question })),
  );
}
