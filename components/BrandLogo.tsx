'use client'

const logoSrc = 'https://3kings-site-report.vercel.app/api/brand-logo-png'

export default function BrandLogo({ className='' }: { className?: string }) {
  return <img className={className} src={logoSrc} alt="3 Kings Construction" />
}
