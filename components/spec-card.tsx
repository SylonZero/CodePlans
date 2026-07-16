import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, ExternalLink } from 'lucide-react'

/**
 * Read-only rendering of a linked spec. Authored in git (or any doc tool);
 * CodePlans displays, never edits — see docs/guides/using-specs.md.
 */
export function SpecCard({ specUrl, markdown }: { specUrl: string; markdown: string | null }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Design Spec
          <a
            href={specUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-xs font-normal hover:text-accent transition-colors"
          >
            Open source file
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {markdown ? (
          <div className="prose prose-sm prose-invert max-w-none max-h-[480px] overflow-y-auto [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_code]:text-xs [&_table]:text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Spec linked but not renderable here — open the source file above. (Private-repo specs
            render when an integration connection covers the repo.)
          </p>
        )}
      </CardContent>
    </Card>
  )
}
