import { cn } from '@/lib/utils'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  size?: 'sm' | 'md'
  color?: 'teal' | 'blue' | 'purple'
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

const trackSize = { sm: 'h-5 w-9', md: 'h-6 w-11' }
const thumbSize = { sm: 'after:h-4 after:w-4 after:left-[2px] after:top-[2px]', md: 'after:h-[18px] after:w-[18px] after:left-[3px] after:top-[3px]' }
const thumbTranslate = { sm: 'peer-checked:after:translate-x-full', md: 'peer-checked:after:translate-x-5' }
const checkedColor = { teal: 'peer-checked:bg-brand-teal', blue: 'peer-checked:bg-blue-600', purple: 'peer-checked:bg-purple-600' }

export function Toggle({ checked, onChange, label, size = 'sm', color = 'teal', disabled, id, ...rest }: ToggleProps) {
  return (
    <label className={cn('relative inline-flex items-center gap-2', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      {label && <span className="text-sm font-medium text-gray-600">{label}</span>}
      <input
        id={id}
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        {...rest}
      />
      <div
        className={cn(
          'relative peer rounded-full bg-gray-200 transition-colors',
          "after:absolute after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-['']",
          trackSize[size], thumbSize[size], thumbTranslate[size], checkedColor[color]
        )}
      />
    </label>
  )
}
