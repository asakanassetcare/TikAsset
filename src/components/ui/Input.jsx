import { forwardRef } from 'react'

const Input = forwardRef(function Input(
  { label, error, hint, required, className = '', wrapperClass = '', phone, onChange, ...props },
  ref,
) {
  function handleChange(e) {
    if (phone) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10)
    onChange?.(e)
  }

  return (
    <div className={`flex flex-col gap-1 ${wrapperClass}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        inputMode={phone ? 'numeric' : undefined}
        maxLength={phone ? 10 : undefined}
        onChange={handleChange}
        className={`
          h-9 w-full rounded-lg border px-3 text-sm
          bg-white text-gray-900 placeholder:text-gray-400
          border-gray-300
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-500
          ${error ? 'border-red-400 focus:ring-red-400' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
})

export default Input
