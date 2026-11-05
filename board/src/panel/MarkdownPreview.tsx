// Rendered markdown (loaded on demand: react-markdown is the app's biggest dependency).
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Links open in a new tab. Raw HTML in the markdown is never rendered (react-markdown's default).
function Link({ href, title, children }: { href?: string; title?: string; children?: ReactNode }) {
  return (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

const COMPONENTS = { a: Link }
const PLUGINS = [remarkGfm]

export function MarkdownPreview({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
      {text}
    </Markdown>
  )
}
