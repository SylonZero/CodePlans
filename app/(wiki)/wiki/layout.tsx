import { authAdapter } from '@/lib/auth'
import { redirect } from 'next/navigation'
import './wiki.css'
export default async function WikiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await authAdapter.getUser())) redirect('/login')
  return (
    <div className="wiki-shell">
      <a href="#wiki-content" className="wiki-skip">
        Skip to content
      </a>
      {children}
    </div>
  )
}
