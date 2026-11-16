import { t } from '../lib/i18n'
import { useSession } from '../state/session'

/** What the booking colours mean, shown once above the room list and calendars. */
export function Legend() {
  const { lang } = useSession()
  return (
    <ul className="legend" aria-label={t('legend', lang)}>
      <li><span className="swatch mine" />{t('legendMine', lang)}</li>
      <li><span className="swatch other" />{t('legendOthers', lang)}</li>
      <li><span className="swatch held" />{t('held', lang)}</li>
      <li><span className="swatch off" />{t('legendClosed', lang)}</li>
    </ul>
  )
}
