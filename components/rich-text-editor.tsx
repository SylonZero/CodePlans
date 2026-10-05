'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  ChevronDown,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Table as TableIcon,
  Undo,
  Redo,
  Workflow,
  Link2,
  Minus,
  RemoveFormatting,
  FileCode2,
  Rows3,
  Columns3,
  Trash2,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { editorExtensions, MARKED_OPTIONS } from '@/lib/editor-extensions'
import { installMarkdownEscaping, tidyMarkdown } from '@/lib/markdown-escape'
import { shouldParsePastedMarkdown } from '@/lib/markdown-paste'

/**
 * Pasting markdown source (from a code editor, a chat, a README) parses it into
 * formatting instead of inserting the raw characters. Structured HTML from a
 * web page or doc keeps the default handling, and code blocks always take text
 * as is.
 */
const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste: (_view, event) => {
            if (editor.isActive('codeBlock') || editor.isActive('code')) return false
            const text = event.clipboardData?.getData('text/plain') ?? ''
            const html = event.clipboardData?.getData('text/html') ?? ''
            if (!shouldParsePastedMarkdown(text, html)) return false
            editor.chain().focus().insertContent(text, { contentType: 'markdown' }).run()
            return true
          },
        },
      }),
    ]
  },
})

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

/**
 * Markdown-canonical rich text editor: takes markdown in, emits markdown out
 * (the same dialect the MCP server reads/writes). GFM: tables, task lists,
 * strikethrough. Pasted markdown is parsed, and a Markdown mode edits the
 * source directly.
 */
export function RichTextEditor({
  value,
  onChange,
  autoFocus = false,
  size = 'default',
  className,
}: {
  /** Markdown source. Read once on mount — the editor owns the content after that. */
  value: string
  onChange: (markdown: string) => void
  autoFocus?: boolean
  /** `fill` grows with its container (for full-height panels). */
  size?: 'default' | 'tall' | 'fill'
  className?: string
}) {
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [source, setSource] = useState('')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [...editorExtensions(), Markdown.configure({ markedOptions: MARKED_OPTIONS }), MarkdownPaste],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onCreate: ({ editor }) => installMarkdownEscaping(editor.markdown),
    onUpdate: ({ editor }) => onChangeRef.current(tidyMarkdown(editor.getMarkdown())),
    editorProps: {
      attributes: {
        class: cn(
          'markdown-body max-w-none focus:outline-none px-3 py-2',
          size === 'tall' ? 'min-h-56' : size === 'fill' ? 'min-h-[50vh]' : 'min-h-28',
        ),
      },
    },
  })

  function toggleSource() {
    if (!editor) return
    if (mode === 'rich') {
      setSource(tidyMarkdown(editor.getMarkdown()))
      setMode('source')
    } else {
      editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: true })
      onChangeRef.current(tidyMarkdown(editor.getMarkdown()))
      setMode('rich')
    }
  }

  return (
    <div className={cn('flex flex-col rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring', className)}>
      {editor && <Toolbar editor={editor} mode={mode} onToggleSource={toggleSource} />}
      {mode === 'source' ? (
        <textarea
          aria-label="Markdown source"
          spellCheck={false}
          value={source}
          onChange={(e) => { setSource(e.target.value); onChangeRef.current(e.target.value) }}
          className={cn(
            'w-full flex-1 resize-y bg-transparent px-3 py-2 font-mono text-sm leading-6 focus:outline-none',
            size === 'tall' ? 'min-h-56' : size === 'fill' ? 'min-h-[50vh]' : 'min-h-28',
          )}
        />
      ) : (
        <EditorContent editor={editor} className="flex-1" />
      )}
    </div>
  )
}

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="h-7 w-7"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

const Divider = () => <span className="mx-1 h-4 w-px bg-border" />

const BLOCK_TYPES = [
  { label: 'Text', level: 0 },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
] as const

function Toolbar({ editor, mode, onToggleSource }: { editor: Editor; mode: 'rich' | 'source'; onToggleSource: () => void }) {
  const c = () => editor.chain().focus()
  const source = mode === 'source'
  const level = ([1, 2, 3, 4] as const).find((l) => editor.isActive('heading', { level: l })) ?? 0
  const inTable = editor.isActive('table')

  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-border bg-background/95 px-1.5 py-1 backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={source}>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-[104px] justify-between px-2 text-xs" onMouseDown={(e) => e.preventDefault()} aria-label="Block type">
            {BLOCK_TYPES.find((b) => b.level === level)?.label}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          {BLOCK_TYPES.map((b) => (
            <DropdownMenuItem key={b.level} onSelect={() => (b.level === 0 ? c().setParagraph().run() : c().setHeading({ level: b.level }).run())}
              className={cn(b.level === 1 && 'text-lg font-semibold', b.level === 2 && 'text-base font-semibold', b.level >= 3 && 'font-medium')}>
              {b.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />
      <ToolbarButton title={`Bold (${mod}+B)`} disabled={source} active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Italic (${mod}+I)`} disabled={source} active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Strikethrough (${mod}+Shift+S)`} disabled={source} active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Inline code (${mod}+E)`} disabled={source} active={editor.isActive('code')} onClick={() => c().toggleCode().run()}>
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>
      <LinkButton editor={editor} disabled={source} />
      <Divider />
      <ToolbarButton title={`Bullet list (${mod}+Shift+8)`} disabled={source} active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Numbered list (${mod}+Shift+7)`} disabled={source} active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Task list (${mod}+Shift+9)`} disabled={source} active={editor.isActive('taskList')} onClick={() => c().toggleList('taskList', 'taskItem').run()}>
        <ListTodo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton title={`Quote (${mod}+Shift+B)`} disabled={source} active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Code block (${mod}+Alt+C)`} disabled={source} active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        <SquareCode className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Mermaid diagram"
        disabled={source}
        active={editor.isActive('codeBlock', { language: 'mermaid' })}
        onClick={() =>
          c()
            .insertContent({
              type: 'codeBlock',
              attrs: { language: 'mermaid' },
              content: [{ type: 'text', text: 'flowchart TD\n  A[Start] --> B[End]' }],
            })
            .run()
        }
      >
        <Workflow className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Insert table" disabled={source} active={inTable} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Divider" disabled={source} onClick={() => c().setHorizontalRule().run()}>
        <Minus className="h-3.5 w-3.5" />
      </ToolbarButton>
      {inTable && !source && (
        <>
          <Divider />
          <ToolbarButton title="Add row below" onClick={() => c().addRowAfter().run()}><BetweenHorizontalEnd className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton title="Add column right" onClick={() => c().addColumnAfter().run()}><BetweenVerticalEnd className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton title="Delete row" onClick={() => c().deleteRow().run()}><Rows3 className="h-3.5 w-3.5 text-destructive" /></ToolbarButton>
          <ToolbarButton title="Delete column" onClick={() => c().deleteColumn().run()}><Columns3 className="h-3.5 w-3.5 text-destructive" /></ToolbarButton>
          <ToolbarButton title="Delete table" onClick={() => c().deleteTable().run()}><Trash2 className="h-3.5 w-3.5 text-destructive" /></ToolbarButton>
        </>
      )}
      <Divider />
      <ToolbarButton title="Clear formatting" disabled={source} onClick={() => c().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Undo (${mod}+Z)`} disabled={source || !editor.can().undo()} onClick={() => c().undo().run()}>
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title={`Redo (${mod}+Shift+Z)`} disabled={source || !editor.can().redo()} onClick={() => c().redo().run()}>
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="ml-auto">
        <Button type="button" variant={source ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-pressed={source}
          title={source ? 'Back to the formatted view' : 'Edit the markdown source'} onMouseDown={(e) => e.preventDefault()} onClick={onToggleSource}>
          <FileCode2 className="h-3.5 w-3.5" />
          Markdown
        </Button>
      </div>
    </div>
  )
}

function LinkButton({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  useEffect(() => {
    if (open) setHref((editor.getAttributes('link').href as string | undefined) ?? '')
  }, [open, editor])
  function apply() {
    const url = href.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) chain.unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive('link')) chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    else chain.setLink({ href: url }).run()
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7"
          title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()}>
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => { e.preventDefault(); editor.commands.focus() }}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); apply() }}>
          <Input autoFocus aria-label="Link URL" placeholder="https://…" value={href} onChange={(e) => setHref(e.target.value)} className="h-8" />
          <Button type="submit" size="sm" className="h-8">{href.trim() ? 'Apply' : 'Remove'}</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
