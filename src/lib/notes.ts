// ── Notes: the owner's column pages ──
// His reflections on the work and the road behind it, written in Sanity (the
// `note` type in ryan/schemaTypes/note.ts) and printed at build time as the
// NOTES section: /notes (the list) and /notes/<slug> (a column page in the
// weekly-feature language of the Story). Everything here is pure — the GROQ,
// the shapes, the image URLs, the Portable Text renderer and the small
// readers the pages share — so scripts/notes.test.mjs runs it offline.
// The fetch (and the preview-only sample) are in notesData.ts.
import { stockPaper } from './ticketStock.ts';

// ─── Shapes ───────────────────────────────────────────────────────────────

export interface NoteImageAsset {
  url: string;
  width?: number;
  height?: number;
}

/** A Sanity image field, with its asset dereferenced (url + dimensions) and
 *  the editor's crop / hotspot as the studio stores them (fractions). */
export interface NoteImage {
  asset?: NoteImageAsset | null;
  alt?: string | null;
  caption?: string | null;
  /** Their Chinese (中 / EN): printed beside the English, the page's
   *  language showing one (src/i18n/runtime.ts). */
  altZh?: string | null;
  captionZh?: string | null;
  crop?: { top: number; bottom: number; left: number; right: number } | null;
  hotspot?: { x: number; y: number; width?: number; height?: number } | null;
}

export interface NoteSpan {
  _type: 'span';
  _key?: string;
  text: string;
  marks?: string[];
}

export interface NoteMarkDef {
  _key: string;
  _type: string;
  href?: string;
}

export interface NoteTextBlock {
  _type: 'block';
  _key: string;
  style?: string;
  listItem?: string;
  children?: Array<NoteSpan | { _type: string; _key?: string }>;
  markDefs?: NoteMarkDef[];
}

export interface NoteImageBlock extends NoteImage {
  _type: 'image';
  _key: string;
}

export interface NotePullQuote {
  _type: 'pullQuote';
  _key: string;
  text?: string | null;
  textZh?: string | null;
  attribution?: string | null;
}

export type NoteBodyBlock = NoteTextBlock | NoteImageBlock | NotePullQuote | { _type: string; _key: string };

/** A chapter the note is about, in the shape the tags and cards print. */
export interface NotePlace {
  slug: string;
  name: string;
  /** The chapter's name and region in Chinese (notesData.ts resolves them:
   *  Sanity's …Zh, else our drafts, src/i18n/content.ts). */
  nameZh?: string | null;
  region?: string | null;
  regionZh?: string | null;
  year?: number | string | null;
  coverImageUrl?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
}

export interface Note {
  _id: string;
  title: string;
  slug: string;
  publishedAt: string;
  dek?: string | null;
  cover?: NoteImage | null;
  places: NotePlace[];
  body: NoteBodyBlock[];
  /** The note in Chinese (中 / EN), when he has written it: a twin is kept
   *  only beside words that are not Chinese already (twinOf). bodyZh is the
   *  whole text in Chinese, its pictures' and pull quotes' Chinese folded
   *  in (zhBody); null when there is none, and the body prints in both. */
  titleZh?: string | null;
  dekZh?: string | null;
  bodyZh?: NoteBodyBlock[] | null;
  featured: boolean;
  /** The preview-only sample (NOTES_SAMPLE=1 and nothing published). */
  sample?: boolean;
}

// ─── The query ────────────────────────────────────────────────────────────

const IMAGE_ASSET = `asset->{ url, "width": metadata.dimensions.width, "height": metadata.dimensions.height }`;
// A body's members: the text blocks and pull quotes as stored (textZh
// included), the pictures with their asset dereferenced.
const BODY_MEMBERS = `...,
      _type == "image" => { _key, _type, alt, altZh, caption, captionZh, crop, hotspot, ${IMAGE_ASSET} }`;

/** Every published note, newest first. The CDN client only ever sees
 *  published documents; the drafts path is excluded anyway, so a token added
 *  to the client later cannot leak a draft onto the site. */
export const NOTES_QUERY = `
  *[_type == "note" && defined(slug.current) && !(_id in path("drafts.**"))]
    | order(coalesce(publishedAt, _createdAt) desc) {
    _id,
    title,
    titleZh,
    "slug": slug.current,
    "publishedAt": coalesce(publishedAt, _createdAt),
    dek,
    dekZh,
    featured,
    cover { alt, altZh, crop, hotspot, ${IMAGE_ASSET} },
    "places": places[]->{
      "slug": slug.current,
      name,
      nameZh,
      region,
      regionZh,
      year,
      "coverImageUrl": coverImage.asset->url,
      "coverWidth": coverImage.asset->metadata.dimensions.width,
      "coverHeight": coverImage.asset->metadata.dimensions.height
    },
    body[] {
      ${BODY_MEMBERS}
    },
    bodyZh[] {
      ${BODY_MEMBERS}
    }
  }
`;

type RawNote = Partial<Omit<Note, 'places' | 'body' | 'bodyZh'>> & {
  places?: Array<Partial<NotePlace> | null> | null;
  body?: NoteBodyBlock[] | null;
  bodyZh?: Array<NoteBodyBlock | null> | null;
};

/** Drops what a page cannot print (no title or slug, a place whose chapter
 *  was deleted or unpublished) and fills the optional arrays. The order the
 *  query returns — newest first — is kept. */
export function normalizeNotes(raw: ReadonlyArray<RawNote | null> | null | undefined): Note[] {
  const seen = new Set<string>();
  const notes: Note[] = [];
  for (const item of raw ?? []) {
    const title = item?.title?.trim();
    const slug = item?.slug?.trim();
    if (!item || !title || !slug || seen.has(slug)) continue;
    seen.add(slug);
    const dek = item.dek?.trim() || null;
    const body = item.body ?? [];
    notes.push({
      _id: item._id ?? slug,
      title,
      slug,
      publishedAt: item.publishedAt ?? new Date(0).toISOString(),
      dek,
      cover: item.cover?.asset?.url ? item.cover : null,
      places: (item.places ?? []).filter(
        (place): place is NotePlace => Boolean(place?.slug && place?.name),
      ),
      body,
      featured: item.featured === true,
      sample: item.sample === true,
      titleZh: twinOf(title, item.titleZh) ?? null,
      dekZh: (dek && twinOf(dek, item.dekZh)) || null,
      // A body he wrote in Chinese is its own Chinese.
      bodyZh: langOf(noteText({ title: '', dek: null, body })) === 'zh-Hans' ? null : zhBody(item.bodyZh),
    });
  }
  return notes;
}

// ─── Reading order ────────────────────────────────────────────────────────

/** The column's own numbering: No. 01 is the first note he wrote, whatever
 *  order a page lists them in. */
export function noteNumbers(notes: readonly Note[]): Map<string, number> {
  const oldestFirst = [...notes].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.slug.localeCompare(b.slug),
  );
  return new Map(oldestFirst.map((note, index) => [note.slug, index + 1]));
}

/** The note written before this one and the one written after it. `notes`
 *  is newest first (the query's order). */
export function noteNeighbours(notes: readonly Note[], slug: string): { previous: Note | null; next: Note | null } {
  const index = notes.findIndex((note) => note.slug === slug);
  if (index < 0) return { previous: null, next: null };
  return { previous: notes[index + 1] ?? null, next: notes[index - 1] ?? null };
}

/** The note /about quotes: the newest one ticked "featured", else the newest. */
export function featuredNote(notes: readonly Note[]): Note | null {
  return notes.find((note) => note.featured) ?? notes[0] ?? null;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── Dates (in New York, where the archive is based) ─────────────────────

const TZ = 'America/New_York';

/** A page prints a date in both languages (中 / EN) and shows the reader's. */
export type NoteLang = 'en' | 'zh';

/** "September 27, 2026" · "2026年9月27日" */
export function formatNoteDate(iso: string, lang: NoteLang = 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
}

/** "Sep 27, 2026" — for the uppercase labels. Chinese has no short month:
 *  "2026年9月27日" there too. */
export function formatNoteDateShort(iso: string, lang: NoteLang = 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (lang === 'zh') return formatNoteDate(iso, 'zh');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: TZ });
}

/** "2026-09-27" — the machine-readable date for <time datetime>. */
export function isoDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE', { timeZone: TZ });
}

// ─── Language: he may write in Chinese, English, or both ─────────────────
// Fraunces and Space Grotesk have no CJK glyphs; the stacks in global.css
// fall back to a Chinese serif / sans per glyph. A block that is mostly
// Chinese is also marked lang="zh-Hans", so the CSS can give it CJK leading,
// upright "italics" and no negative tracking, and the browser breaks its
// lines by Chinese rules.

const HAN = /\p{Script=Han}/gu;
const LATIN_LETTER = /\p{Script=Latin}/gu;

export function hasHan(text: string | null | undefined): boolean {
  return Boolean(text) && /\p{Script=Han}/u.test(text as string);
}

/** 'zh-Hans' when Han characters carry the text (a Han character does the
 *  work of about three Latin letters), else undefined (the page's English). */
export function langOf(text: string | null | undefined): 'zh-Hans' | undefined {
  if (!text) return undefined;
  const han = text.match(HAN)?.length ?? 0;
  if (han === 0) return undefined;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  return han * 3 >= latin ? 'zh-Hans' : undefined;
}

// ─── 中 / EN: his words beside their Chinese ─────────────────────────────
// A page carries both languages and html[lang] follows the reader's toggle
// (src/i18n/runtime.ts), so an element with no lang of its own is read as
// Chinese in Chinese mode, and notes.css sets every :lang(zh) block as
// Chinese. So words with a Chinese twin follow the page (their block
// carries no lang: the twin the page shows is its language), and words
// without one keep their own — an English note read with the page in
// Chinese stays set as English.

/** A field's Chinese twin: kept when it has words, differs from the field
 *  and the field is not Chinese already (a note he wrote in Chinese prints
 *  its own words in both languages). */
export function twinOf(text: string | null | undefined, zh: string | null | undefined): string | undefined {
  const twin = typeof zh === 'string' ? zh.trim() : '';
  if (!twin || !text?.trim() || twin === text.trim() || langOf(text) === 'zh-Hans') return undefined;
  return twin;
}

/** The lang a block of his words carries: none when it has a Chinese twin
 *  (it follows the page), else its own text's. */
export function blockLang(text: string | null | undefined, twin?: string | null): 'zh-Hans' | 'en' | undefined {
  if (twin) return undefined;
  return langOf(text) ?? 'en';
}

/** The Chinese serif as a webfont (Noto Serif SC: Google Fonts' own rules
 *  and files, served from our own site — public/fonts/noto-serif-sc-v36/,
 *  owner 2026-10-09 — cut into unicode-range slices, so a page downloads
 *  only the slices its characters are in, and never from Google). The
 *  system Song faces are not everywhere — iOS has no Songti SC for the web and
 *  would set Chinese in PingFang, a sans, beside Fraunces — so a page with
 *  Chinese on it links this and puts it first after the Latin faces
 *  (notes.css, global.css "/about"). A page with none links nothing. */
export const CJK_SERIF_CSS = '/fonts/noto-serif-sc-v36/noto-serif-sc.css';

// ─── Text ─────────────────────────────────────────────────────────────────

function isSpan(child: unknown): child is NoteSpan {
  return Boolean(child) && (child as NoteSpan)._type === 'span' && typeof (child as NoteSpan).text === 'string';
}

export function isTextBlock(block: NoteBodyBlock): block is NoteTextBlock {
  return block._type === 'block';
}

export function isImageBlock(block: NoteBodyBlock): block is NoteImageBlock {
  return block._type === 'image' && Boolean((block as NoteImageBlock).asset?.url);
}

export function isPullQuote(block: NoteBodyBlock): block is NotePullQuote {
  return block._type === 'pullQuote' && Boolean((block as NotePullQuote).text?.trim());
}

/** A text block's plain text. */
export function blockText(block: NoteTextBlock): string {
  return (block.children ?? []).filter(isSpan).map((span) => span.text).join('');
}

/** Every word he wrote in the note: title, dek, body, quotes and captions. */
export function noteText(note: Pick<Note, 'title' | 'dek' | 'body'>): string {
  const parts = [note.title, note.dek ?? ''];
  for (const block of note.body) {
    if (isTextBlock(block)) parts.push(blockText(block));
    else if (isPullQuote(block)) parts.push(block.text ?? '');
    else if (isImageBlock(block)) parts.push(block.caption ?? '');
  }
  return parts.join('\n');
}

/** Whether any of the note's words are Chinese (the page then links the
 *  Chinese serif, CJK_SERIF_CSS). */
export function noteHasHan(note: NoteWords): boolean {
  return (
    hasHan(noteText(note)) ||
    hasHan(noteText(noteInChinese(note))) ||
    note.body.some((block) => (isImageBlock(block) && hasHan(block.captionZh)) || (isPullQuote(block) && hasHan(block.textZh)))
  );
}

/** A note's words, with their Chinese twins when it has them. */
export type NoteWords = Pick<Note, 'title' | 'dek' | 'body'> & Partial<Pick<Note, 'titleZh' | 'dekZh' | 'bodyZh'>>;

/** The note as a reader with the page in Chinese reads it: each field's
 *  twin where there is one, else his own words. */
export function noteInChinese(note: NoteWords): Pick<Note, 'title' | 'dek' | 'body'> {
  return {
    title: note.titleZh || note.title,
    dek: (note.dek && note.dekZh) || note.dek || null,
    body: note.bodyZh?.length ? note.bodyZh : note.body,
  };
}

/** A Chinese body as the page prints it: null unless it has words; the
 *  Chinese of its pictures and pull quotes (altZh, captionZh, textZh — a
 *  member copied over from the English body) folded into the fields the
 *  page prints. */
export function zhBody(raw: ReadonlyArray<NoteBodyBlock | null> | null | undefined): NoteBodyBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const blocks = raw.filter((block): block is NoteBodyBlock => Boolean(block && typeof block === 'object'));
  if (!blocks.some((block) => isTextBlock(block) && blockText(block).trim())) return null;
  return blocks.map((block) => {
    if (block._type === 'image') {
      const image = block as NoteImageBlock;
      return { ...image, alt: image.altZh?.trim() || image.alt, caption: image.captionZh?.trim() || image.caption, altZh: null, captionZh: null };
    }
    if (block._type === 'pullQuote') {
      const quote = block as NotePullQuote;
      return { ...quote, text: quote.textZh?.trim() || quote.text, textZh: null };
    }
    return block;
  });
}

/** Minutes to read: ~230 English words or ~400 Chinese characters a minute. */
export function readingMinutes(note: Pick<Note, 'title' | 'dek' | 'body'>): number {
  const text = noteText(note);
  const han = text.match(HAN)?.length ?? 0;
  const words = text.replace(HAN, ' ').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / 230 + han / 400));
}

/** The description for <meta>: the dek, else the opening of the body. */
export function noteDescription(note: Pick<Note, 'title' | 'dek' | 'body'>, max = 180): string {
  if (note.dek) return note.dek;
  const first = note.body.find((block) => isTextBlock(block) && (block.style ?? 'normal') === 'normal');
  const text = first && isTextBlock(first) ? blockText(first).replace(/\s+/g, ' ').trim() : '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
}

/** A pull quote as printed: its own words inside curly quotes, the final
 *  full stop dropped (the Story's rule), in either language. */
export function pullQuoteText(text: string): string {
  const trimmed = text.trim().replace(/^["“”「『]+|["“”」』]+$/g, '').trim();
  return trimmed.replace(/[.。]$/, '');
}

// ─── Inline HTML (the one place the renderer writes markup) ──────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only web, mail and site-relative links; anything else (javascript:, data:)
 *  prints as plain text. */
export function safeHref(href: string | null | undefined): string | null {
  const value = href?.trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  return null;
}

function isExternal(href: string): boolean {
  if (!/^https?:/i.test(href)) return false;
  try {
    return new URL(href).hostname.replace(/^www\./, '') !== 'ryanxugallery.com';
  } catch {
    return true;
  }
}

const DECORATORS: Record<string, string> = { strong: 'strong', em: 'em' };

/** One span's HTML: escaped, soft line breaks kept, its decorators applied.
 *  Chinese has no italic (and the page never fakes one), so the Han runs of
 *  an emphasised span are marked for the Chinese emphasis instead — the dots
 *  under the characters (着重号, .note-dot in notes.css) — while its Latin
 *  keeps Fraunces' real italic. One <em> either way. */
function renderSpan(span: NoteSpan): string {
  const marks = span.marks ?? [];
  let text = escapeHtml(span.text).replace(/\n/g, '<br>');
  if (marks.includes('em') && hasHan(span.text)) {
    text = text.replace(/\p{Script=Han}+/gu, (run) => `<span class="note-dot">${run}</span>`);
  }
  for (const mark of marks) {
    const tag = DECORATORS[mark];
    if (tag) text = `<${tag}>${text}</${tag}>`;
  }
  return text;
}

/** A text block's inline HTML: spans escaped, soft line breaks kept, the
 *  strong / em decorators, and links (adjacent spans under one link share one
 *  <a>). Unknown marks and inline objects are dropped, never printed raw. */
export function renderInline(block: NoteTextBlock): string {
  const defs = new Map((block.markDefs ?? []).map((def) => [def._key, def]));
  const spans = (block.children ?? []).filter(isSpan);
  let html = '';
  let index = 0;
  while (index < spans.length) {
    const linkKey = (spans[index].marks ?? []).find((mark) => defs.get(mark)?._type === 'link');
    let end = index + 1;
    if (linkKey) {
      while (end < spans.length && (spans[end].marks ?? []).includes(linkKey)) end += 1;
    }
    const inner = spans.slice(index, end).map(renderSpan).join('');
    const href = linkKey ? safeHref(defs.get(linkKey)?.href) : null;
    if (href) {
      const external = isExternal(href);
      html += `<a class="note-link" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
    } else {
      html += inner;
    }
    index = end;
  }
  return html;
}

// ─── Images (Sanity's image API, no client library) ──────────────────────

/** The part of the file the editor kept (the studio's crop), in pixels. */
export function imageRect(image: NoteImage): { x: number; y: number; w: number; h: number } | null {
  const width = image.asset?.width;
  const height = image.asset?.height;
  if (!width || !height) return null;
  const crop = image.crop ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const x = Math.round(Math.max(0, crop.left) * width);
  const y = Math.round(Math.max(0, crop.top) * height);
  const w = Math.round(Math.max(0, 1 - crop.left - crop.right) * width);
  const h = Math.round(Math.max(0, 1 - crop.top - crop.bottom) * height);
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Width and height of the picture as printed: the kept part of the file,
 *  at its own ratio (a note never crops a photograph to fit a box). */
export function imageSize(image: NoteImage): { width: number; height: number } | null {
  const rect = imageRect(image);
  return rect ? { width: rect.w, height: rect.h } : null;
}

function cropped(image: NoteImage): boolean {
  const rect = imageRect(image);
  return Boolean(rect && (rect.x || rect.y || rect.w !== image.asset?.width || rect.h !== image.asset?.height));
}

/** The image at a width, cropped as the editor cropped it. */
export function imageUrl(image: NoteImage, width: number, quality = 82): string {
  const url = image.asset?.url;
  if (!url) return '';
  const params = new URLSearchParams();
  const rect = imageRect(image);
  if (rect && cropped(image)) params.set('rect', `${rect.x},${rect.y},${rect.w},${rect.h}`);
  params.set('w', String(Math.round(width)));
  params.set('q', String(quality));
  params.set('auto', 'format');
  return `${url}?${params.toString().replace(/%2C/g, ',')}`;
}

export const IMAGE_WIDTHS = [480, 720, 960, 1280, 1600, 2000, 2600] as const;

export function imageSrcSet(image: NoteImage, widths: readonly number[] = IMAGE_WIDTHS): string {
  const max = imageSize(image)?.width ?? Infinity;
  const usable = widths.filter((w) => w <= max);
  const list = usable.length ? usable : [Math.min(widths[0], max)];
  return list.map((w) => `${imageUrl(image, w)} ${w}w`).join(', ');
}

/** A 1200×630 share card cut around the hotspot (the studio's focus), inside
 *  the editor's crop. */
export function shareCardUrl(image: NoteImage): string {
  const url = image.asset?.url;
  const rect = imageRect(image);
  if (!url || !rect || !image.asset?.width || !image.asset?.height) return '';
  const ratio = 1200 / 630;
  const w = rect.w / rect.h > ratio ? Math.round(rect.h * ratio) : rect.w;
  const h = rect.w / rect.h > ratio ? rect.h : Math.round(rect.w / ratio);
  const cx = (image.hotspot?.x ?? 0.5) * image.asset.width;
  const cy = (image.hotspot?.y ?? 0.5) * image.asset.height;
  const x = Math.round(Math.min(Math.max(cx - w / 2, rect.x), rect.x + rect.w - w));
  const y = Math.round(Math.min(Math.max(cy - h / 2, rect.y), rect.y + rect.h - h));
  return `${url}?rect=${x},${y},${w},${h}&w=1200&h=630&fit=crop&q=85&auto=format`;
}

// ─── Places ───────────────────────────────────────────────────────────────

/** The inline style that prints a tag or card on its chapter's stock. */
export function placeStockStyle(slug: string): string {
  return `--stub-paper: ${stockPaper(slug)};`;
}

// ─── The body, planned for the page ─────────────────────────────────────

export type NoteTextStyle = 'normal' | 'h2' | 'h3' | 'blockquote';

export type NotePiece =
  | { kind: 'text'; key: string; style: NoteTextStyle; html: string; lang?: 'zh-Hans'; lede: boolean; endmark: boolean }
  | { kind: 'figure'; key: string; image: NoteImageBlock; number: number; width: number; height: number; lang?: 'zh-Hans' }
  | { kind: 'quote'; key: string; text: string; attribution: string | null; lang?: 'zh-Hans'; textZh?: string };

const TEXT_STYLES = new Set<NoteTextStyle>(['normal', 'h2', 'h3', 'blockquote']);

/** The body as the page prints it: every block it can print, in order, with
 *  its inline HTML, its language, the figures numbered 01, 02…, the first
 *  paragraph set as the lede when it opens the note, and the end mark after
 *  the last words. Empty paragraphs (a stray Return in the editor) are
 *  dropped; a list item prints as a paragraph.
 *  The end mark closes the text, so it goes on the last paragraph (or quoted
 *  passage) only when nothing but photographs follows it; a note that ends
 *  on a crosshead or a pull quote gets none rather than a mark mid-page
 *  (endmarkMissing tells the build). */
export function planBody(body: readonly NoteBodyBlock[]): NotePiece[] {
  const pieces: NotePiece[] = [];
  let figures = 0;
  for (const block of body) {
    if (isTextBlock(block)) {
      const text = blockText(block);
      if (!text.trim()) continue;
      const style = TEXT_STYLES.has(block.style as NoteTextStyle) && !block.listItem ? (block.style as NoteTextStyle) : 'normal';
      pieces.push({
        kind: 'text',
        key: block._key,
        style,
        html: renderInline(block),
        lang: langOf(text),
        lede: false,
        endmark: false,
      });
    } else if (isImageBlock(block)) {
      const size = imageSize(block);
      if (!size) continue;
      figures += 1;
      pieces.push({ kind: 'figure', key: block._key, image: block, number: figures, ...size, lang: langOf(block.caption) });
    } else if (isPullQuote(block)) {
      const twin = twinOf(block.text, block.textZh);
      pieces.push({
        kind: 'quote',
        key: block._key,
        text: pullQuoteText(block.text ?? ''),
        attribution: block.attribution?.trim() || null,
        lang: langOf(block.text),
        ...(twin ? { textZh: pullQuoteText(twin) } : {}),
      });
    }
  }
  const first = pieces[0];
  if (first?.kind === 'text' && first.style === 'normal') first.lede = true;
  const last = [...pieces].reverse().find((piece) => piece.kind !== 'figure');
  if (last?.kind === 'text' && (last.style === 'normal' || last.style === 'blockquote')) last.endmark = true;
  return pieces;
}

/** True when the note has words but no end mark: it ends on a crosshead or a
 *  pull quote (the build warns; the page is still right). */
export function endmarkMissing(pieces: readonly NotePiece[]): boolean {
  return pieces.some((piece) => piece.kind === 'text') && !pieces.some((piece) => piece.kind === 'text' && piece.endmark);
}

// ─── The list, planned ────────────────────────────────────────────────────

export type NoteListRow =
  | { kind: 'entry'; note: Note }
  | { kind: 'lead'; note: Note }
  | { kind: 'row'; note: Note; yearBefore: string | null };

/** The year a note is filed under, in New York. */
export function noteYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', timeZone: TZ });
}

/** /notes, newest first. Up to three notes, each is a full entry (title,
 *  dek, places, cover). From four on, the newest leads as a full entry and the
 *  rest become contents rows (number and date, title, places), with a year
 *  line wherever the year changes — ten notes stay a page, not ten screens. */
export function planList(notes: readonly Note[], contentsFrom = 4): NoteListRow[] {
  if (notes.length < contentsFrom) return notes.map((note) => ({ kind: 'entry', note }));
  let year = noteYear(notes[0].publishedAt);
  return notes.map((note, index) => {
    if (index === 0) return { kind: 'lead', note };
    const y = noteYear(note.publishedAt);
    const yearBefore = y && y !== year ? y : null;
    year = y || year;
    return { kind: 'row', note, yearBefore };
  });
}

/** Portrait, landscape or square — decides how wide a picture is set. */
export function orientation(width: number, height: number): 'portrait' | 'landscape' | 'square' {
  const r = width / height;
  if (r > 1.05) return 'landscape';
  if (r < 0.95) return 'portrait';
  return 'square';
}
