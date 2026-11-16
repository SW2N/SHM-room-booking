import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Phase 1 placeholder: proves the permanent link, publishing and the database connection work.
export default function App() {
  const [rooms, setRooms] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('rooms')
      .select('code', { count: 'exact', head: true })
      .then(({ count, error }) => (error ? setError(error.message) : setRooms(count ?? 0)))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '15vh auto', padding: 24 }}>
      <h1>SHM Room Booking</h1>
      <p>ระบบจองห้องประชุม — กำลังพัฒนา / coming soon</p>
      <p>{error ? `Database: ${error}` : rooms === null ? 'Connecting…' : `Connected: ${rooms} rooms`}</p>
    </main>
  )
}
