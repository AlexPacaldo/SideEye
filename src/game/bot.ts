import type { Role } from './types'

const RELATED: Record<string, string[]> = {
  Beach: ['sand', 'waves', 'towel', 'sunny', 'shells', 'shore'],
  Ocean: ['deep', 'salt', 'current', 'blue', 'tide', 'sail'],
  Coffee: ['bitter', 'morning', 'mug', 'beans', 'steam', 'latte'],
  Tea: ['kettle', 'leaves', 'warm', 'herbal', 'cup', 'steep'],
  Pizza: ['slice', 'cheese', 'oven', 'pepperoni', 'dough', 'circle'],
  Burger: ['bun', 'patty', 'grill', 'ketchup', 'fries', 'stack'],
  Cat: ['purr', 'whiskers', 'litter', 'meow', 'claws', 'nap'],
  Dog: ['bark', 'leash', 'fetch', 'paws', 'loyal', 'vet'],
  Doctor: ['clinic', 'scrubs', 'checkup', 'patient', 'stethoscope'],
  Nurse: ['shift', 'care', 'ward', 'needle', 'kind'],
  Winter: ['snow', 'cold', 'scarf', 'frost', 'coat'],
  Autumn: ['leaves', 'orange', 'crisp', 'harvest', 'sweater'],
  Guitar: ['strings', 'strum', 'chords', 'rock', 'amp'],
  Violin: ['bow', 'strings', 'classical', 'chin', 'orchestra'],
  Rain: ['clouds', 'wet', 'puddles', 'drizzle', 'umbrella'],
  Snow: ['flakes', 'cold', 'shovel', 'white', 'sled'],
  Soccer: ['goal', 'field', 'kick', 'boots', 'referee'],
  Basketball: ['hoop', 'dribble', 'court', 'dunk', 'orange'],
  Sun: ['bright', 'hot', 'shine', 'day', 'rays'],
  Moon: ['night', 'crater', 'glow', 'orbit', 'silver'],
  Camera: ['lens', 'flash', 'click', 'photo', 'focus'],
  Mirror: ['reflect', 'glass', 'reverse', 'bathroom', 'vanity'],
  Apple: ['red', 'crunch', 'orchard', 'pie', 'seed'],
  Pear: ['green', 'juicy', 'orchard', 'soft', 'stem'],
}

const GENERIC = [
  'classic',
  'shiny',
  'expensive',
  'tiny',
  'messy',
  'loud',
  'sweet',
  'sharp',
  'bouncy',
  'fancy',
  'lucky',
  'spicy',
  'fuzzy',
  'heavy',
  'smooth',
  'bright',
  'weird',
  'cozy',
]

const MRWHITE = [
  'thing',
  'stuff',
  'vibes',
  'nice',
  'yes',
  'maybe',
  'sure',
  'whatever',
  'circle',
  'big',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function botClue(role: Role, word: string | null): string {
  if (role === 'mrwhite' || !word) return pick(MRWHITE)
  const related = RELATED[word]
  if (role === 'undercover') {
    return related && Math.random() < 0.55 ? pick(related) : pick(GENERIC)
  }
  if (related) return pick(related)
  return pick(GENERIC)
}

export function botGuess(secretWord: string, correctChance = 0.32): string {
  if (Math.random() < correctChance) return secretWord
  const related = RELATED[secretWord]
  if (related) return pick(related)
  return pick(GENERIC)
}
