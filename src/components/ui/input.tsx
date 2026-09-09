import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, type, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-on-surface-variant">
            {label}
            {props.required && <span className="ml-1 text-error">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            type={resolvedType}
            ref={ref}
            className={cn(
              'flex h-9 w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-outline',
              'focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20',
              'disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
              error && 'border-error focus:border-error focus:ring-error/20',
              isPassword && 'pr-9',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
