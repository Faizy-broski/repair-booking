// Soft tinted status chips for repair jobs (same mapping as the dashboard).
// Unknown or custom statuses fall back to neutral.
const REPAIR_STATUS_CHIP: Record<string, string> = {
  pending:       'bg-surface-container text-on-surface-variant',
  diagnosing:    'bg-primary/10 text-primary',
  waiting_parts: 'bg-amber-500/10 text-amber-600',
  in_progress:   'bg-blue-500/10 text-blue-600',
  repaired:      'bg-emerald-500/10 text-emerald-600',
  collected:     'bg-surface-container text-on-surface-variant',
  unrepairable:  'bg-red-500/10 text-red-600',
  refunded:      'bg-red-500/10 text-red-600',
}

export function repairStatusChip(name: string): string {
  return REPAIR_STATUS_CHIP[name.toLowerCase().replace(/[\s-]+/g, '_')] ?? 'bg-surface-container text-on-surface-variant'
}
