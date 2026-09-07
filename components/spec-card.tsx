import { MarkdownContent } from '@/components/markdown-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, ExternalLink } from 'lucide-react'

/**
 * Read-only fallback for deprecated specUrl citations. Native specs use the
 * shared Markdown renderer and are edited through the Specs panel.
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
            <MarkdownContent>{markdown}</MarkdownContent>
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
