import { ArrowLeft, Search } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Friend, PlayerSearchResult } from '../backend'
import { Avatar } from '../components/ui/Avatar'
import { Loading } from '../components/ui/Loading'
import { useApp } from '../state/context'

function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 60
  }
  return h
}

export function FriendsScreen({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const { backend, toast } = useApp()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  const load = useCallback(() => {
    void backend.getFriends().then(setFriends)
  }, [backend])

  useEffect(load, [load])

  const onSearch = (e?: FormEvent) => {
    e?.preventDefault()
    setSearching(true)
    void backend
      .searchPlayers(query)
      .then((r) => setResults(r))
      .finally(() => setSearching(false))
  }

  const add = async (id: string, name: string) => {
    try {
      await backend.addFriend(id)
      toast(`Added ${name} to your crew`, 'success')
      setQuery('')
      setResults(null)
      load()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add friend.', 'danger')
    }
  }

  const remove = async (id: string) => {
    try {
      await backend.removeFriend(id)
      toast('Removed from your crew', 'success')
      load()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not remove friend.', 'danger')
    }
  }

  const friendIds = new Set((friends ?? []).map((f) => f.id))

  return (
    <div className="subscreen">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <header className="subscreen__head">
        <h1 className="t-title">Friends</h1>
        <p className="t-body">The people you blame for everything.</p>
      </header>

      <form className="friend-search" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 32))}
          placeholder="Add a friend by username"
          aria-label="Search players by username"
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={searching || !query.trim()}
        >
          <Search size={16} /> SEARCH
        </button>
      </form>

      {results !== null && (
        <ul className="friend-list">
          {results.length === 0 ? (
            <li className="friend-row">
              <span className="t-muted">No players found with that name.</span>
            </li>
          ) : (
            results.map((p) => {
              const added = friendIds.has(p.id)
              return (
                <li key={p.id} className="friend-row">
                  <Avatar seed={seedOf(p.id)} name={p.name} avatarUrl={p.avatarUrl} size={52} />
                  <span className="col grow" style={{ gap: 2 }}>
                    <span className="t-section">{p.name}</span>
                    <span className="t-muted" style={{ fontSize: '0.82rem' }}>
                      {added ? 'Already friends' : 'Found player'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--soft btn--sm"
                    disabled={added}
                    onClick={() => void add(p.id, p.name)}
                  >
                    {added ? 'Added' : 'Add'}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}

      {friends === null ? (
        <Loading label="Loading your crew…" />
      ) : friends.length === 0 ? (
        <div className="empty">
          <span className="empty__glyph" aria-hidden="true">
            👀
          </span>
          <span className="big-message">QUIET IN HERE…</span>
          <p className="t-body">Search above to add players and cause problems together.</p>
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
                className="btn btn--ghost btn--sm"
                onClick={() => void remove(friend.id)}
              >
                Remove
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