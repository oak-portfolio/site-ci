import { oakReadsAsRole } from "./oakDocumentsWorkspace";

/** The counter shows from this share of the message cap (PR 1d). 80 percent of 4,000 is 3,200. */
export const OAK_COUNTER_SHARE = 0.8;
export const oakCounterStart = (limit: number) => Math.ceil(limit * OAK_COUNTER_SHARE);
export const oakCounterShown = (length: number, limit: number) => length >= oakCounterStart(limit);

/** A pasted block shorter than this is a question or a note, never offered as a job post. */
export const OAK_JOB_POST_MIN_CHARACTERS = 240;
/** A job post names its requirements, its duties or a seniority title. "Role" and "2 years" alone are just a question. */
const jobPostCue = [/\b(?:requirements?|qualifications?|must[- ]haves?|nice[- ]to[- ]haves?)\b/i, /\b(?:responsibilities|what you(?:'|\u2019)ll do|you will)\b/i,
  /\b(?:senior|staff|principal|lead|head of)\b[^.\n]{0,40}\b(?:engineer|designer|developer|manager|scientist|researcher)\b/i];
/** Pasted text that reads like a job post (several cues, at least one of them a title, requirements or duties) and is long enough to be one. */
export const oakLooksLikeJobPost = (text: string) => text.trim().length >= OAK_JOB_POST_MIN_CHARACTERS && oakReadsAsRole(text) && jobPostCue.some(pattern => pattern.test(text));

/** The file types Private documents takes, the same list as the paperclip's file picker. */
export const OAK_DOCUMENT_FILE_LIMIT = 3;
const documentExtension = /\.(?:txt|docx|pdf)$/i;
export function oakSplitDocumentFiles(files: readonly File[]) {
  const readable = files.filter(file => documentExtension.test(file.name));
  return { files: readable.slice(0, OAK_DOCUMENT_FILE_LIMIT), skipped: files.length - Math.min(readable.length, OAK_DOCUMENT_FILE_LIMIT) };
}

/** The files in a paste or drop; none when it carries only text. */
export const oakTransferFiles = (transfer: DataTransfer | null) => transfer ? [...transfer.files] : [];
export const oakTransferHasFiles = (transfer: DataTransfer | null) => Boolean(transfer && [...transfer.types].includes("Files"));
