import { AnimatePresence, motion } from 'framer-motion'
import {
  History,
  LogOut,
  Moon,
  Sun,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { useApp } from '../state/context'
import { AuthScreen } from '../screens/AuthScreen'
import { ClueRevealScreen } from '../screens/ClueRevealScreen'
import { ClueScreen } from '../screens/ClueScreen'
import { DiscussionScreen } from '../screens/DiscussionScreen'
import { EliminationScreen } from '../screens/EliminationScreen'
import { ContinueScreen } from '../screens/ContinueScreen'
import { FriendsScreen } from '../screens/FriendsScreen'
import { HistoryScreen } from '../screens/HistoryScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { LobbyScreen } from '../screens/LobbyScreen'
import { MrWhiteScreen } from '../screens/MrWhiteScreen'
import { RoleRevealScreen } from '../screens/RoleRevealScreen'
import { VoteRevealScreen } from '../screens/VoteRevealScreen'
import { VotingScreen } from '../screens/VotingScreen'
import { WinnerScreen } from '../screens/WinnerScreen'
import { Avatar } from './ui/Avatar'
import { Decor } from './ui/Decor'
import { Logo } from './ui/Logo'
import { Loading } from './ui/Loading'
import { Toasts } from './ui/Toasts'
import { PartyChat } from './chat/PartyChat'
import { VoiceChat } from './voice/VoiceChat'
import type { Phase } from '../game/types'

type View = 'home' | 'friends' | 'history' | 'auth'

type DecorVariant = 'home' | 'lobby' | 'game' | 'soft'

const PHASE_VARIANT: Partial<Record<Phase, DecorVariant>> = {
  lobby: 'lobby',
  roleReveal: 'game',
  clue: 'game',
  elimination: 'soft',
  postElimination: 'soft',
  discussion: 'soft',
  voting: 'game',
  gameOver: 'soft',
}

export function AppShell() {
  const { snapshot, ready, backend, safe } = useApp()
  const { theme, toggle } = useTheme()
  const [view, setView] = useState<View>('home')
  const room = snapshot.room

  if (!ready) {
    return (
      <div className="app">
        <div className="app__bg" />
        <Loading fullscreen label="Warming up the room…" />
      </div>
    )
  }

  const variant: DecorVariant = room
    ? (PHASE_VARIANT[room.phase] ?? 'soft')
    : 'home'

  return (
    <div className="app">
      <div className="app__bg" />
      <TopBar
        theme={theme}
        onToggleTheme={toggle}
        onNavigate={setView}
        inRoom={Boolean(room)}
      />
      <main className={`app__main ${room ? '' : 'app__main--wide'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={room ? `room-${room.phase}-${room.round}` : view}
            className="app__view"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {room ? (
              <GameRouter phase={room.phase} />
            ) : view === 'auth' ? (
              <AuthScreen onBack={() => setView('home')} />
            ) : view === 'friends' ? (
              <FriendsScreen onBack={() => setView('home')} onPlay={() => setView('home')} />
            ) : view === 'history' ? (
              <HistoryScreen onBack={() => setView('home')} onPlay={() => setView('home')} />
            ) : (
              <HomeScreen onNavigate={setView} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {room && (
        <div className="room-bar">
          {room.mode !== 'passplay' && (
            <span className="room-bar__code">{room.code}</span>
          )}
          <span className="room-bar__dot" aria-hidden="true" />
          <span className="room-bar__phase">
            {room.mode === 'passplay' ? 'PASS & PLAY' : `ROUND ${Math.max(1, room.round)}`}
          </span>
          <span className="grow" />
          <PartyChat />
          <VoiceChat />
          <button
            type="button"
            className="room-bar__leave"
            onClick={() => {
              setView('home')
              void safe(backend.leaveRoom())
            }}
          >
            Leave
          </button>
        </div>
      )}

      <Decor variant={variant} />
      <Toasts />
    </div>
  )
}

function GameRouter({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'lobby':
      return <LobbyScreen />
    case 'roleReveal':
      return <RoleRevealScreen />
    case 'clue':
      return <ClueScreen />
    case 'clueReveal':
      return <ClueRevealScreen />
    case 'discussion':
      return <DiscussionScreen />
    case 'voting':
    case 'runoff':
      return <VotingScreen />
    case 'voteReveal':
      return <VoteRevealScreen />
    case 'elimination':
      return <EliminationScreen />
    case 'postElimination':
      return <ContinueScreen />
    case 'mrWhiteGuess':
      return <MrWhiteScreen />
    case 'gameOver':
      return <WinnerScreen />
    default:
      return null
  }
}

function TopBar({
  theme,
  onToggleTheme,
  onNavigate,
  inRoom,
}: {
  theme: string
  onToggleTheme: () => void
  onNavigate: (v: View) => void
  inRoom: boolean
}) {
  const { snapshot, backend, safe } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const user = snapshot.user

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__logo"
        onClick={() => !inRoom && onNavigate('home')}
        style={{ cursor: inRoom ? 'default' : 'pointer', background: 'none', border: 'none' }}
        aria-label="Side Eye home"
      >
        <Logo size={34} />
      </button>
      <span className="grow" />
      <button
        type="button"
        className="btn btn--icon btn--ghost"
        onClick={onToggleTheme}
        aria-label="Toggle dark mode"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {user ? (
        <div className="account" ref={menuRef}>
          <button
            type="button"
            className="account__button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Avatar seed={9} name={user.name} avatarUrl={user.avatarUrl} size={36} />
            <span className="account__name">{user.name}</span>
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="account__menu"
                role="menu"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <span className="account__meta">
                  {user.isGuest ? 'Guest player' : user.email}
                </span>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate('friends') }}>
                  <Users size={17} /> Friends
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate('history') }}>
                  <History size={17} /> Game history
                </button>
                <hr className="divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="account__danger"
                  onClick={() => { setMenuOpen(false); void safe(backend.signOut()) }}
                >
                  <LogOut size={17} /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <button type="button" className="btn btn--soft btn--sm" onClick={() => onNavigate('auth')}>
          <UserRound size={16} /> Sign in
        </button>
      )}
    </header>
  )
}
