'use client'

import { useState } from 'react'
import { RichTextEditor } from '@/components/rich-text-editor'

/**
 * RichTextEditor adapter for FormData-based forms: mirrors the markdown into
 * a hidden input so form submit / onBlur-commit flows pick it up unchanged.
 */
export function RichTextField({
  name,
  defaultValue = '',
  size = 'default',
}: {
  name: string
  defaultValue?: string
  size?: 'default' | 'tall'
}) {
  const [markdown, setMarkdown] = useState(defaultValue)
  return (
    <div>
      <input type="hidden" name={name} value={markdown} readOnly />
      <RichTextEditor value={defaultValue} onChange={setMarkdown} size={size} />
    </div>
  )
}
