'use client'

import { Field } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CATEGORY_LIST, categoryMeta } from '@/constants/categories'
import type { ExpenseCategory } from '@/types'

export function CategorySelector({
  value,
  onChange,
  id = 'category',
}: {
  value: ExpenseCategory
  onChange: (value: ExpenseCategory) => void
  id?: string
}) {
  const meta = categoryMeta(value)
  const Icon = meta.icon

  return (
    <Field label="Category" htmlFor={id}>
      <Select value={value} onValueChange={(next) => onChange(next as ExpenseCategory)}>
        <SelectTrigger id={id}>
          {/* The selected item's own icon would render inside SelectValue, so
              the trigger renders the label itself and supplies one icon. */}
          <span className="flex items-center gap-2 truncate">
            <Icon className="size-4 shrink-0" style={{ color: `var(--chart-${meta.chart})` }} aria-hidden />
            <SelectValue aria-label={meta.label}>{meta.label}</SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_LIST.map((category) => {
            const CategoryIcon = category.icon
            return (
              <SelectItem key={category.key} value={category.key}>
                <span className="flex items-center gap-2">
                  <CategoryIcon
                    className="size-4"
                    style={{ color: `var(--chart-${category.chart})` }}
                    aria-hidden
                  />
                  {category.label}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Small square icon chip used in lists and detail headers. */
export function CategoryIconChip({
  category,
  size = 'md',
}: {
  category: ExpenseCategory
  size?: 'sm' | 'md' | 'lg'
}) {
  const meta = categoryMeta(category)
  const Icon = meta.icon
  const dimensions = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  const iconSize = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-5' : 'size-[18px]'

  return (
    <span
      className={`flex ${dimensions} shrink-0 items-center justify-center rounded-lg`}
      style={{
        backgroundColor: `color-mix(in oklab, var(--chart-${meta.chart}) 14%, transparent)`,
        color: `var(--chart-${meta.chart})`,
      }}
      aria-hidden
    >
      <Icon className={iconSize} />
    </span>
  )
}
