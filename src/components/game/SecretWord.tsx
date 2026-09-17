interface SecretWordProps {
  word: string | null
  label?: string
  hidden?: boolean
}

export function SecretWord({ word, label = 'Your word', hidden = false }: SecretWordProps) {
  return (
    <div className="secret-word">
      <span className="secret-word__label">{label}</span>
      <span className="secret-word__value">
        {hidden ? '• • • • •' : (word ?? 'NO WORD')}
      </span>
    </div>
  )
}
