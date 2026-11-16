import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DateOpts, Lang } from '../lib/dates'
import { supabase } from '../supabase'

export type Profile = {
  id: string
  email: string
  display_name: string
  department: string | null
  role: 'user' | 'admin'
  lang: Lang
  year_style: 'BE' | 'CE'
  date_format: 'long' | 'numeric'
  no_show_streak: number
  banned_until: string | null
  is_demo: boolean
}

type SessionValue = {
  session: Session | null
  ready: boolean
  recovering: boolean
  profile: Profile | null
  lang: Lang
  opts: DateOpts
  isAdmin: boolean
  setGuestLang: (l: Lang) => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  doneRecovering: () => void
}

const Ctx = createContext<SessionValue | null>(null)

function storedLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'th'
  } catch {
    return 'th'
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [guestLang, setGuest] = useState<Lang>(storedLang)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session) return setProfile(null)
    const { data } = await supabase.rpc('my_profile')
    setProfile((data as Profile | null) ?? null)
  }, [session])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const value = useMemo<SessionValue>(() => {
    const lang = profile?.lang ?? guestLang
    return {
      session,
      ready,
      recovering,
      profile,
      lang,
      opts: { lang, year: profile?.year_style ?? 'BE', format: profile?.date_format ?? 'long' },
      isAdmin: profile?.role === 'admin',
      setGuestLang: (l) => {
        setGuest(l)
        try {
          localStorage.setItem('lang', l)
        } catch {
          /* storage unavailable: keep it in memory */
        }
      },
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut()
        setProfile(null)
      },
      doneRecovering: () => setRecovering(false),
    }
  }, [session, ready, recovering, profile, guestLang, refreshProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}
