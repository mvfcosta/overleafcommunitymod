import type { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import getMeta from '@/utils/meta'

export default function HeaderLogoOrTitle({
  overleafLogo,
  customLogo,
  title,
}: Pick<DefaultNavbarMetadata, 'customLogo' | 'title'> & {
  overleafLogo?: string
}) {
  const { appName } = getMeta('ol-ExposedSettings')
  const logoUrl = customLogo ?? overleafLogo
  return (
    <a href="/" aria-label={appName} className="navbar-brand" style={{ display: 'flex', alignItems: 'center' }}>
      {(customLogo || !title) && (
        <div
          className="navbar-logo"
          style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : {}}
        />
      )}
      <img
        src="/img/SA01.gif"
        alt="UNESP"
        style={{ height: '24px', marginRight: '6px', flexShrink: 0 }}
      />
      {title && (
        <div className="navbar-title">
          <span>{title}</span>
        </div>
      )}
    </a>
  )
}
