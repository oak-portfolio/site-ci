import { OAK_DIAGRAM_SIZES, type OakDiagramDrawn, type OakDiagramRecordPreset, type OakDiagramStep } from './diagram.ts';
import { oakHoldsLabel } from './dated.ts';

export type OakDiagramShape = OakDiagramDrawn | OakDiagramRecordPreset;

/** Ticket 335: the words a lead may use for a how-it-works step instead of its label (qa/335/assumption.md); kept narrow, as a wrong match hides a step. */
const OAK_STEP_KIN: Readonly<Record<string, readonly string[]>> = {
  scan: ['capture', 'capturing', 'captured', 'photo'],
  classify: ['classifier', 'classification', 'classified', 'sort', 'sorting', 'sorted'],
  explain: ['explanation', 'explained', 'explaining'],
  record: ['save', 'saved', 'saving', 'store', 'stored', 'log', 'logged'],
  repeat: ['again', 'future', 'repeatable', 'recurring'],
};

function oakNamesStep(lead: string, label: string) {
  const words = label.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length > 0 && words.every(word => oakHoldsLabel(lead, word) || (OAK_STEP_KIN[word.toLowerCase()] ?? []).some(kin => oakHoldsLabel(lead, kin)));
}

/**
 * Ticket 310: what DiagramView draws for a preset, read by DiagramView.tsx and the pairwise printer. An untaught preset is
 * flow; radar and quadrant compare two or more cited work records and draw flow over one; a laid-out preset with no sizing row is flow.
 */
export function oakDiagramShape(preset: string | undefined, taught: readonly string[], records: number): OakDiagramShape {
  if (!preset || !taught.includes(preset)) return 'flow';
  if (preset === 'radar' || preset === 'quadrant') return records > 1 ? preset : 'flow';
  if (preset === 'mindmap' || preset === 'treeview') return preset;
  return preset in OAK_DIAGRAM_SIZES ? preset as OakDiagramDrawn : 'flow';
}

/**
 * The words a drawn Diagram shows, one line per printed row in the order it draws them: blockdiag a box per step with its
 * line, treeview the project's name then each part with its line, mindmap its part labels, radar and quadrant the compared
 * projects' names, any other shape one flow of labels. Fewer than two steps draw no figure.
 * Ticket 326 (ruling A): that flow line (flow and layers) is nothing in a gap answer, or when every label sits in its lead sentence (309's word test).
 * Ticket 335: or when the lead names every label by a step word's kin.
 */
export function oakDiagramWords(shape: OakDiagramShape, { name, steps, names, lead = '', gap = false }: Readonly<{ name: string; steps: readonly OakDiagramStep[]; names: readonly string[]; lead?: string; gap?: boolean }>) {
  if (steps.length < 2) return [];
  if (shape === 'blockdiag') return steps.map(step => `${step.label}: ${step.description}`);
  if (shape === 'treeview') return [name, ...steps.map(step => `${step.label}: ${step.description}`)];
  if (shape === 'mindmap') return [steps.map(step => step.label).join(' / ')];
  if (shape === 'radar' || shape === 'quadrant') return [names.join(', ')];
  if (gap || steps.every(step => oakNamesStep(lead, step.label))) return [];
  return [steps.map(step => step.label).join(' -> ')];
}
