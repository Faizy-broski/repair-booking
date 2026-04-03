// Widget pages are public iframe embeds — no tenant layout, no auth wrapper
export const metadata = {
  title: 'Widget',
  robots: 'noindex',
}

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
