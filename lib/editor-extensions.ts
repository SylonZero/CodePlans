// The rich text editor's schema, shared by the editor component and the tests
// that round-trip markdown through it.
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'

export const MARKED_OPTIONS = { breaks: true, gfm: true } as const

export function editorExtensions() {
  return [
    StarterKit.configure({
      // Underline has no markdown form; keep the document markdown-canonical.
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      heading: { levels: [1, 2, 3, 4] },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ]
}
