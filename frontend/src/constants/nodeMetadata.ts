/**
 * Single source of truth for node icons, colors, and labels.
 * Previously duplicated across NodeConfigPanel, StepHistory, TopBar,
 * HomePage, and CanvasToolbar.
 */
import type { NodeType } from '../types'

export interface NodeMeta {
  icon: string
  label: string
  /** CSS class for the colored type label (step-label-*) */
  labelClass: string
  /** Tailwind text color class for the node header */
  colorClass: string
  /** CSS class for the transform chip pill (transform-chip-*) — undefined for source/output */
  chipClass?: string
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  source: {
    icon: '🗃️',
    label: 'Source',
    labelClass: 'step-label-source',
    colorClass: 'text-[#4fc1ff]',
  },
  filter: {
    icon: '🔽',
    label: 'Filter',
    labelClass: 'step-label-filter',
    colorClass: 'text-[#dcdcaa]',
    chipClass: 'transform-chip-filter',
  },
  join: {
    icon: '🔗',
    label: 'Join',
    labelClass: 'step-label-join',
    colorClass: 'text-[#4ec9b0]',
    chipClass: 'transform-chip-join',
  },
  aggregate: {
    icon: '∑',
    label: 'Aggregate',
    labelClass: 'step-label-aggregate',
    colorClass: 'text-[#c39dff]',
    chipClass: 'transform-chip-aggregate',
  },
  select: {
    icon: '📋',
    label: 'Select',
    labelClass: 'step-label-select',
    colorClass: 'text-[#9cdcfe]',
    chipClass: 'transform-chip-select',
  },
  transform: {
    icon: '⚡',
    label: 'Transform',
    labelClass: 'step-label-transform',
    colorClass: 'text-[#c586c0]',
    chipClass: 'transform-chip-transform',
  },
  deduplicate: {
    icon: '⊘',
    label: 'Deduplicate',
    labelClass: 'step-label-deduplicate',
    colorClass: 'text-[#dcdcaa]',
    chipClass: 'transform-chip-deduplicate',
  },
  output: {
    icon: '🎯',
    label: 'Output',
    labelClass: 'step-label-output',
    colorClass: 'text-[var(--success)]',
  },
}

/** Role badge color classes */
export const ROLE_COLOR: Record<string, string> = {
  admin: 'text-[#f44747]',
  analyst: 'text-[#4fc1ff]',
  viewer: 'text-[#969696]',
}

/** Toolbar step definitions (excludes source and output — handled separately) */
export const TOOLBAR_STEP_DEFS: { type: NodeType; label: string; icon: string }[] = [
  { type: 'filter', label: 'Filter', icon: '🔽' },
  { type: 'join', label: 'Join', icon: '🔗' },
  { type: 'transform', label: 'Transform', icon: '⚡' },
  { type: 'aggregate', label: 'Aggregate', icon: '∑' },
  { type: 'deduplicate', label: 'Deduplicate', icon: '⊘' },
  { type: 'select', label: 'Select', icon: '📋' },
]
