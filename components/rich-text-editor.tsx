'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Button } from '@/components/ui/button'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Table as TableIcon,
  Undo,
  Redo,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Markdown-canonical rich text editor: takes markdown in, emits markdown out
 * (the same dialect the MCP server reads/writes). GFM: tables, task lists,
 * strikethrough.
 */
export function RichTextEditor({
  value,
  onChange,
  autoFocus = false,
  size = 'default',
}: {
  /** Markdown source. Read once on mount — the editor owns the content after that. */
  value: string
  onChange: (markdown: string) => void
  autoFocus?: boolean
  size?: 'default' | 'tall'
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm prose-invert max-w-none focus:outline-none px-3 py-2',
          '[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs [&_table]:text-xs',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1',
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1',
          '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_label]:mt-0.5',
          size === 'tall' ? 'min-h-56' : 'min-h-28',
        ),
      },
    },
  })

  return (
    <div className="rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
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
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus()
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()}>
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Task list" active={editor.isActive('taskList')} onClick={() => c().toggleList('taskList', 'taskItem').run()}>
        <ListTodo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton title="Blockquote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Code block" active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        <SquareCode className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Insert table"
        active={editor.isActive('table')}
        onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton title="Undo" disabled={!editor.can().undo()} onClick={() => c().undo().run()}>
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Redo" disabled={!editor.can().redo()} onClick={() => c().redo().run()}>
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  )
}
