import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TagInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const TagInput = React.forwardRef<HTMLInputElement, TagInputProps>(
  ({ className, label, value, onChange, placeholder, ...props }, ref) => {
    const [inputValue, setInputValue] = React.useState("")
    const inputRef = React.useRef<HTMLInputElement>(null)

    // Merge refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (inputValue.trim() && !value) {
          onChange?.(inputValue.trim())
          setInputValue("")
        }
      }
      if (e.key === 'Backspace' && !inputValue && value) {
        onChange?.("")
      }
    }

    const handleBlur = () => {
      if (inputValue.trim() && !value) {
        onChange?.(inputValue.trim())
        setInputValue("")
      }
    }

    const focusInput = () => {
      if (!value) {
        inputRef.current?.focus()
      }
    }

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-on-surface-variant">
            {label}
          </label>
        )}
        <div
          onClick={focusInput}
          className={cn(
            "flex min-h-10 w-full flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-1.5 text-sm transition-colors focus-within:border-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/20 cursor-text",
            className
          )}
        >
          {value ? (
            <div className="flex h-[26px] items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange?.("")
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                className="flex items-center justify-center rounded-full hover:bg-primary/15 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
              <span>{value}</span>
            </div>
          ) : null}
          {!value && (
            <input
              {...props}
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-w-[120px]"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
          )}
        </div>
      </div>
    )
  }
)
TagInput.displayName = "TagInput"
