import { useState } from 'react'
import { errorMessage } from '../lib/errors'
import { t } from '../lib/i18n'
import { useSession } from '../state/session'
import { supabase } from '../supabase'
import { Modal } from './Modal'
import { useToast } from './Toast'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, lang, refreshProfile } = useSession()
  const toast = useToast()
  const [l, setL] = useState(profile?.lang ?? 'th')
  const [y, setY] = useState(profile?.year_style ?? 'BE')
  const [f, setF] = useState(profile?.date_format ?? 'long')

  async function save() {
    const { error } = await supabase.rpc('update_my_settings', { p_lang: l, p_year_style: y, p_date_format: f })
    if (error) return toast(errorMessage(error, lang), 'error')
    await refreshProfile()
    toast(t('saved', l))
    onClose()
  }

  return (
    <Modal open={open} title={t('settings', lang)} onClose={onClose}>
      <div className="form">
        <label>{t('language', lang)}
          <select value={l} onChange={(e) => setL(e.target.value as 'th' | 'en')}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>{t('yearStyle', lang)}
          <select value={y} onChange={(e) => setY(e.target.value as 'BE' | 'CE')}>
            <option value="BE">พ.ศ. (2569)</option>
            <option value="CE">ค.ศ. (2026)</option>
          </select>
        </label>
        <label>{t('dateFormat', lang)}
          <select value={f} onChange={(e) => setF(e.target.value as 'long' | 'numeric')}>
            <option value="long">24 พ.ย. 2569</option>
            <option value="numeric">24/11/2569</option>
          </select>
        </label>
        <div className="actions">
          <button onClick={onClose}>{t('cancel', lang)}</button>
          <button className="primary" onClick={save}>{t('save', lang)}</button>
        </div>
      </div>
    </Modal>
  )
}
