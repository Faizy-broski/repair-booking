export const metadata = {
  title: 'Customer Portal',
  description: 'View your repairs, invoices and account history',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {children}
    </div>
  )
}
