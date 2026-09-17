import { ArrowLeft, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Friend } from '../backend'
import { Avatar } from '../components/ui/Avatar'
import { Loading } from '../components/ui/Loading'
import { useApp } from '../state/context'

export function FriendsScreen({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const { backend, toast } = useApp()
  const [friends, setFriends] = useState<Friend[] | null>(null)

  useEffect(() => {
    void backend.getFriends().then(setFriends)
  }, [backend])

  return (
    <div className="subscreen">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <header className="subscreen__head">
        <h1 className="t-title">Friends</h1>
        <p className="t-body">The people you blame for everything.</p>
      </header>

      {friends === null ? (
        <Loading label="Loading your crew…" />
      ) : friends.length === 0 ? (
        <div className="empty">
          <span className="empty__glyph" aria-hidden="true">
            👀
          </span>
          <span className="big-message">QUIET IN HERE…</span>
          <p className="t-body">Add some friends and cause problems together.</p>
          <button type="button" className="btn btn--primary" onClick={() => toast('Friends arrive with Supabase', 'success')}>
            <UserPlus size={18} /> FIND FRIENDS
          </button>
        </div>
      ) : (
        <ul className="friend-list">
          {friends.map((friend) => (
            <li key={friend.id} className="friend-row">
              <Avatar
                seed={friend.avatarSeed}
                name={friend.name}
                avatarUrl={friend.avatarUrl}
                size={52}
                state={friend.online ? 'default' : 'disconnected'}
              />
              <span className="col grow" style={{ gap: 2 }}>
                <span className="t-section">{friend.name}</span>
                <span className="t-muted" style={{ fontSize: '0.82rem' }}>
                  {friend.online ? 'In the lobby' : 'Offline'}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--soft btn--sm"
                onClick={() => toast(`Invite sent to ${friend.name}`, 'success')}
              >
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="subscreen__cta">
        <button type="button" className="btn btn--primary btn--block" onClick={onPlay}>
          Play a game
        </button>
      </div>
    </div>
  )
}
